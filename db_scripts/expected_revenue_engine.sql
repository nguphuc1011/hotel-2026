-- ====================================================================================
-- 🚀 EXPECTED REVENUE ENGINE (DỰ THU THỰC TẾ) - BẢN NHẤT THỐNG
-- 📜 Trích dẫn Điều 8: "Mọi logic tính toán BẮT BUỘC phải nằm trong Database."
-- 📜 Trích dẫn Điều 10: "Mọi sửa đổi phải dựa trên information_schema thực tế."
-- 🎯 Kim chỉ nam: duthu.md (Mọi thay đổi trong duthu.md phải hỏi ý kiến chủ nhân)
-- ====================================================================================

-- 1. HÀM LẤY MỐC NIGHT AUDIT (RESET VỀ 0)
CREATE OR REPLACE FUNCTION public.fn_get_current_night_audit_threshold(p_hotel_id uuid DEFAULT NULL)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_hotel_id uuid;
    v_night_audit_time time;
    v_threshold timestamptz;
BEGIN
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());
    
    SELECT COALESCE(night_audit_time, '04:00:00')::time INTO v_night_audit_time 
    FROM public.settings 
    WHERE hotel_id = v_hotel_id AND key = 'config'
    LIMIT 1;

    -- Tính mốc thời gian dựa trên ngày hiện tại và giờ chốt sổ
    v_threshold := ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + v_night_audit_time) AT TIME ZONE 'Asia/Ho_Chi_Minh';

    -- Nếu hiện tại chưa đến giờ chốt sổ, mốc bắt đầu tính "Hôm nay" phải là từ mốc chốt sổ của ngày hôm qua
    IF now() < v_threshold THEN
        v_threshold := v_threshold - INTERVAL '1 day';
    END IF;

    RETURN v_threshold;
END;
$function$;

-- 2. HÀM LẤY SỐ TIỀN ĐÃ GHI NHẬN TRONG KỲ HIỆN TẠI
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

-- 3. HÀM ĐỒNG BỘ MILESTONE (STAY-OVER)
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
        v_price_daily := COALESCE(v_booking.custom_price, v_booking.cat_price_daily, 0);
        IF v_price_daily <= 0 THEN CONTINUE; END IF;

        -- Hỏi Billing Engine xem tính đến hiện tại là bao nhiêu ngày tiền phòng
        v_bill := public.calculate_booking_bill(v_booking.id, now());
        v_expected_days := ROUND((v_bill->>'room_charge')::numeric / v_price_daily);

        -- Đếm số ngày đã ghi nhận trong Ledger (CHECK_IN + MILESTONE)
        SELECT COUNT(*)::int INTO v_recorded_days
        FROM public.daily_expected_ledger 
        WHERE booking_id = v_booking.id 
          AND event_type IN ('CHECK_IN', 'MILESTONE');

        -- ĐIỀU KIỆN CỘNG THÊM MILESTONE:
        -- 1. Số ngày tính toán > số ngày đã ghi
        -- 2. ĐÃ QUA ÍT NHẤT 20H kể từ lúc check-in (Chặn cộng trùng ngày đầu)
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

-- 4. TRIGGER XỬ LÝ BIẾN ĐỘNG BOOKINGS (CHECK-IN, CHECK-OUT, CANCEL)
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_bookings_engine()
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
    -- Phòng ngày: +1 ngày tiền phòng + Phụ thu sớm
    -- Phòng giờ: 0 (Không làm gì)
    IF v_is_entering_checkin AND NEW.rental_type != 'hourly' THEN
        v_bill := public.calculate_booking_bill(NEW.id, NEW.check_in_actual);   
        v_new_amount := (v_bill->>'room_charge')::numeric + (v_bill->>'surcharge_amount')::numeric;

        INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
        VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Check-in (Dự thu ngày 1)', 'CHECK_IN');
    END IF;

    -- [B] SỰ KIỆN CHECK-OUT
    -- Phòng ngày: 0 (Không làm gì - Tiền đã cộng lúc check-in/milestone)
    -- Phòng giờ: + Toàn bộ tiền thực tế (đã trừ phần DV đã cộng trước đó)
    IF (TG_OP = 'UPDATE' AND OLD.status = 'checked_in' AND NEW.status = 'completed') THEN
        IF NEW.rental_type = 'hourly' THEN
            v_bill := public.calculate_booking_bill(NEW.id, NEW.check_out_actual);  
            v_recorded_total := (SELECT COALESCE(SUM(amount), 0) FROM public.daily_expected_ledger WHERE booking_id = NEW.id);
            v_new_amount := (v_bill->>'total_amount')::numeric - (v_bill->>'deposit_amount')::numeric - v_recorded_total;
            
            IF v_new_amount > 1 THEN
                INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
                VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Check-out Giờ (Tất toán)', 'CHECK_OUT');
            END IF;
        END IF;
    END IF;

    -- [C] SỰ KIỆN HỦY PHÒNG
    -- Phòng ngày: - Trừ đúng số tiền đã cộng HÔM NAY (trong kỳ Night Audit)
    -- Phòng giờ: 0 (Không làm gì)
    IF (TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status != 'cancelled') THEN
        IF NEW.rental_type != 'hourly' THEN
            v_recorded_today := public.fn_get_recorded_expected_revenue(NEW.id, v_threshold);
            IF v_recorded_today != 0 THEN
                INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
                VALUES (NEW.hotel_id, NEW.id, -v_recorded_today, 'P.' || v_room_number || ' Hủy phòng (Hoàn lại Dự thu hôm nay)', 'CANCEL');
            END IF;
        END IF;
    END IF;

    -- [D] SỰ KIỆN SỬA GIÁ / ĐIỀU CHỈNH
    IF (TG_OP = 'UPDATE' AND OLD.status = 'checked_in' AND NEW.status = 'checked_in' AND (OLD.custom_price != NEW.custom_price OR OLD.rental_type != NEW.rental_type)) THEN
        v_recorded_total := (SELECT COALESCE(SUM(amount), 0) FROM public.daily_expected_ledger WHERE booking_id = NEW.id);
        IF v_recorded_total > 0 THEN
            v_bill := public.calculate_booking_bill(NEW.id);
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

-- 5. TRIGGER XỬ LÝ BIẾN ĐỘNG DỊCH VỤ
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_services_engine()
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
        -- CHỈ TRỪ nếu dịch vụ này được thêm trong kỳ hiện tại (Hôm nay)
        IF OLD.created_at >= v_threshold THEN
            v_amount := OLD.quantity * OLD.price_at_time;
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (v_hotel_id, OLD.booking_id, -v_amount, 'P.' || v_room_number || ' Xóa dịch vụ', 'SERVICE_DELETE');
        END IF;
    END IF;
    RETURN NULL;
END;
$function$;

-- 6. RPC LẤY TỔNG DỰ THU (ĐIỂM CUỐI HIỂN THỊ)
CREATE OR REPLACE FUNCTION public.fn_get_daily_expected_revenue(p_hotel_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_hotel_id uuid;
    v_threshold timestamptz;
BEGIN
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());
    v_threshold := public.fn_get_current_night_audit_threshold(v_hotel_id);

    -- Tự động đồng bộ stay-over trước khi trả về con số
    PERFORM public.fn_sync_stayover_milestones(v_hotel_id);
    
    RETURN (
        SELECT COALESCE(SUM(amount), 0) 
        FROM public.daily_expected_ledger 
        WHERE hotel_id = v_hotel_id AND created_at >= v_threshold
    );
END;
$$;

-- 7. ÁP DỤNG ENGINE
DROP TRIGGER IF EXISTS trg_expected_revenue_bookings ON public.bookings;
CREATE TRIGGER trg_expected_revenue_bookings
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_bookings_engine();

DROP TRIGGER IF EXISTS trg_expected_revenue_services ON public.booking_services;
CREATE TRIGGER trg_expected_revenue_services
AFTER INSERT OR DELETE ON public.booking_services
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_services_engine();

-- Thông báo hoàn tất
NOTIFY pgrst, 'reload schema';
