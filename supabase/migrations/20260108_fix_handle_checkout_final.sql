-- ==========================================================
-- Migration: Consolidated Checkout and Pricing Fix (V3 OVERWRITE)
-- Description: Đè bản V3 của Thừa tướng lên calculate_booking_bill_v2
-- Author: Thừa tướng (via Trae AI)
-- Date: 2026-01-08
-- ==========================================================

-- 1. GHI ĐÈ HÀM TÍNH TIỀN (calculate_booking_bill_v2) BẰNG LOGIC V3
DROP FUNCTION IF EXISTS public.calculate_booking_bill_v2(uuid);
DROP FUNCTION IF EXISTS public.calculate_booking_bill_v2(p_booking_id uuid);

CREATE OR REPLACE FUNCTION public.calculate_booking_bill_v2(p_booking_id uuid) 
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$ 
DECLARE 
    v_booking RECORD; 
    v_settings jsonb; 
    v_strategy jsonb; 
    v_check_in timestamptz; 
    v_check_out timestamptz; 
    v_now timestamptz := now(); 
    
    v_room_price numeric := 0; 
    v_early_surcharge numeric := 0; 
    v_late_surcharge numeric := 0; 
    v_service_total numeric := 0; 
    v_total_amount numeric := 0; 
    
    v_diff interval; 
    v_total_seconds numeric; 
    v_rule jsonb; 
    v_room_cat_prices jsonb; 
BEGIN 
    -- 1. LẤY DỮ LIỆU BOOKING & SETTINGS (Snapshot priority)
    SELECT 
        b.*, 
        -- Ưu tiên lấy settings từ snapshot của booking, nếu không có mới lấy từ bảng settings
        COALESCE(b.pricing_snapshot->'settings', s.value) as settings_value,
        COALESCE(b.pricing_snapshot->'strategy', s.compiled_pricing_strategy->'config') as strategy_config,
        rc.prices as cat_prices
    INTO v_booking 
    FROM public.bookings b 
    JOIN public.rooms r ON b.room_id = r.id 
    LEFT JOIN public.room_categories rc ON r.category_id = rc.id 
    CROSS JOIN (SELECT value, compiled_pricing_strategy FROM public.settings WHERE key = 'system_settings') s 
    WHERE b.id = p_booking_id; 

    IF v_booking.id IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); 
    END IF; 

    -- Giải nén các nút gạt và thông số từ settings_value (Snapshot hoặc Live)
    v_settings := v_booking.settings_value; 
    v_strategy := v_booking.strategy_config; 
    v_check_in := v_booking.check_in_at; 
    v_check_out := COALESCE(v_booking.check_out_at, v_now); 
    v_room_cat_prices := COALESCE(v_booking.pricing_snapshot->'prices', v_booking.cat_prices); 
    v_diff := v_check_out - v_check_in; 
    v_total_seconds := extract(epoch from v_diff); 

    -- 2. TÍNH GIÁ PHÒNG GỐC (ƯU TIÊN INITIAL_PRICE NẾU CÓ) 
    IF v_booking.rental_type = 'hourly' THEN 
        DECLARE 
            v_base_h numeric := (v_settings->>'baseHours')::numeric; 
            v_grace_m numeric := CASE WHEN (v_settings->>'initial_grace_enabled')::boolean THEN (v_settings->>'initial_grace_minutes')::numeric ELSE 0 END; 
            v_hourly_price numeric := COALESCE((v_room_cat_prices->>'hourly')::numeric, 0); 
            v_next_hour_price numeric := COALESCE((v_room_cat_prices->>'next_hour')::numeric, 0); 
        BEGIN 
            -- Nếu vượt quá block đầu + ân hạn 
            IF v_total_seconds > (v_base_h * 3600 + v_grace_m * 60) THEN 
                v_room_price := v_hourly_price + ceil((v_total_seconds - v_base_h * 3600) / 3600) * v_next_hour_price; 
            ELSE 
                v_room_price := v_hourly_price; 
            END IF; 
            
            -- NÚT GẠT: TRẦN TIỀN GIỜ (Hourly Ceiling) 
            IF (v_settings->>'hourly_ceiling_enabled')::boolean = true THEN 
                v_room_price := LEAST(v_room_price, COALESCE((v_room_cat_prices->>'daily')::numeric, 0)); 
            END IF; 
        END; 
    ELSIF v_booking.rental_type = 'overnight' THEN 
        v_room_price := COALESCE((v_room_cat_prices->>'overnight')::numeric, 0); 
    ELSE -- Daily 
        v_room_price := COALESCE((v_room_cat_prices->>'daily')::numeric, 0); 
    END IF; 

    -- Ghi đè bằng giá thỏa thuận nếu Bệ Hạ đã chốt lúc vào 
    v_room_price := COALESCE(v_booking.initial_price, v_room_price); 

    -- 3. LOGIC PHỤ THU (CHỈ KHI NÚT GẠT TỰ ĐỘNG BẬT) 
    IF (v_settings->>'enableAutoSurcharge')::boolean = true AND v_booking.rental_type != 'hourly' THEN 
        
        -- Phụ thu Sớm (Early) 
        IF v_check_in::time < (v_settings->>'check_in')::time THEN 
            FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_strategy->'early_rules', '[]'::jsonb)) LOOP 
                IF v_check_in::time <= (v_rule->>'limit')::time THEN 
                    v_early_surcharge := (v_room_price * (v_rule->>'pct')::numeric / 100); 
                    EXIT; -- Lấy mốc cao nhất phù hợp 
                END IF; 
            END LOOP; 
        END IF; 

        -- Phụ thu Muộn (Late) 
        DECLARE 
            v_check_out_std time := CASE WHEN v_booking.rental_type = 'overnight' THEN (v_settings->>'overnight_checkout')::time ELSE (v_settings->>'check_out')::time END; 
            v_late_grace numeric := CASE WHEN (v_settings->>'late_grace_enabled')::boolean THEN (v_settings->>'late_grace_minutes')::numeric ELSE 0 END; 
        BEGIN 
            -- Chỉ tính muộn nếu vượt quá giờ chuẩn + phút ân hạn 
            IF v_check_out::time > (v_check_out_std + (v_late_grace || ' minutes')::interval) THEN 
                FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_strategy->'late_rules', '[]'::jsonb)) LOOP 
                    IF v_check_out::time <= (v_rule->>'limit')::time THEN 
                        v_late_surcharge := (v_room_price * (v_rule->>'pct')::numeric / 100); 
                        EXIT; 
                    END IF; 
                END LOOP; 
            END IF; 
        END; 
    END IF; 

    -- 4. TÍNH DỊCH VỤ & TỔNG KẾT 
    SELECT COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::numeric), 0) INTO v_service_total 
    FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) AS item; 

    v_total_amount := v_room_price + v_early_surcharge + v_late_surcharge + v_service_total + 
                      COALESCE(v_booking.custom_surcharge, 0) - COALESCE(v_booking.discount_amount, 0); 

    RETURN jsonb_build_object( 
        'success', true, 
        'room_charge', v_room_price, 
        'early_surcharge', v_early_surcharge, 
        'late_surcharge', v_late_surcharge, 
        'service_charge', v_service_total, 
        'custom_surcharge', COALESCE(v_booking.custom_surcharge, 0), 
        'discount_amount', COALESCE(v_booking.discount_amount, 0), 
        'total_final', v_total_amount, 
        'rental_type', v_booking.rental_type,
        'surcharge', v_early_surcharge + v_late_surcharge + COALESCE(v_booking.custom_surcharge, 0) -- Tương thích cũ
    ); 
END; 
$$;

-- 2. KHÔI PHỤC HÀM CHECKOUT (handle_checkout)
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_amount_paid numeric,              
    p_payment_method text DEFAULT 'CASH',
    p_surcharge numeric DEFAULT 0,      
    p_discount numeric DEFAULT 0,       
    p_notes text DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_booking_revenue numeric;
    v_customer_id uuid;
    v_staff_id uuid;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());

    -- Cập nhật thông tin phụ vào booking trước khi tính bill
    UPDATE public.bookings SET discount_amount = p_discount, custom_surcharge = p_surcharge WHERE id = p_booking_id;

    -- Tính bill (GỌI HÀM V3 MỚI)
    v_bill := public.calculate_booking_bill_v2(p_booking_id);
    IF NOT (v_bill->>'success')::boolean THEN RETURN v_bill; END IF;

    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    v_customer_id := v_booking.customer_id;
    v_booking_revenue := (v_bill->>'total_final')::numeric; 

    -- Cập nhật trạng thái Booking & Phòng
    UPDATE public.bookings SET status = 'completed', check_out_at = now(), total_amount = v_booking_revenue, 
           notes = COALESCE(notes, '') || E'\n' || COALESCE(p_notes, ''), payment_method = p_payment_method
    WHERE id = p_booking_id;

    UPDATE public.rooms SET status = 'dirty', current_booking_id = NULL, last_status_change = now() WHERE id = v_booking.room_id;

    -- Ghi Ledger
    INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
    VALUES (p_booking_id, v_customer_id, 'REVENUE', 'ROOM', (v_bill->>'room_charge')::numeric, 'Tiền phòng', v_staff_id, p_payment_method);

    IF (v_bill->>'service_charge')::numeric > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'REVENUE', 'SERVICE', (v_bill->>'service_charge')::numeric, 'Dịch vụ', v_staff_id, p_payment_method);
    END IF;

    IF (v_bill->>'surcharge')::numeric > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'REVENUE', 'SURCHARGE', (v_bill->>'surcharge')::numeric, 'Phụ phí', v_staff_id, p_payment_method);
    END IF;
    
    IF (v_bill->>'discount_amount')::numeric > 0 THEN
         INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
         VALUES (p_booking_id, v_customer_id, 'EXPENSE', 'DISCOUNT', (v_bill->>'discount_amount')::numeric, 'Giảm giá', v_staff_id, p_payment_method);
    END IF;

    IF p_amount_paid > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'PAYMENT', 'ROOM', p_amount_paid, 'Khách thanh toán', v_staff_id, p_payment_method);
    END IF;

    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers SET total_spent = COALESCE(total_spent, 0) + v_booking_revenue, last_visit = now() WHERE id = v_customer_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'total_revenue', v_booking_revenue, 'amount_paid', p_amount_paid);
END;
$$;

-- 3. CẬP NHẬT MÁY ẢNH SNAPSHOT (Linh hoạt: Tự làm mới khi đổi phòng/loại hình thuê)
CREATE OR REPLACE FUNCTION public.fn_create_booking_pricing_snapshot()
RETURNS TRIGGER AS $$
DECLARE
    v_settings_val jsonb;
    v_strategy jsonb;
    v_prices jsonb;
    v_category_name TEXT;
    v_should_refresh BOOLEAN := FALSE;
BEGIN
    -- Kiểm tra điều kiện chụp ảnh:
    -- 1. Khi mới Check-in (INSERT hoặc UPDATE status)
    -- 2. Khi đang ở (checked_in) mà ĐỔI PHÒNG hoặc ĐỔI LOẠI HÌNH THUÊ
    -- 3. Khi Lễ tân muốn ép làm mới (bằng cách set pricing_snapshot = NULL trong lệnh UPDATE)
    
    IF (TG_OP = 'INSERT' AND NEW.status = 'checked_in') THEN
        v_should_refresh := TRUE;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.status != 'checked_in' AND NEW.status = 'checked_in') THEN
            v_should_refresh := TRUE;
        ELSIF (NEW.status = 'checked_in') THEN
            IF (OLD.room_id != NEW.room_id OR OLD.rental_type != NEW.rental_type OR NEW.pricing_snapshot IS NULL) THEN
                v_should_refresh := TRUE;
            END IF;
        END IF;
    END IF;

    IF v_should_refresh THEN
        -- Chụp ảnh toàn bộ Settings và Strategy mới nhất
        SELECT value, compiled_pricing_strategy INTO v_settings_val, v_strategy
        FROM public.settings 
        WHERE key = 'system_settings';

        -- Chụp ảnh giá từ phòng mới/hiện tại
        SELECT COALESCE(rc.prices, r.prices), rc.name
        INTO v_prices, v_category_name
        FROM public.rooms r
        LEFT JOIN public.room_categories rc ON r.category_id = rc.id
        WHERE r.id = NEW.room_id;

        -- Ghi đè Snapshot mới
        NEW.pricing_snapshot := jsonb_build_object(
            'settings', v_settings_val,
            'strategy', v_strategy->'config',
            'prices', v_prices,
            'category_name', v_category_name,
            'refreshed_at', NOW(),
            'refresh_reason', CASE 
                WHEN (TG_OP = 'UPDATE' AND OLD.room_id != NEW.room_id) THEN 'Đổi phòng'
                WHEN (TG_OP = 'UPDATE' AND OLD.rental_type != NEW.rental_type) THEN 'Đổi loại hình thuê'
                WHEN (TG_OP = 'UPDATE' AND OLD.pricing_snapshot IS NOT NULL AND NEW.pricing_snapshot IS NULL) THEN 'Lễ tân làm mới thủ công'
                ELSE 'Khởi tạo lúc Check-in'
            END
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_booking_pricing_snapshot ON public.bookings;
CREATE TRIGGER trg_create_booking_pricing_snapshot
    BEFORE INSERT OR UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_create_booking_pricing_snapshot();

NOTIFY pgrst, 'reload schema';
