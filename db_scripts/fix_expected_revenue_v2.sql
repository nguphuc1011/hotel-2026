-- ====================================================================================
-- BẢN VÁ LỖI DỰ THU TOÀN DIỆN (THEO ĐÚNG DUTHU.MD & RULE.MD)
-- Trích dẫn Điều 11 (Nhất thống Billing Engine) & Điều 7 (Bảo tồn di sản)
-- Mô tả: Khôi phục cơ chế Sổ cái (Ledger), sửa lỗi tính toán "tùm lum" bằng cách 
-- bám sát sự kiện và tránh cộng trùng.
-- ====================================================================================

-- 1. Hàm tính số tiền đã từng ghi nhận vào Dự thu cho 1 Booking
CREATE OR REPLACE FUNCTION public.fn_get_recorded_expected_revenue(p_booking_id uuid)
RETURNS numeric AS $$
    SELECT COALESCE(SUM(amount), 0) 
    FROM public.daily_expected_ledger 
    WHERE booking_id = p_booking_id;
$$ LANGUAGE sql STABLE;

-- 2. Trigger xử lý biến động từ Bookings (Check-in, Check-out, Hủy, Sửa giá)
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_bookings_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_bill jsonb;
    v_recorded numeric;
    v_new_amount numeric;
    v_room_number text;
    v_is_entering_checkin boolean := false;
BEGIN
    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = NEW.room_id;
    v_room_number := COALESCE(v_room_number, '??');

    -- Xác định trạng thái
    IF (TG_OP = 'INSERT' AND NEW.status = 'checked_in') THEN
        v_is_entering_checkin := true;
    ELSIF (TG_OP = 'UPDATE' AND OLD.status != 'checked_in' AND NEW.status = 'checked_in') THEN
        v_is_entering_checkin := true;
    END IF;

    -- [A] SỰ KIỆN CHECK-IN (Mọi loại phòng) - Theo duthu.md 2.A.1
    IF v_is_entering_checkin THEN
        v_bill := public.calculate_booking_bill(NEW.id, NEW.check_in_actual);
        v_new_amount := (v_bill->>'room_charge')::numeric + (v_bill->>'surcharge_amount')::numeric;
        
        INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
        VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Check-in (Ghi nhận ban đầu)', 'CHECK_IN');
    END IF;

    -- [B] SỰ KIỆN CHECK-OUT (Phòng giờ) - Theo duthu.md 2.A.2
    IF (TG_OP = 'UPDATE' AND OLD.status = 'checked_in' AND NEW.status = 'completed' AND NEW.rental_type = 'hourly') THEN
        v_bill := public.calculate_booking_bill(NEW.id, NEW.check_out_actual);
        v_recorded := public.fn_get_recorded_expected_revenue(NEW.id);
        v_new_amount := (v_bill->>'total_amount')::numeric - (v_bill->>'deposit_amount')::numeric - v_recorded;
        
        -- Chỉ insert nếu có chênh lệch (tránh rác dữ liệu)
        IF ABS(v_new_amount) > 1 THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Check-out (Bù chênh lệch giờ)', 'CHECK_OUT');
        END IF;
    END IF;

    -- [C] SỰ KIỆN HỦY PHÒNG - Theo duthu.md 2.B.1
    IF (TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status != 'cancelled') THEN
        v_recorded := public.fn_get_recorded_expected_revenue(NEW.id);
        IF v_recorded != 0 THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.id, -v_recorded, 'P.' || v_room_number || ' Hủy phòng (Hoàn lại dự thu)', 'CANCEL');
        END IF;
    END IF;

    -- [D] SỰ KIỆN SỬA GIÁ (Phòng đang ở) - Theo duthu.md 2.B.2
    IF (TG_OP = 'UPDATE' AND NEW.status = 'checked_in' AND COALESCE(OLD.custom_price, 0) != COALESCE(NEW.custom_price, 0)) THEN
        v_new_amount := COALESCE(NEW.custom_price, 0) - COALESCE(OLD.custom_price, 0);
        INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
        VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Thay đổi giá phòng', 'ADJUST');
    END IF;

    RETURN NEW;
END;
$function$;

-- 3. Trigger xử lý Stay-over (Mốc tính thêm tiền phòng) - Theo duthu.md 2.A.4
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_milestones_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_room_number text;
BEGIN
    -- Chỉ tính các mốc 'Tiền phòng' tự động được ghi nợ (Credit)
    IF (NEW.is_auto = true AND NEW.category = 'Tiền phòng' AND NEW.payment_method_code = 'credit') THEN
        SELECT r.room_number INTO v_room_number 
        FROM public.bookings b JOIN public.rooms r ON b.room_id = r.id 
        WHERE b.id = NEW.ref_id;

        INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
        VALUES (NEW.hotel_id, NEW.ref_id, NEW.amount, 'P.' || COALESCE(v_room_number, '??') || ' Ở thêm ngày (Stay-over)', 'MILESTONE');
    END IF;
    
    RETURN NEW;
END;
$function$;

-- 4. Trigger xử lý Dịch vụ - Theo duthu.md 2.A.3 & 2.B.3
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_services_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_hotel_id uuid;
    v_booking_id uuid;
    v_room_number text;
    v_service_name text;
    v_amount numeric;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_booking_id := OLD.booking_id;
        v_amount := -(OLD.quantity * COALESCE(OLD.price_at_time, 0));
        SELECT name INTO v_service_name FROM public.services WHERE id = OLD.service_id;
    ELSE
        v_booking_id := NEW.booking_id;
        v_amount := (NEW.quantity * COALESCE(NEW.price_at_time, 0)) - CASE WHEN TG_OP = 'UPDATE' THEN (OLD.quantity * COALESCE(OLD.price_at_time, 0)) ELSE 0 END;
        SELECT name INTO v_service_name FROM public.services WHERE id = NEW.service_id;
    END IF;

    IF v_amount = 0 THEN RETURN NULL; END IF;

    SELECT b.hotel_id, r.room_number INTO v_hotel_id, v_room_number 
    FROM public.bookings b JOIN public.rooms r ON b.room_id = r.id 
    WHERE b.id = v_booking_id;

    INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
    VALUES (v_hotel_id, v_booking_id, v_amount, 'P.' || COALESCE(v_room_number, '??') || ' Dùng ' || COALESCE(v_service_name, 'dịch vụ'), 'SERVICE');

    RETURN NULL;
END;
$function$;

-- 5. Thiết lập lại Trigger
DROP TRIGGER IF EXISTS trg_expected_revenue_bookings ON public.bookings;
CREATE TRIGGER trg_expected_revenue_bookings
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_bookings_v2();

DROP TRIGGER IF EXISTS trg_expected_revenue_milestones ON public.cash_flow;
CREATE TRIGGER trg_expected_revenue_milestones
AFTER INSERT ON public.cash_flow
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_milestones_v2();

DROP TRIGGER IF EXISTS trg_expected_revenue_services ON public.booking_services;
CREATE TRIGGER trg_expected_revenue_services
AFTER INSERT OR UPDATE OR DELETE ON public.booking_services
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_services_v2();

-- 6. Cập nhật các RPC truy vấn (Sử dụng mốc Night Audit để Filter)
CREATE OR REPLACE FUNCTION public.fn_get_daily_expected_revenue(p_hotel_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
    v_hotel_id uuid;
    v_threshold timestamptz;
BEGIN
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());
    v_threshold := public.fn_get_current_night_audit_threshold(v_hotel_id);

    RETURN (SELECT COALESCE(SUM(amount), 0) 
            FROM public.daily_expected_ledger 
            WHERE hotel_id = v_hotel_id AND created_at >= v_threshold);
END;
$$;

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
        l.id, l.booking_id, l.amount, l.description, l.event_type, l.created_at,
        r.room_number, c.full_name as customer_name
    FROM public.daily_expected_ledger l
    LEFT JOIN public.bookings b ON l.booking_id = b.id
    LEFT JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.customers c ON b.customer_id = c.id
    WHERE l.hotel_id = v_hotel_id AND l.created_at >= v_threshold
    ORDER BY l.created_at DESC;
END;
$$;
