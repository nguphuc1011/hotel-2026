-- ====================================================================================
-- BẢN VÁ LỖI DỰ THU TOÀN DIỆN V8 (THEO KIM CHỈ NAM DUTHU.MD MỚI)
-- 📜 Trích dẫn Điều 8: "Bộ não Backend là nguồn sự thật duy nhất."
-- 📜 Trích dẫn Điều 10: "Mọi sửa đổi phải dựa trên information_schema thực tế."
-- Mô tả: Hoàn thiện logic Dự thu theo bảng mô tả chi tiết:
--        1. Phòng giờ chỉ tính lúc checkout. Hủy phòng giờ không làm gì.
--        2. Stay-over chỉ cộng sau ít nhất 1 ngày kể từ check-in.
--        3. Chỉ trừ dự thu nếu khoản đó đã được cộng vào con số hiện tại.
-- ====================================================================================

-- 1. Hàm lấy tiền đã ghi nhận trong kỳ hiện tại
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

-- 2. Hàm đồng bộ MILESTONE (Stay-over)
CREATE OR REPLACE FUNCTION public.fn_sync_stayover_milestones(p_hotel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking RECORD;
    v_bill jsonb;
    v_expected_days int;
    v_recorded_days int;
    v_price_daily numeric;
BEGIN
    -- Quét toàn bộ phòng đang ở (Trừ phòng giờ)
    FOR v_booking IN 
        SELECT b.id, r.room_number, b.hotel_id, b.custom_price,
               rc.price_daily as cat_price_daily, b.check_in_actual
        FROM public.bookings b
        JOIN public.rooms r ON b.room_id = r.id
        JOIN public.room_categories rc ON r.category_id = rc.id
        WHERE b.status = 'checked_in' 
          AND b.rental_type != 'hourly' 
          AND b.hotel_id = p_hotel_id
    LOOP
        -- A. Lấy giá 1 ngày chuẩn
        v_price_daily := COALESCE(v_booking.custom_price, v_booking.cat_price_daily, 0);
        IF v_price_daily <= 0 THEN CONTINUE; END IF;

        -- B. Hỏi Billing Engine xem tính đến hiện tại là bao nhiêu ngày tiền phòng
        v_bill := public.calculate_booking_bill(v_booking.id, now());
        v_expected_days := ROUND((v_bill->>'room_charge')::numeric / v_price_daily);

        -- C. Đếm số ngày đã ghi nhận trong Ledger (CHECK_IN + MILESTONE)
        SELECT COUNT(*)::int INTO v_recorded_days
        FROM public.daily_expected_ledger 
        WHERE booking_id = v_booking.id 
          AND event_type IN ('CHECK_IN', 'MILESTONE');

        -- D. Điều kiện cộng thêm MILESTONE:
        -- 1. Số ngày tính toán > số ngày đã ghi
        -- 2. ĐÃ QUA ÍT NHẤT 24H (hoặc ít nhất là qua ngày hôm sau) kể từ lúc check-in
        --    (Chặn trường hợp check-in lúc 14h, mốc 18h cùng ngày bị cộng nhầm)
        IF v_expected_days > v_recorded_days AND now() >= (v_booking.check_in_actual + interval '20 hours') THEN
            WHILE v_expected_days > v_recorded_days LOOP
                INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
                VALUES (v_booking.hotel_id, v_booking.id, v_price_daily, 'P.' || v_booking.room_number || ' Ở thêm ngày (Tự động)', 'MILESTONE');
                v_recorded_days := v_recorded_days + 1;
            END LOOP;
        END IF;
    END LOOP;
END;
$$;

-- 3. Trigger Bookings V8 (Logic Check-in, Check-out, Cancel)
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_bookings_v8()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_bill jsonb;
    v_recorded_total numeric;
    v_recorded_today numeric;
    v_new_amount numeric;
    v_room_number text;
    v_is_entering_checkin boolean := false;
    v_threshold timestamptz;
BEGIN
    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = NEW.room_id;
    v_room_number := COALESCE(v_room_number, '??');
    v_threshold := public.fn_get_current_night_audit_threshold(NEW.hotel_id);

    -- Xác định trạng thái Check-in
    IF (TG_OP = 'INSERT' AND NEW.status = 'checked_in') THEN
        v_is_entering_checkin := true;
    ELSIF (TG_OP = 'UPDATE' AND OLD.status != 'checked_in' AND NEW.status = 'checked_in') THEN
        v_is_entering_checkin := true;
    END IF;

    -- [A] SỰ KIỆN CHECK-IN
    -- Daily: +1 ngày tiền phòng + Phụ thu vào sớm.
    -- Hourly: 0 (Không làm gì).
    IF v_is_entering_checkin AND NEW.rental_type != 'hourly' THEN
        v_bill := public.calculate_booking_bill(NEW.id, NEW.check_in_actual);   
        v_new_amount := (v_bill->>'room_charge')::numeric + (v_bill->>'surcharge_amount')::numeric;

        INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
        VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Check-in (Dự thu ngày 1)', 'CHECK_IN');
    END IF;

    -- [B] SỰ KIỆN CHECK-OUT
    -- Daily: 0 (Không làm gì).
    -- Hourly: + Toàn bộ tiền thực tế (bao gồm dịch vụ chưa cộng).
    IF (TG_OP = 'UPDATE' AND OLD.status = 'checked_in' AND NEW.status = 'completed') THEN
        IF NEW.rental_type = 'hourly' THEN
            v_bill := public.calculate_booking_bill(NEW.id, NEW.check_out_actual);  
            v_recorded_total := (SELECT COALESCE(SUM(amount), 0) FROM public.daily_expected_ledger WHERE booking_id = NEW.id);
            -- Tính chênh lệch để cộng nốt phần còn thiếu
            v_new_amount := (v_bill->>'total_amount')::numeric - (v_bill->>'deposit_amount')::numeric - v_recorded_total;
            
            IF v_new_amount > 1 THEN
                INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
                VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Check-out Giờ (Tất toán)', 'CHECK_OUT');
            END IF;
        END IF;
        -- Daily không làm gì theo Kim chỉ nam.
    END IF;

    -- [C] SỰ KIỆN HỦY PHÒNG
    -- Daily: - Tiền đã cộng HÔM NAY.
    -- Hourly: 0 (Không làm gì).
    IF (TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status != 'cancelled') THEN
        IF NEW.rental_type != 'hourly' THEN
            v_recorded_today := public.fn_get_recorded_expected_revenue(NEW.id, v_threshold);
            IF v_recorded_today != 0 THEN
                INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
                VALUES (NEW.hotel_id, NEW.id, -v_recorded_today, 'P.' || v_room_number || ' Hủy phòng (Hoàn lại Dự thu hôm nay)', 'CANCEL');
            END IF;
        END IF;
        -- Hourly: 0 theo Kim chỉ nam.
    END IF;

    -- [D] SỰ KIỆN SỬA GIÁ (Điều chỉnh chênh lệch nếu đã cộng hôm nay)
    IF (TG_OP = 'UPDATE' AND OLD.status = 'checked_in' AND NEW.status = 'checked_in' AND (OLD.custom_price != NEW.custom_price OR OLD.rental_type != NEW.rental_type)) THEN
        -- Chỉ điều chỉnh nếu khoản tiền đó đã được ghi nhận trong sổ cái
        v_recorded_total := (SELECT COALESCE(SUM(amount), 0) FROM public.daily_expected_ledger WHERE booking_id = NEW.id);
        IF v_recorded_total > 0 THEN
            v_bill := public.calculate_booking_bill(NEW.id);
            -- Tính chênh lệch tiền phòng
            v_new_amount := (v_bill->>'room_charge')::numeric - (SELECT COALESCE(SUM(amount), 0) FROM public.daily_expected_ledger WHERE booking_id = NEW.id AND event_type IN ('CHECK_IN', 'MILESTONE'));
            IF ABS(v_new_amount) > 1 THEN
                INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
                VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Điều chỉnh giá/loại hình', 'ADJUSTMENT');
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- 4. Trigger Services V8 (Cộng ngay, trừ nếu đã cộng hôm nay)
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_services_v8()
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
        -- CHỈ TRỪ nếu dịch vụ này được thêm trong kỳ hiện tại
        IF OLD.created_at >= v_threshold THEN
            v_amount := OLD.quantity * OLD.price_at_time;
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (v_hotel_id, OLD.booking_id, -v_amount, 'P.' || v_room_number || ' Xóa dịch vụ', 'SERVICE_DELETE');
        END IF;
    END IF;
    RETURN NULL;
END;
$function$;

-- 5. Áp dụng các Trigger V8
DROP TRIGGER IF EXISTS trg_expected_revenue_bookings ON public.bookings;
CREATE TRIGGER trg_expected_revenue_bookings
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_bookings_v8();

DROP TRIGGER IF EXISTS trg_expected_revenue_services ON public.booking_services;
CREATE TRIGGER trg_expected_revenue_services
AFTER INSERT OR DELETE ON public.booking_services
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_services_v8();

-- Thông báo hoàn tất
NOTIFY pgrst, 'reload schema';
