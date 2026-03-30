-- ====================================================================================
-- BẢN VÁ LỖI DỰ THU TOÀN DIỆN V4 (THEO YÊU CẦU CHỦ NHÂN & DUTHU.MD)
-- 📜 Trích dẫn Điều 8: "Bộ não Backend là nguồn sự thật duy nhất cho mọi logic nghiệp vụ."
-- 📜 Trích dẫn Điều 10: "Mọi sửa đổi phải dựa trên information_schema thực tế và kỷ luật sinh tồn."
-- Mô tả: Cố định logic mốc Night Audit động từ Settings, Phòng Giờ chỉ tính lúc Check-out,
--        và Tự động hóa việc cộng tiền Stay-over (phòng ở nhiều ngày) vào Dự thu.
-- ====================================================================================

-- 1. Hàm lấy mốc Night Audit (Lấy từ cài đặt của từng khách sạn, không khóa cứng)
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
    -- Xác định hotel_id từ tham số hoặc từ context (RLS)
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());
    
    -- Lấy giờ từ settings của hotel cụ thể, mặc định 04:00 nếu chưa cài đặt
    SELECT COALESCE(night_audit_time, '04:00:00')::time INTO v_night_audit_time 
    FROM public.settings 
    WHERE hotel_id = v_hotel_id AND key = 'config'
    LIMIT 1;

    -- Fallback nếu không tìm thấy settings cho hotel_id (Phòng hờ lỗi dữ liệu)
    IF v_night_audit_time IS NULL THEN
        SELECT COALESCE(night_audit_time, '04:00:00')::time INTO v_night_audit_time 
        FROM public.settings 
        WHERE key = 'config' 
        ORDER BY hotel_id NULLS LAST LIMIT 1;
    END IF;

    -- Tính mốc thời gian dựa trên ngày hiện tại và giờ chốt sổ (Múi giờ VN)
    v_threshold := ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + v_night_audit_time) AT TIME ZONE 'Asia/Ho_Chi_Minh';

    -- Nếu hiện tại chưa đến giờ chốt sổ, mốc bắt đầu tính "Hôm nay" phải là từ mốc chốt sổ của ngày hôm qua
    IF now() < v_threshold THEN
        v_threshold := v_threshold - INTERVAL '1 day';
    END IF;

    RETURN v_threshold;
END;
$function$;

-- 2. Hàm lấy tổng tiền đã ghi nhận trong Ledger cho một Booking (Audit Trail)
CREATE OR REPLACE FUNCTION public.fn_get_recorded_expected_revenue(p_booking_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    RETURN (SELECT COALESCE(SUM(amount), 0) 
            FROM public.daily_expected_ledger 
            WHERE booking_id = p_booking_id);
END;
$function$;

-- 3. Trigger xử lý biến động từ Bookings (Đã sửa logic Phòng Giờ theo yêu cầu)
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_bookings_v4()
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

    -- Xác định trạng thái Check-in
    IF (TG_OP = 'INSERT' AND NEW.status = 'checked_in') THEN
        v_is_entering_checkin := true;
    ELSIF (TG_OP = 'UPDATE' AND OLD.status != 'checked_in' AND NEW.status = 'checked_in') THEN
        v_is_entering_checkin := true;
    END IF;

    -- [A] SỰ KIỆN CHECK-IN (Chỉ dành cho PHÒNG NGÀY/ĐÊM)
    -- ⚠️ PHÒNG GIỜ: KHÔNG CỘNG LÚC CHECK-IN (Theo yêu cầu: "phòng giờ không cộng lúc check in, chỉ cộng lúc check out")
    IF v_is_entering_checkin AND NEW.rental_type != 'hourly' THEN
        -- Lấy tiền phòng ban đầu (1 ngày) + Phụ thu sớm
        v_bill := public.calculate_booking_bill(NEW.id, NEW.check_in_actual);   
        v_new_amount := (v_bill->>'room_charge')::numeric + (v_bill->>'surcharge_amount')::numeric;

        INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
        VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Check-in (Dự thu ngày 1)', 'CHECK_IN');
    END IF;

    -- [B] SỰ KIỆN CHECK-OUT (Tất toán mọi loại phòng)
    -- Nếu là phòng giờ, v_recorded lúc này sẽ là 0 (hoặc chỉ có tiền dịch vụ), nên v_new_amount sẽ là Full Tiền Phòng.
    IF (TG_OP = 'UPDATE' AND OLD.status = 'checked_in' AND NEW.status = 'completed') THEN
        v_bill := public.calculate_booking_bill(NEW.id, NEW.check_out_actual);  
        v_recorded := public.fn_get_recorded_expected_revenue(NEW.id);
        
        -- Tính toán chênh lệch (Thực tế cuối cùng - Những gì đã từng cộng vào dự thu)
        -- Bao gồm cả Tiền phòng + Dịch vụ + Phụ thu - Tiền cọc (Theo duthu.md)
        v_new_amount := (v_bill->>'total_amount')::numeric - (v_bill->>'deposit_amount')::numeric - v_recorded;

        -- Ghi nhận biến động cuối cùng
        IF ABS(v_new_amount) > 1 THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Check-out (Tất toán Dự thu)', 'CHECK_OUT');
        END IF;
    END IF;

    -- [C] SỰ KIỆN HỦY PHÒNG
    IF (TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status != 'cancelled') THEN
        v_recorded := public.fn_get_recorded_expected_revenue(NEW.id);
        IF v_recorded != 0 THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.id, -v_recorded, 'P.' || v_room_number || ' Hủy phòng (Hoàn lại Dự thu)', 'CANCEL');
        END IF;
    END IF;

    -- [D] SỰ KIỆN SỬA GIÁ / SỬA LOẠI HÌNH
    -- Nếu thay đổi loại hình từ Giờ sang Ngày hoặc ngược lại khi đang ở
    IF (TG_OP = 'UPDATE' AND OLD.status = 'checked_in' AND NEW.status = 'checked_in' AND OLD.rental_type != NEW.rental_type) THEN
        v_bill := public.calculate_booking_bill(NEW.id);
        v_recorded := public.fn_get_recorded_expected_revenue(NEW.id);
        -- Điều chỉnh lại ledger cho khớp với thực tế mới
        v_new_amount := (v_bill->>'room_charge')::numeric - v_recorded;
        
        IF ABS(v_new_amount) > 1 THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.id, v_new_amount, 'P.' || v_room_number || ' Thay đổi loại hình thuê (Điều chỉnh)', 'ADJUSTMENT');
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- 4. Áp dụng Trigger V4
DROP TRIGGER IF EXISTS trg_expected_revenue_bookings ON public.bookings;
CREATE TRIGGER trg_expected_revenue_bookings
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_bookings_v4();

-- 5. Hàm đồng bộ MILESTONE cho phòng ở nhiều ngày (Tự động hóa Stay-over)
-- Hàm này giải quyết câu hỏi: "Phòng ở nhiều ngày sẽ cộng tiền 1 ngày vào thời điểm nào?"
-- Đáp án: Cộng vào mỗi khi sang ngày mới theo mốc Night Audit.
CREATE OR REPLACE FUNCTION public.fn_sync_stayover_milestones(p_hotel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking RECORD;
    v_current_bill jsonb;
    v_recorded numeric;
    v_new_amount numeric;
    v_threshold timestamptz;
BEGIN
    v_threshold := public.fn_get_current_night_audit_threshold(p_hotel_id);

    -- Quét toàn bộ phòng đang ở (Trừ phòng giờ vì phòng giờ chỉ tính lúc checkout)
    FOR v_booking IN 
        SELECT b.id, r.room_number, b.hotel_id
        FROM public.bookings b
        JOIN public.rooms r ON b.room_id = r.id
        WHERE b.status = 'checked_in' 
          AND b.rental_type != 'hourly' 
          AND b.hotel_id = p_hotel_id
    LOOP
        -- Lấy tiền phòng thực tế tính đến hiện tại từ Billing Engine
        v_current_bill := public.calculate_booking_bill(v_booking.id);
        
        -- Lấy số tiền phòng + phụ thu đã từng ghi nhận trong ledger
        v_recorded := (
            SELECT COALESCE(SUM(amount), 0) 
            FROM public.daily_expected_ledger 
            WHERE booking_id = v_booking.id 
              AND event_type IN ('CHECK_IN', 'MILESTONE', 'ADJUSTMENT')
        );
        
        -- Tính toán phần tiền phòng phát sinh thêm (do sang ngày mới)
        -- Lưu ý: Không tính phụ thu quá giờ lẻ (theo duthu.md) mà chỉ tính tiền phòng tròn ngày.
        v_new_amount := (v_current_bill->>'room_charge')::numeric - v_recorded;

        -- Nếu có tiền phòng mới phát sinh (thường là tròn 1 ngày mới)
        IF v_new_amount >= 1000 THEN 
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (v_booking.hotel_id, v_booking.id, v_new_amount, 'P.' || v_booking.room_number || ' Ở thêm ngày (Tự động)', 'MILESTONE');
        END IF;
    END LOOP;
END;
$$;

-- 6. RPC lấy Tổng Dự Thu (Đã sửa công thức: Ledger + Auto Sync)
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

    -- ⚡ Bước đột phá: Tự động đồng bộ stay-over trước khi trả về con số
    -- Điều này đảm bảo "Dự thu" luôn bao gồm tiền phòng của ngày hôm nay cho khách đang ở.
    PERFORM public.fn_sync_stayover_milestones(v_hotel_id);
    
    -- Trả về tổng biến động trong sổ cái kể từ mốc Night Audit
    RETURN (
        SELECT COALESCE(SUM(amount), 0) 
        FROM public.daily_expected_ledger 
        WHERE hotel_id = v_hotel_id AND created_at >= v_threshold
    );
END;
$$;

-- 7. Đảm bảo các trigger khác vẫn hoạt động đúng
-- Trigger Dịch vụ: Cộng ngay khi phát sinh
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_services_v4()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_amount numeric;
    v_room_number text;
    v_hotel_id uuid;
BEGIN
    SELECT r.room_number, b.hotel_id INTO v_room_number, v_hotel_id 
    FROM public.bookings b 
    JOIN public.rooms r ON b.room_id = r.id 
    WHERE b.id = COALESCE(NEW.booking_id, OLD.booking_id);

    IF (TG_OP = 'INSERT') THEN
        v_amount := NEW.quantity * NEW.price_at_time;
        INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
        VALUES (v_hotel_id, NEW.booking_id, v_amount, 'P.' || v_room_number || ' Thêm dịch vụ', 'SERVICE');
    ELSIF (TG_OP = 'DELETE') THEN
        v_amount := OLD.quantity * OLD.price_at_time;
        INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
        VALUES (v_hotel_id, OLD.booking_id, -v_amount, 'P.' || v_room_number || ' Xóa dịch vụ', 'SERVICE_DELETE');
    END IF;
    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_expected_revenue_services ON public.booking_services;
CREATE TRIGGER trg_expected_revenue_services
AFTER INSERT OR DELETE ON public.booking_services
FOR EACH ROW EXECUTE FUNCTION public.trg_expected_revenue_services_v4();

-- Thông báo hoàn tất
NOTIFY pgrst, 'reload schema';
