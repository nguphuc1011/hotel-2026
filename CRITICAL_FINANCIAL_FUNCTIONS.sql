

-- ==================== fn_sync_stayover_milestones ====================
CREATE OR REPLACE FUNCTION public.fn_sync_stayover_milestones(p_hotel_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;


-- ==================== fn_get_current_night_audit_threshold ====================
CREATE OR REPLACE FUNCTION public.fn_get_current_night_audit_threshold(p_hotel_id uuid DEFAULT NULL::uuid)
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
$function$
;


-- ==================== process_checkout ====================
CREATE OR REPLACE FUNCTION public.process_checkout(p_booking_id uuid, p_payment_method text, p_amount_paid numeric, p_discount numeric, p_surcharge numeric, p_notes text, p_verified_by_staff_id uuid DEFAULT NULL::uuid, p_verified_by_staff_name text DEFAULT NULL::text, p_selected_child_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_staff_id uuid;
    v_staff_name text;
    v_room_id uuid;
    v_room_number text;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
    v_hotel_id uuid;
    v_cat_id uuid;
    v_remaining_unpaid numeric;
    v_bill jsonb;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    IF p_verified_by_staff_name IS NULL THEN SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id; ELSE v_staff_name := p_verified_by_staff_name; END IF;
    SELECT room_id, customer_id, hotel_id INTO v_room_id, v_customer_id, v_hotel_id FROM public.bookings WHERE id = p_booking_id;
    IF v_room_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); END IF;
    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = v_room_id;

    -- Cập nhật Booking (Trigger sẽ tự động cập nhật lại Tiền phòng/Dịch vụ khớp với thực tế checkout)
    UPDATE public.bookings SET discount_amount = COALESCE(p_discount, 0), custom_surcharge = COALESCE(p_surcharge, 0), check_out_actual = now(), status = 'completed', payment_method = p_payment_method, notes = COALESCE(notes, '') || E'\\n[Checkout] ' || COALESCE(p_notes, ''), verified_by_staff_id = v_staff_id, verified_by_staff_name = v_staff_name WHERE id = p_booking_id;
    UPDATE public.rooms SET status = 'dirty', current_booking_id = NULL, updated_at = now() WHERE id = v_room_id;

    -- Lấy Bill sau khi đã cập nhật discount/surcharge
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 1. Ghi nhận Thanh toán tiền mặt/chuyển khoản
    IF p_amount_paid > 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'SETTLEMENT' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (flow_type, category, category_id, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('IN', 'Thanh toán', v_cat_id, p_amount_paid, 'Thanh toán Checkout phòng P' || COALESCE(v_room_number, '???'), auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), lower(p_payment_method), v_hotel_id);
    END IF;

    -- 2. Ghi nhận Chuyển cọc
    IF v_deposit > 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'DEPOSIT_TRANSFER' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (flow_type, category, category_id, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('IN', 'Chuyển cọc', v_cat_id, v_deposit, 'Cọc chuyển sang tiền phòng (P' || COALESCE(v_room_number, '???') || ')', auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'deposit_transfer', v_hotel_id);
    END IF;

    -- 3. Xử lý nợ tồn đọng hoặc tiền thừa
    v_remaining_unpaid := v_total_amount - v_deposit - p_amount_paid;
    IF v_remaining_unpaid > 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'DEBT_TRANSFER' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (flow_type, category, category_id, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('IN', 'Kết chuyển nợ', v_cat_id, v_remaining_unpaid, 'Chuyển nợ phòng P' || COALESCE(v_room_number, '???') || ' sang nợ khách cũ', auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), 'debt_transfer', v_hotel_id);
    ELSIF v_remaining_unpaid < 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'REFUND' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (flow_type, category, category_id, amount, description, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, payment_method_code, hotel_id) 
        VALUES ('OUT', 'Hoàn tiền', v_cat_id, ABS(v_remaining_unpaid), 'Thối tiền thừa cho khách (P' || COALESCE(v_room_number, '???') || ')', auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, now(), lower(p_payment_method), v_hotel_id);
    END IF;

    -- 4. Cập nhật số dư khách hàng (Nếu có khách định danh)
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now() WHERE id = v_customer_id AND hotel_id = v_hotel_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END; $function$
;


-- ==================== fn_sync_booking_to_ledger ====================
CREATE OR REPLACE FUNCTION public.fn_sync_booking_to_ledger(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_bill jsonb;
    v_room_charge numeric;
    v_service_total numeric;
    v_room_name text;
    v_status text;
    v_hotel_id uuid;
    v_cat_room_id uuid;
    v_cat_service_id uuid;
BEGIN
    SELECT status, hotel_id INTO v_status, v_hotel_id FROM public.bookings WHERE id = p_booking_id;
    IF v_status NOT IN ('checked_in', 'completed') THEN RETURN; END IF;

    v_bill := public.calculate_booking_bill(p_booking_id);
    IF (v_bill->>'success')::boolean = false THEN RETURN; END IF;
    
    v_room_charge := (v_bill->>'room_charge')::numeric + (v_bill->>'surcharge_amount')::numeric + (v_bill->>'custom_surcharge')::numeric - (v_bill->>'discount_amount')::numeric;
    v_service_total := (v_bill->>'service_total')::numeric;
    v_room_name := v_bill->>'room_name';

    -- Lấy Category IDs từ bảng Categories (Dùng system_code của bảng Categories)
    SELECT id INTO v_cat_room_id FROM public.cash_flow_categories WHERE system_code = 'ROOM_CHARGE' AND hotel_id = v_hotel_id LIMIT 1;
    SELECT id INTO v_cat_service_id FROM public.cash_flow_categories WHERE system_code = 'SERVICE_CHARGE' AND hotel_id = v_hotel_id LIMIT 1;

    -- [A] Xử lý Tiền phòng
    IF v_room_charge <> 0 THEN
        PERFORM 1 FROM public.cash_flow WHERE ref_id = p_booking_id AND (category_id = v_cat_room_id OR category = 'Tiền phòng') AND payment_method_code = 'credit' AND is_auto = true;
        IF FOUND THEN
            UPDATE public.cash_flow SET amount = ABS(v_room_charge), flow_type = (CASE WHEN v_room_charge > 0 THEN 'IN' ELSE 'OUT' END), updated_at = now()
            WHERE ref_id = p_booking_id AND (category_id = v_cat_room_id OR category = 'Tiền phòng') AND payment_method_code = 'credit' AND is_auto = true;
        ELSE
            INSERT INTO public.cash_flow (flow_type, category, category_id, amount, description, payment_method_code, ref_id, is_auto, hotel_id, occurred_at)
            VALUES ('IN', 'Tiền phòng', v_cat_room_id, v_room_charge, 'Tiền phòng ' || v_room_name || ' (Tự động)', 'credit', p_booking_id, true, v_hotel_id, now());
        END IF;
    END IF;

    -- [B] Xử lý Dịch vụ
    IF v_service_total > 0 THEN
        PERFORM 1 FROM public.cash_flow WHERE ref_id = p_booking_id AND (category_id = v_cat_service_id OR category = 'Bán dịch vụ') AND payment_method_code = 'credit' AND is_auto = true;
        IF FOUND THEN
            UPDATE public.cash_flow SET amount = v_service_total, updated_at = now()
            WHERE ref_id = p_booking_id AND (category_id = v_cat_service_id OR category = 'Bán dịch vụ') AND payment_method_code = 'credit' AND is_auto = true;
        ELSE
            INSERT INTO public.cash_flow (flow_type, category, category_id, amount, description, payment_method_code, ref_id, is_auto, hotel_id, occurred_at)
            VALUES ('IN', 'Bán dịch vụ', v_cat_service_id, v_service_total, 'Dịch vụ phòng ' || v_room_name || ' (Tự động)', 'credit', p_booking_id, true, v_hotel_id, now());
        END IF;
    ELSE
        DELETE FROM public.cash_flow WHERE ref_id = p_booking_id AND (category_id = v_cat_service_id OR category = 'Bán dịch vụ') AND payment_method_code = 'credit' AND is_auto = true;
    END IF;
END;
$function$
;


-- ==================== trg_expected_revenue_bookings ====================
CREATE OR REPLACE FUNCTION public.trg_expected_revenue_bookings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_bill jsonb;
    v_amount numeric;
    v_is_checkin boolean := false;
    v_room_number text;
    v_rental_type_desc text;
BEGIN
    -- 1. Lấy thông tin phòng
    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = NEW.room_id;
    v_room_number := COALESCE(v_room_number, '??');
    
    -- 2. Việt hóa và viết hoa loại hình thuê
    v_rental_type_desc := CASE 
        WHEN NEW.rental_type = 'hourly' THEN 'GIỜ' 
        WHEN NEW.rental_type = 'daily' THEN 'NGÀY' 
        WHEN NEW.rental_type = 'overnight' THEN 'ĐÊM'
        WHEN NEW.rental_type = 'monthly' THEN 'THÁNG'
        ELSE UPPER(NEW.rental_type)
    END;

    -- 3. Xác định sự kiện Check-in
    IF (TG_OP = 'INSERT' AND NEW.status = 'checked_in') THEN
        v_is_checkin := true;
    ELSIF (TG_OP = 'UPDATE' AND OLD.status != 'checked_in' AND NEW.status = 'checked_in') THEN
        v_is_checkin := true;
    END IF;

    -- [A] CHECK-IN (Chỉ cho phòng Ngày/Đêm/Tháng)
    IF v_is_checkin AND NEW.rental_type != 'hourly' THEN
        v_bill := public.calculate_booking_bill(NEW.id, NEW.check_in_actual);
        v_amount := (v_bill->>'room_charge')::numeric + (v_bill->>'surcharge_amount')::numeric;
        
        INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
        VALUES (NEW.hotel_id, NEW.id, v_amount, 'P.' || v_room_number || ' Check in phòng ' || v_rental_type_desc, 'CHECK_IN');
    END IF;

    -- [B] CHECK-OUT (Phòng giờ)
    IF (TG_OP = 'UPDATE' AND OLD.status = 'checked_in' AND NEW.status = 'completed' AND NEW.rental_type = 'hourly') THEN
        v_bill := public.calculate_booking_bill(NEW.id, NEW.check_out_actual);
        v_amount := (v_bill->>'room_charge')::numeric + (v_bill->>'surcharge_amount')::numeric;
        
        IF v_amount > 0 THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.id, v_amount, 'P.' || v_room_number || ' Check out phòng ' || v_rental_type_desc, 'CHECK_OUT');
        END IF;
    END IF;

    -- [C] HỦY PHÒNG
    IF (TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status != 'cancelled') THEN
        SELECT SUM(amount) INTO v_amount FROM public.daily_expected_ledger WHERE booking_id = NEW.id;
        IF v_amount IS NOT NULL AND v_amount != 0 THEN
            INSERT INTO public.daily_expected_ledger (hotel_id, booking_id, amount, description, event_type)
            VALUES (NEW.hotel_id, NEW.id, -v_amount, 'P.' || v_room_number || ' Hủy phòng, hoàn lại', 'CANCEL');
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;


-- ==================== trg_expected_revenue_bookings_engine ====================
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
$function$
;


-- ==================== trg_sync_booking_to_cash_flow ====================
CREATE OR REPLACE FUNCTION public.trg_sync_booking_to_cash_flow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    PERFORM public.fn_sync_booking_to_ledger(NEW.id);
    RETURN NEW;
END;
$function$
;


-- ==================== fn_sync_wallets ====================
CREATE OR REPLACE FUNCTION public.fn_sync_wallets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_delta NUMERIC;
    v_flow_sign INTEGER; -- 1 cho IN, -1 cho OUT
    v_method TEXT;
    v_sys_code TEXT;
    v_hotel_id uuid;
    v_is_revenue BOOLEAN;
BEGIN
    -- [A] XÁC ĐỊNH THÔNG SỐ CƠ BẢN
    IF (TG_OP = 'DELETE') THEN
        v_delta := COALESCE(OLD.amount, 0);
        v_method := lower(COALESCE(OLD.payment_method_code, 'cash'));
        v_hotel_id := OLD.hotel_id;
        v_flow_sign := CASE WHEN OLD.flow_type = 'IN' THEN 1 ELSE -1 END;
        v_delta := v_delta * -1;
        SELECT system_code, is_revenue INTO v_sys_code, v_is_revenue FROM public.cash_flow_categories WHERE id = OLD.category_id;
    ELSE
        v_delta := CASE WHEN TG_OP = 'INSERT' THEN COALESCE(NEW.amount, 0)
                        ELSE COALESCE(NEW.amount, 0) - COALESCE(OLD.amount, 0) END;
        v_method := lower(COALESCE(NEW.payment_method_code, 'cash'));
        v_hotel_id := NEW.hotel_id;
        v_flow_sign := CASE WHEN NEW.flow_type = 'IN' THEN 1 ELSE -1 END;
        SELECT system_code, is_revenue INTO v_sys_code, v_is_revenue FROM public.cash_flow_categories WHERE id = NEW.category_id;
    END IF;

    IF v_delta = 0 AND TG_OP = 'UPDATE' THEN RETURN NULL; END IF;
    v_is_revenue := COALESCE(v_is_revenue, true);

    -- [B] LOGIC VÍ VẬT LÝ (CASH/BANK)
    IF v_method IN ('cash', 'bank', 'transfer', 'qr') THEN
        UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now()
        WHERE id = CASE WHEN v_method = 'cash' THEN 'CASH' ELSE 'BANK' END AND hotel_id = v_hotel_id;
    END IF;

    -- [C] LOGIC SỔ NỢ NGOÀI (PAYABLE)
    IF v_method = 'owner_equity' THEN
        UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now()
        WHERE id = 'PAYABLE' AND hotel_id = v_hotel_id;
    END IF;
    IF v_sys_code = 'DEBT_REPAYMENT_OWNER' OR (v_flow_sign = -1 AND (NEW.category = 'Trả nợ' OR v_sys_code = 'DEBT_REPAYMENT_OWNER')) THEN
        UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now()
        WHERE id = 'PAYABLE' AND hotel_id = v_hotel_id;
    END IF;

    -- [D] LOGIC CÔNG NỢ TẠM (RECEIVABLE)
    IF v_method = 'credit' AND v_flow_sign = 1 THEN
        UPDATE public.wallets SET balance = balance + v_delta, updated_at = now()
        WHERE id = 'RECEIVABLE' AND hotel_id = v_hotel_id;
    END IF;
    IF v_flow_sign = 1 AND (v_sys_code IN ('SETTLEMENT', 'DEPOSIT_TRANSFER', 'DEBT_TRANSFER') OR v_method IN ('deposit_transfer', 'debt_transfer')) THEN
        UPDATE public.wallets SET balance = balance - v_delta, updated_at = now()
        WHERE id = 'RECEIVABLE' AND hotel_id = v_hotel_id;
    END IF;
    IF v_method = 'credit' AND v_flow_sign = -1 THEN
        UPDATE public.wallets SET balance = balance - v_delta, updated_at = now()
        WHERE id = 'RECEIVABLE' AND hotel_id = v_hotel_id;
    END IF;

    -- [E] LOGIC TIỀN CỌC (ESCROW)
    IF v_sys_code = 'DEPOSIT' AND v_flow_sign = 1 THEN
        UPDATE public.wallets SET balance = balance + v_delta, updated_at = now()
        WHERE id = 'ESCROW' AND hotel_id = v_hotel_id;
    END IF;
    IF (v_flow_sign = 1 AND (v_sys_code = 'DEPOSIT_TRANSFER' OR v_method = 'deposit_transfer')) 
       OR (v_flow_sign = -1 AND v_sys_code = 'REFUND') THEN
        UPDATE public.wallets SET balance = balance - ABS(v_delta), updated_at = now()
        WHERE id = 'ESCROW' AND hotel_id = v_hotel_id;
    END IF;

    -- [F] LOGIC NỢ CŨ (DEBT) - Khách đã checkout
    IF v_flow_sign = 1 AND (v_sys_code = 'DEBT_TRANSFER' OR v_method = 'debt_transfer') THEN
        UPDATE public.wallets SET balance = balance + v_delta, updated_at = now()
        WHERE id = 'DEBT' AND hotel_id = v_hotel_id;
    END IF;
    IF v_flow_sign = 1 AND v_sys_code = 'DEBT_REPAYMENT' THEN
        UPDATE public.wallets SET balance = balance - v_delta, updated_at = now()
        WHERE id = 'DEBT' AND hotel_id = v_hotel_id;
    END IF;

    -- [G] SỔ DOANH THU (REVENUE)
    IF v_flow_sign = 1 AND v_is_revenue 
       AND v_sys_code NOT IN ('SETTLEMENT', 'DEBT_REPAYMENT', 'DEPOSIT', 'DEPOSIT_TRANSFER', 'DEBT_TRANSFER', 'DEBT_REPAYMENT_OWNER') 
       AND v_method NOT IN ('deposit_transfer', 'debt_transfer') THEN
        UPDATE public.wallets SET balance = balance + v_delta, updated_at = now()
        WHERE id = 'REVENUE' AND hotel_id = v_hotel_id;
    END IF;
    IF v_flow_sign = -1 AND v_is_revenue AND v_sys_code NOT IN ('REFUND', 'DEBT_REPAYMENT_OWNER') THEN
        UPDATE public.wallets SET balance = balance - v_delta, updated_at = now()
        WHERE id = 'REVENUE' AND hotel_id = v_hotel_id;
    END IF;
    IF v_flow_sign = -1 AND v_sys_code = 'REFUND' THEN
        UPDATE public.wallets SET balance = balance - v_delta, updated_at = now()
        WHERE id = 'REVENUE' AND hotel_id = v_hotel_id;
    END IF;

    RETURN NULL;
END; $function$
;


-- ==================== calculate_booking_bill ====================
CREATE OR REPLACE FUNCTION public.calculate_booking_bill(p_booking_id uuid, p_now_override timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
 DECLARE
     v_booking record;
     v_room_cat_id uuid;
     v_check_out timestamptz;
     v_room_res jsonb;
     v_surcharge_res jsonb;
     v_extra_person_res jsonb;
     v_adj_res jsonb;
     v_service_total numeric := 0;
     v_service_items jsonb;
     v_total_amount numeric;
     v_deposit numeric;
     v_customer_balance numeric;
     v_duration_hours numeric;
     v_duration_minutes numeric;
     v_audit_trail text[] := '{}';
     v_tz text := 'Asia/Ho_Chi_Minh';
 BEGIN
     SELECT 
         b.*, r.category_id, r.room_number as room_name,
         c.balance as cust_balance, c.full_name as cust_name
     INTO v_booking 
     FROM public.bookings b
     JOIN public.rooms r ON b.room_id = r.id
     LEFT JOIN public.customers c ON b.customer_id = c.id
     WHERE b.id = p_booking_id;
     
     IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); END IF;
     
     v_check_out := COALESCE(p_now_override, v_booking.check_out_actual, now());
     v_room_cat_id := v_booking.category_id;
     v_customer_balance := COALESCE(v_booking.cust_balance, 0);
     v_deposit := COALESCE(v_booking.deposit_amount, 0);
     
     v_duration_minutes := FLOOR(EXTRACT(EPOCH FROM (v_check_out - v_booking.check_in_actual)) / 60);
     v_duration_hours := FLOOR(v_duration_minutes / 60);
     v_duration_minutes := MOD(v_duration_minutes::int, 60);
 
   v_room_res := public.fn_calculate_room_charge(p_booking_id, v_booking.check_in_actual, v_check_out, v_booking.rental_type, v_room_cat_id);
   v_audit_trail := v_audit_trail || ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_room_res->'explanation') = 'array' THEN v_room_res->'explanation' ELSE '[]'::jsonb END) AS x);
   
   v_surcharge_res := public.fn_calculate_surcharge(v_booking.check_in_actual, v_check_out, v_room_cat_id, COALESCE(v_room_res->>'rental_type_actual', v_booking.rental_type));
   v_audit_trail := v_audit_trail || ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_surcharge_res->'explanation') = 'array' THEN v_surcharge_res->'explanation' ELSE '[]'::jsonb END) AS x);
    
    v_extra_person_res := public.fn_calculate_extra_person_charge(p_booking_id);
    v_audit_trail := v_audit_trail || ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_extra_person_res->'explanation') = 'array' THEN v_extra_person_res->'explanation' ELSE '[]'::jsonb END) AS x);

    SELECT 
        COALESCE(SUM(bs.quantity * COALESCE(NULLIF(bs.price_at_time, 0), s.price)), 0),
        COALESCE(jsonb_agg(jsonb_build_object(
            'name', s.name, 
            'quantity', bs.quantity, 
            'price', COALESCE(NULLIF(bs.price_at_time, 0), s.price), 
            'total', bs.quantity * COALESCE(NULLIF(bs.price_at_time, 0), s.price)
        )), '[]'::jsonb)
    INTO v_service_total, v_service_items
    FROM public.booking_services bs
    JOIN public.services s ON bs.service_id = s.id
    WHERE bs.booking_id = p_booking_id;

    IF v_service_total > 0 THEN
        v_audit_trail := array_append(v_audit_trail, format('Dịch vụ: %s', public.fn_format_money_vi(v_service_total)));
    END IF;

    IF v_deposit > 0 THEN
        v_audit_trail := array_append(v_audit_trail, format('Thu trước: -%s', public.fn_format_money_vi(v_deposit)));
    END IF;

    v_total_amount := COALESCE((v_room_res->>'amount')::numeric, 0) + 
                      COALESCE((v_surcharge_res->>'amount')::numeric, 0) + 
                      COALESCE((v_extra_person_res->>'amount')::numeric, 0) + 
                      v_service_total;

    v_adj_res := public.fn_calculate_bill_adjustments(
        v_total_amount, 
        COALESCE(v_booking.discount_amount, 0), 
        COALESCE(v_booking.custom_surcharge, 0)
    );
    v_audit_trail := v_audit_trail || ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_adj_res->'explanation') = 'array' THEN v_adj_res->'explanation' ELSE '[]'::jsonb END) AS x);

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'room_name', v_booking.room_name,
        'customer_name', COALESCE(v_booking.cust_name, 'Khách lẻ'),
        'rental_type', v_booking.rental_type,
        'rental_type_actual', COALESCE(v_room_res->>'rental_type_actual', v_booking.rental_type),
        'check_in_at', v_booking.check_in_actual,
        'check_out_at', v_check_out,
        'duration_hours', v_duration_hours,
        'duration_minutes', v_duration_minutes,
        'duration_text', v_room_res->>'duration_text', -- NEW: duration_text from room charge calculation
        
        'room_charge', COALESCE((v_room_res->>'amount')::numeric, 0),
        'surcharge_amount', COALESCE((v_surcharge_res->>'amount')::numeric, 0),
        'extra_person_charge', COALESCE((v_extra_person_res->>'amount')::numeric, 0),
        'service_total', v_service_total,
        'service_items', v_service_items,
        
        'sub_total', v_total_amount,
        'discount_amount', COALESCE(v_booking.discount_amount, 0),
        'custom_surcharge', COALESCE(v_booking.custom_surcharge, 0),
        'service_fee_amount', COALESCE((v_adj_res->>'service_fee')::numeric, 0),
        'vat_amount', COALESCE((v_adj_res->>'vat_amount')::numeric, 0),
        
        'total_amount', COALESCE((v_adj_res->>'final_amount')::numeric, 0),
        'deposit_amount', v_deposit,
        'amount_to_pay', COALESCE((v_adj_res->>'final_amount')::numeric, 0) - v_deposit,
        'customer_balance', v_customer_balance,
        'explanation', v_audit_trail
    );
 END;
 $function$
;


-- ==================== check_in_customer ====================
CREATE OR REPLACE FUNCTION public.check_in_customer(p_room_id uuid, p_rental_type text, p_customer_id uuid DEFAULT NULL::uuid, p_deposit numeric DEFAULT 0, p_payment_method text DEFAULT 'cash'::text, p_services jsonb DEFAULT '[]'::jsonb, p_customer_name text DEFAULT NULL::text, p_extra_adults integer DEFAULT 0, p_extra_children integer DEFAULT 0, p_notes text DEFAULT NULL::text, p_custom_price numeric DEFAULT NULL::numeric, p_custom_price_reason text DEFAULT NULL::text, p_source text DEFAULT 'direct'::text, p_verified_by_staff_id uuid DEFAULT NULL::uuid, p_verified_by_staff_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_booking_id uuid;
    v_customer_id uuid := p_customer_id;
    v_staff_id uuid;
    v_staff_name text;
    v_room_status text;
    v_room_number text;
    v_hotel_id uuid;
    v_pm_code text := lower(COALESCE(p_payment_method, 'cash'));
    v_wallet_changes jsonb := '[]'::jsonb;
    v_cat_id uuid;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    SELECT hotel_id, room_number, status INTO v_hotel_id, v_room_number, v_room_status FROM public.rooms WHERE id = p_room_id;

    IF v_room_status = 'occupied' THEN RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách'); END IF;

    IF v_customer_id IS NULL AND p_customer_name IS NOT NULL THEN
        INSERT INTO public.customers (full_name, hotel_id) VALUES (p_customer_name, v_hotel_id) RETURNING id INTO v_customer_id;
    END IF;

    -- Tạo Booking (Trigger sẽ tự động tạo cash_flow Tiền phòng)
    INSERT INTO public.bookings (room_id, customer_id, rental_type, status, deposit_amount, adult_count, child_count, extra_adults, extra_children, notes, custom_price, custom_price_reason, source, hotel_id, check_in_actual, verified_by_staff_id, verified_by_staff_name)
    VALUES (p_room_id, v_customer_id, p_rental_type, 'checked_in', p_deposit, 0, 0, p_extra_adults, p_extra_children, p_notes, p_custom_price, p_custom_price_reason, p_source, v_hotel_id, now(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name))
    RETURNING id INTO v_booking_id;

    UPDATE public.rooms SET status = 'occupied', current_booking_id = v_booking_id, last_status_change = now(), updated_at = now() WHERE id = p_room_id;

    -- Chỉ ghi nhận Tiền cọc (Nếu có)
    IF p_deposit > 0 THEN
        SELECT id INTO v_cat_id FROM public.cash_flow_categories WHERE system_code = 'DEPOSIT' AND hotel_id = v_hotel_id LIMIT 1;
        INSERT INTO public.cash_flow (flow_type, category, category_id, amount, description, payment_method_code, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at, hotel_id)
        VALUES ('IN', 'Tiền cọc', v_cat_id, p_deposit, 'Tiền cọc phòng ' || COALESCE(v_room_number, ''), v_pm_code, auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), v_booking_id, true, now(), v_hotel_id);

        v_wallet_changes := jsonb_build_array(jsonb_build_object('walletName', UPPER(v_pm_code), 'diff', p_deposit, 'reason', 'Tiền cọc nhận phòng ' || COALESCE(v_room_number, '')));
    END IF;

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id, 'message', 'Nhận phòng thành công', 'wallet_changes', v_wallet_changes);
END; $function$
;


-- ==================== fn_get_daily_expected_revenue ====================
CREATE OR REPLACE FUNCTION public.fn_get_daily_expected_revenue(p_hotel_id uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;


-- ==================== fn_get_money_page_stats ====================
CREATE OR REPLACE FUNCTION public.fn_get_money_page_stats(p_hotel_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_hotel_id uuid;
    v_cash_bal numeric := 0;
    v_bank_bal numeric := 0;
    v_receivable_bal numeric := 0;
    v_debt_bal numeric := 0;
    v_revenue_bal numeric := 0;

    v_cash_after_start numeric := 0;
    v_cash_after_end numeric := 0;
    v_cash_in numeric := 0;
    v_cash_out numeric := 0;

    v_bank_after_start numeric := 0;
    v_bank_after_end numeric := 0;
    v_bank_in numeric := 0;
    v_bank_out numeric := 0;

    v_receivable_after_start numeric := 0;
    v_receivable_after_end numeric := 0;

    v_debt_after_start numeric := 0;
    v_debt_after_end numeric := 0;

    v_revenue_after_start numeric := 0;
    v_revenue_after_end numeric := 0;
BEGIN
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());
    IF v_hotel_id IS NULL THEN
        RETURN '{}'::jsonb;
    END IF;

    -- 1. Lấy số dư hiện tại của các ví an toàn
    SELECT COALESCE(balance, 0) INTO v_cash_bal FROM public.wallets WHERE id = 'CASH' AND hotel_id = v_hotel_id;
    IF v_cash_bal IS NULL THEN v_cash_bal := 0; END IF;

    SELECT COALESCE(balance, 0) INTO v_bank_bal FROM public.wallets WHERE id = 'BANK' AND hotel_id = v_hotel_id;
    IF v_bank_bal IS NULL THEN v_bank_bal := 0; END IF;

    SELECT COALESCE(balance, 0) INTO v_receivable_bal FROM public.wallets WHERE id = 'RECEIVABLE' AND hotel_id = v_hotel_id;
    IF v_receivable_bal IS NULL THEN v_receivable_bal := 0; END IF;

    SELECT COALESCE(balance, 0) INTO v_debt_bal FROM public.wallets WHERE id = 'DEBT' AND hotel_id = v_hotel_id;
    IF v_debt_bal IS NULL THEN v_debt_bal := 0; END IF;

    SELECT COALESCE(balance, 0) INTO v_revenue_bal FROM public.wallets WHERE id = 'REVENUE' AND hotel_id = v_hotel_id;
    IF v_revenue_bal IS NULL THEN v_revenue_bal := 0; END IF;

    -- 2. Tính toán tổng hợp trong 1 lần quét qua bảng cash_flow
    WITH txs AS (
        SELECT 
            amount,
            flow_type,
            occurred_at,
            CASE 
                WHEN wallet_id IS NOT NULL THEN wallet_id
                WHEN LOWER(COALESCE(payment_method_code, 'cash')) IN ('cash', 'tm') THEN 'CASH'
                ELSE 'BANK'
            END AS target_wallet,
            LOWER(COALESCE(payment_method_code, 'cash')) AS p_method
        FROM public.cash_flow
        WHERE hotel_id = v_hotel_id
          AND occurred_at > p_start_date
    )
    SELECT
        -- Tiền mặt (CASH)
        COALESCE(SUM(CASE WHEN target_wallet = 'CASH' AND p_method NOT IN ('credit', 'deposit_transfer') THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'CASH' AND p_method NOT IN ('credit', 'deposit_transfer') AND occurred_at > p_end_date THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'CASH' AND p_method NOT IN ('credit', 'deposit_transfer') AND occurred_at <= p_end_date AND flow_type = 'IN' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'CASH' AND p_method NOT IN ('credit', 'deposit_transfer') AND occurred_at <= p_end_date AND flow_type = 'OUT' THEN amount ELSE 0 END), 0),

        -- Ngân hàng (BANK)
        COALESCE(SUM(CASE WHEN target_wallet = 'BANK' AND p_method NOT IN ('credit', 'deposit_transfer') THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'BANK' AND p_method NOT IN ('credit', 'deposit_transfer') AND occurred_at > p_end_date THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'BANK' AND p_method NOT IN ('credit', 'deposit_transfer') AND occurred_at <= p_end_date AND flow_type = 'IN' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'BANK' AND p_method NOT IN ('credit', 'deposit_transfer') AND occurred_at <= p_end_date AND flow_type = 'OUT' THEN amount ELSE 0 END), 0),

        -- Phải thu (RECEIVABLE)
        COALESCE(SUM(CASE WHEN target_wallet = 'RECEIVABLE' THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'RECEIVABLE' AND occurred_at > p_end_date THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),

        -- Nợ phải trả (DEBT)
        COALESCE(SUM(CASE WHEN target_wallet = 'DEBT' THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'DEBT' AND occurred_at > p_end_date THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),

        -- Doanh thu tích lũy (REVENUE)
        COALESCE(SUM(CASE WHEN target_wallet = 'REVENUE' THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN target_wallet = 'REVENUE' AND occurred_at > p_end_date THEN (CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END) ELSE 0 END), 0)
    INTO
        v_cash_after_start, v_cash_after_end, v_cash_in, v_cash_out,
        v_bank_after_start, v_bank_after_end, v_bank_in, v_bank_out,
        v_receivable_after_start, v_receivable_after_end,
        v_debt_after_start, v_debt_after_end,
        v_revenue_after_start, v_revenue_after_end
    FROM txs;

    -- Đảm bảo không bị null
    v_cash_after_start := COALESCE(v_cash_after_start, 0);
    v_cash_after_end := COALESCE(v_cash_after_end, 0);
    v_cash_in := COALESCE(v_cash_in, 0);
    v_cash_out := COALESCE(v_cash_out, 0);

    v_bank_after_start := COALESCE(v_bank_after_start, 0);
    v_bank_after_end := COALESCE(v_bank_after_end, 0);
    v_bank_in := COALESCE(v_bank_in, 0);
    v_bank_out := COALESCE(v_bank_out, 0);

    v_receivable_after_start := COALESCE(v_receivable_after_start, 0);
    v_receivable_after_end := COALESCE(v_receivable_after_end, 0);

    v_debt_after_start := COALESCE(v_debt_after_start, 0);
    v_debt_after_end := COALESCE(v_debt_after_end, 0);

    v_revenue_after_start := COALESCE(v_revenue_after_start, 0);
    v_revenue_after_end := COALESCE(v_revenue_after_end, 0);

    -- Trả về đúng cấu trúc BalanceStats của Frontend
    RETURN jsonb_build_object(
        'cash', jsonb_build_object(
            'opening', v_cash_bal - v_cash_after_start,
            'in', v_cash_in,
            'out', v_cash_out,
            'closing', v_cash_bal - v_cash_after_end
        ),
        'bank', jsonb_build_object(
            'opening', v_bank_bal - v_bank_after_start,
            'in', v_bank_in,
            'out', v_bank_out,
            'closing', v_bank_bal - v_bank_after_end
        ),
        'receivable', jsonb_build_object(
            'opening', v_receivable_bal - v_receivable_after_start,
            'in', GREATEST(0, (v_receivable_bal - v_receivable_after_end) - (v_receivable_bal - v_receivable_after_start)),
            'out', GREATEST(0, (v_receivable_bal - v_receivable_after_start) - (v_receivable_bal - v_receivable_after_end)),
            'closing', v_receivable_bal - v_receivable_after_end
        ),
        'debt', jsonb_build_object(
            'opening', v_debt_bal - v_debt_after_start,
            'in', GREATEST(0, (v_debt_bal - v_debt_after_end) - (v_debt_bal - v_debt_after_start)),
            'out', GREATEST(0, (v_debt_bal - v_debt_after_start) - (v_debt_bal - v_debt_after_end)),
            'closing', v_debt_bal - v_debt_after_end
        ),
        'revenue', jsonb_build_object(
            'opening', v_revenue_bal - v_revenue_after_start,
            'in', GREATEST(0, (v_revenue_bal - v_revenue_after_end) - (v_revenue_bal - v_revenue_after_start)),
            'out', GREATEST(0, (v_revenue_bal - v_revenue_after_start) - (v_revenue_bal - v_revenue_after_end)),
            'closing', v_revenue_bal - v_revenue_after_end
        )
    );
END;
$function$
;
