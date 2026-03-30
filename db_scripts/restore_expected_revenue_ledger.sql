-- ====================================================================================
-- KHÔI PHỤC BỘ NÃO DỰ THU THEO HIẾN PHÁP (DUTHU.MD & RULE.MD)
-- Trích dẫn Điều 7 (Bảo tồn di sản) & Điều 8 (Bộ não Backend)
-- Mô tả: Khôi phục cơ chế Sổ cái (Ledger) và Trigger để đảm bảo tính lịch sử và reset theo Night Audit.
-- ====================================================================================

-- 1. Khôi phục các Trigger (Theo duthu.md Chương 3)
CREATE OR REPLACE TRIGGER trg_expected_revenue_bookings
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_bookings();

CREATE OR REPLACE TRIGGER trg_expected_revenue_milestones
AFTER INSERT ON public.cash_flow
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_milestones();

CREATE OR REPLACE TRIGGER trg_expected_revenue_services
AFTER INSERT OR UPDATE OR DELETE ON public.booking_services
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_services();

-- 2. Cập nhật RPC tính Tổng Dự Thu (Đọc từ Sổ cái Ledger)
DROP FUNCTION IF EXISTS public.fn_get_daily_expected_revenue(uuid);
CREATE OR REPLACE FUNCTION public.fn_get_daily_expected_revenue(p_hotel_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
    v_hotel_id uuid;
    v_threshold timestamptz;
    v_total numeric := 0;
BEGIN
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());
    v_threshold := public.fn_get_current_night_audit_threshold(v_hotel_id);

    -- Tính tổng biến động trong sổ cái kể từ mốc Night Audit (Theo duthu.md Chương 1)
    SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM public.daily_expected_ledger
    WHERE hotel_id = v_hotel_id 
      AND created_at >= v_threshold;

    RETURN v_total;
END;
$$;

-- 3. Cập nhật RPC lấy Chi tiết Dự Thu (Đọc từ Sổ cái Ledger)
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

    RETURN QUERY
    SELECT 
        l.id,
        l.booking_id,
        l.amount,
        l.description,
        l.event_type,
        l.created_at,
        r.room_number,
        c.full_name as customer_name
    FROM public.daily_expected_ledger l
    LEFT JOIN public.bookings b ON l.booking_id = b.id
    LEFT JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.customers c ON b.customer_id = c.id
    WHERE l.hotel_id = v_hotel_id 
      AND l.created_at >= v_threshold
    ORDER BY l.created_at DESC;
END;
$$;
