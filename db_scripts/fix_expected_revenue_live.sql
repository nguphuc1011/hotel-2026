-- ====================================================================================
-- NHẤT THỐNG BỘ NÃO TÍNH TOÁN DỰ THU (EXPECTED REVENUE LIVE 100%)
-- Căn cứ: Điều 11 (Nhất thống Billing Engine) & Điều 3 (Ưu tiên thực địa)
-- Mô tả: Thay thế cơ chế Ledger cộng dồn (dễ sai lệch) bằng cơ chế Tính toán LIVE từ Billing Engine.
-- ====================================================================================

-- 1. Hàm lấy mốc Night Audit hiện tại (để biết "Hôm nay" bắt đầu từ lúc nào)
CREATE OR REPLACE FUNCTION public.fn_get_current_night_audit_threshold(p_hotel_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_night_audit_time time;
    v_threshold timestamptz;
BEGIN
    SELECT COALESCE(night_audit_time, '04:00:00')::time INTO v_night_audit_time
    FROM public.settings WHERE hotel_id = p_hotel_id OR hotel_id IS NULL 
    ORDER BY hotel_id NULLS LAST LIMIT 1;

    v_threshold := ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + v_night_audit_time) AT TIME ZONE 'Asia/Ho_Chi_Minh';
    
    IF now() < v_threshold THEN
        v_threshold := v_threshold - INTERVAL '1 day';
    END IF;
    
    RETURN v_threshold;
END;
$$;

-- 2. Hàm tính TỔNG DỰ THU LIVE (Dùng cho Header)
DROP FUNCTION IF EXISTS public.fn_get_daily_expected_revenue(uuid);
CREATE OR REPLACE FUNCTION public.fn_get_daily_expected_revenue(p_hotel_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
    v_hotel_id uuid;
    v_threshold timestamptz;
    v_live_receivable numeric := 0;
    v_completed_revenue numeric := 0;
BEGIN
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());
    v_threshold := public.fn_get_current_night_audit_threshold(v_hotel_id);

    -- [A] Tiền phòng & Dịch vụ của các phòng đang ở (LIVE từ Billing Engine)
    -- Công thức: Tổng Bill - Tiền cọc đã đóng
    SELECT COALESCE(SUM(
        (bill.bill_data->>'total_amount')::numeric - (bill.bill_data->>'deposit_amount')::numeric
    ), 0) INTO v_live_receivable
    FROM public.bookings b
    CROSS JOIN LATERAL (SELECT public.calculate_booking_bill(b.id) as bill_data) bill
    WHERE b.status = 'checked_in' AND b.hotel_id = v_hotel_id;

    -- [B] Doanh thu thực tế đã thu từ các phòng checkout TRONG KỲ (từ mốc Night Audit)
    -- Chỉ tính các khoản 'Thanh toán' (Settlement) và 'Tiền cọc' (Deposit) của các booking đã xong
    SELECT COALESCE(SUM(amount), 0) INTO v_completed_revenue
    FROM public.cash_flow
    WHERE hotel_id = v_hotel_id 
      AND occurred_at >= v_threshold
      AND category IN ('Thanh toán', 'Tiền cọc')
      AND is_auto = true;

    RETURN v_live_receivable + v_completed_revenue;
END;
$$;

-- 3. Hàm lấy CHI TIẾT DỰ THU (Dùng cho Modal Chi tiết)
DROP FUNCTION IF EXISTS public.fn_get_daily_expected_ledger(uuid);
CREATE OR REPLACE FUNCTION public.fn_get_daily_expected_ledger(p_hotel_id uuid)
RETURNS TABLE (
    id uuid,
    booking_id uuid,
    amount numeric,
    description text,
    event_type text,
    created_at timestamptz,
    room_number text,
    customer_name text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
    v_hotel_id uuid;
    v_threshold timestamptz;
BEGIN
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());
    v_threshold := public.fn_get_current_night_audit_threshold(v_hotel_id);

    -- [A] Danh sách các phòng đang ở (Checked-in)
    RETURN QUERY
    SELECT 
        b.id as id,
        b.id as booking_id,
        ((bill.bill_data->>'total_amount')::numeric - (bill.bill_data->>'deposit_amount')::numeric) as amount,
        'Tiền phòng & Dịch vụ (Đang ở)'::text as description,
        'LIVE_STAY'::text as event_type,
        b.check_in_actual as created_at,
        r.room_number,
        c.full_name as customer_name
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.customers c ON b.customer_id = c.id
    CROSS JOIN LATERAL (SELECT public.calculate_booking_bill(b.id) as bill_data) bill
    WHERE b.status = 'checked_in' AND b.hotel_id = v_hotel_id
    AND ((bill.bill_data->>'total_amount')::numeric - (bill.bill_data->>'deposit_amount')::numeric) > 0;

    -- [B] Danh sách các giao dịch đã thu tiền thực tế (Checkout) trong kỳ
    RETURN QUERY
    SELECT 
        cf.id,
        cf.ref_id as booking_id,
        cf.amount,
        cf.description,
        'COMPLETED'::text as event_type,
        cf.occurred_at as created_at,
        r.room_number,
        COALESCE(cust.full_name, 'Khách lẻ') as customer_name
    FROM public.cash_flow cf
    LEFT JOIN public.bookings b ON cf.ref_id = b.id
    LEFT JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.customers cust ON b.customer_id = cust.id
    WHERE cf.hotel_id = v_hotel_id 
      AND cf.occurred_at >= v_threshold
      AND cf.category IN ('Thanh toán', 'Tiền cọc')
      AND cf.is_auto = true;
END;
$$;

-- 4. Dọn dẹp: Vì đã dùng LIVE nên không cần trigger Sổ cái nữa (Giảm tải cho DB)
-- Lưu ý: Không DROP bảng daily_expected_ledger để tránh lỗi các query cũ nếu có, 
-- nhưng các hàm trên sẽ không còn đọc từ bảng đó nữa.
DROP TRIGGER IF EXISTS trg_expected_revenue_bookings ON public.bookings;
DROP TRIGGER IF EXISTS trg_expected_revenue_milestones ON public.cash_flow;
DROP TRIGGER IF EXISTS trg_expected_revenue_services ON public.booking_services;
