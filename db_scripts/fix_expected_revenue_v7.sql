-- ====================================================================================
-- BẢN VÁ LỖI DỰ THU TOÀN DIỆN V7 (FIX LỖI HOÀN LẠI SAI MỐC)
-- 📜 Trích dẫn Điều 8: "Bộ não Backend là nguồn sự thật duy nhất."
-- 📜 Trích dẫn Điều 10: "Mọi sửa đổi phải dựa trên information_schema thực tế."
-- Mô tả: Sửa lỗi khi hủy phòng hoặc xóa dịch vụ, hệ thống trừ sạch lịch sử thay vì chỉ trừ khoản đã cộng HÔM NAY.
-- ====================================================================================

-- 1. Cập nhật hàm lấy tiền đã ghi nhận (Thêm tham số lọc theo mốc thời gian)
CREATE OR REPLACE FUNCTION public.fn_get_recorded_expected_revenue(
    p_booking_id uuid, 
    p_since_threshold timestamptz DEFAULT '-infinity'::timestamptz
)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    RETURN (SELECT COALESCE(SUM(amount), 0) 
            FROM public.daily_expected_ledger 
            WHERE booking_id = p_booking_id 
              AND created_at >= p_since_threshold);
END;
$function$;

-- 2. Cập nhật Trigger Bookings V7 (Sửa logic Hủy phòng)
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_bookings_v7()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_bill jsonb;
    v_recorded numeric;
    v_recorded_today numeric;
    v_new_amount numeric;
    v_room_number text;
    v_is_entering_checkin boolean := false;
    v_threshold timestamptz;
BEGIN
    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = NEW.room_id;
    v_room_number := COALESCE(v_room_number, '??');
    
    -- Lấy mốc Night Audit hiện tại để làm chuẩn cho việc hoàn lại (Cancel)
    v_threshold := public.fn_get_current_night_audit_threshold(NEW.hotel_id);

    -- Xác định trạng thái Check-in
    IF (TG_OP = 'INSERT' AND NEW.status = 'checked_in') THEN
        v_is_entering_checkin := true;
    ELSIF (TG_OP = 'UPDATE' AND OLD.status != 'checked_in' AND NEW.status = 'checked_in') THEN
        v_is_entering_checkin := true;
    END IF;

    -- [A] SỰ KIỆN CHECK-IN
    IF v_is_entering_checkin AND NEW.rental_type != 'hourly' THEN
        v_bill := public.calculate_booking_bill(NEW.id, NEW.check_in_actual);   
        v_new_amount := (v_bill->>'room_charge')::numeric + (v_bill->>'surcharge_amount')::numeric;

        INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
        VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Check-in (Dự thu ngày 1)', 'CHECK_IN');
    END IF;

    -- [B] SỰ KIỆN CHECK-OUT
    IF (TG_OP = 'UPDATE' AND OLD.status = 'checked_in' AND NEW.status = 'completed') THEN
        v_bill := public.calculate_booking_bill(NEW.id, NEW.check_out_actual);  
        v_recorded := public.fn_get_recorded_expected_revenue(NEW.id);
        
        v_new_amount := (v_bill->>'total_amount')::numeric - (v_bill->>'deposit_amount')::numeric - v_recorded;

        IF ABS(v_new_amount) > 1 THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Check-out (Tất toán Dự thu)', 'CHECK_OUT');
        END IF;
    END IF;

    -- [C] SỰ KIỆN HỦY PHÒNG (TRỌNG TÂM: CHỈ HOÀN LẠI DỰ THU HÔM NAY)
    IF (TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status != 'cancelled') THEN
        -- Chỉ lấy số tiền đã cộng từ mốc Night Audit trở đi
        v_recorded_today := public.fn_get_recorded_expected_revenue(NEW.id, v_threshold);
        
        IF v_recorded_today != 0 THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.id, -v_recorded_today, 'P.' || v_room_number || ' Hủy phòng (Hoàn lại Dự thu hôm nay)', 'CANCEL');
        END IF;
    END IF;

    -- [D] SỰ KIỆN SỬA GIÁ / LOẠI HÌNH
    IF (TG_OP = 'UPDATE' AND OLD.status = 'checked_in' AND NEW.status = 'checked_in' AND OLD.rental_type != NEW.rental_type) THEN
        v_bill := public.calculate_booking_bill(NEW.id);
        v_recorded := public.fn_get_recorded_expected_revenue(NEW.id);
        v_new_amount := (v_bill->>'room_charge')::numeric - v_recorded;
        
        IF ABS(v_new_amount) > 1 THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Thay đổi loại hình thuê (Điều chỉnh)', 'ADJUSTMENT');
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- 3. Cập nhật Trigger Services V7 (Chỉ hoàn lại nếu dịch vụ được thêm hôm nay)
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_services_v7()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_amount numeric;
    v_room_number text;
    v_hotel_id uuid;
    v_threshold timestamptz;
BEGIN
    SELECT r.room_number, b.hotel_id INTO v_room_number, v_hotel_id 
    FROM public.bookings b 
    JOIN public.rooms r ON b.room_id = r.id 
    WHERE b.id = COALESCE(NEW.booking_id, OLD.booking_id);

    v_threshold := public.fn_get_current_night_audit_threshold(v_hotel_id);

    IF (TG_OP = 'INSERT') THEN
        v_amount := NEW.quantity * NEW.price_at_time;
        INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
        VALUES (v_hotel_id, NEW.booking_id, v_amount, 'P.' || v_room_number || ' Thêm dịch vụ', 'SERVICE');
    
    ELSIF (TG_OP = 'DELETE') THEN
        -- ⚠️ CHỈ TRỪ DỰ THU NẾU DỊCH VỤ NÀY ĐƯỢC THÊM TRONG KỲ NÀY (Hôm nay)
        -- Nếu OLD.created_at >= v_threshold, nghĩa là nó đã được cộng vào Dự thu hôm nay.
        IF OLD.created_at >= v_threshold THEN
            v_amount := OLD.quantity * OLD.price_at_time;
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (v_hotel_id, OLD.booking_id, -v_amount, 'P.' || v_room_number || ' Xóa dịch vụ (Hoàn lại Dự thu hôm nay)', 'SERVICE_DELETE');
        END IF;
    END IF;
    RETURN NULL;
END;
$function$;

-- 4. Áp dụng các Trigger V7
DROP TRIGGER IF EXISTS trg_expected_revenue_bookings ON public.bookings;
CREATE TRIGGER trg_expected_revenue_bookings
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_bookings_v7();

DROP TRIGGER IF EXISTS trg_expected_revenue_services ON public.booking_services;
CREATE TRIGGER trg_expected_revenue_services
AFTER INSERT OR DELETE ON public.booking_services
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_services_v7();

-- Thông báo hoàn tất
NOTIFY pgrst, 'reload schema';
