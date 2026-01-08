-- ==========================================================
-- Migration: Consolidated Checkout and Pricing Fix
-- Description: Khôi phục calculate_booking_bill_v2 và handle_checkout chuẩn hóa
-- Author: Trae AI Assistant
-- Date: 2026-01-08
-- ==========================================================

-- 1. KHÔI PHỤC HÀM TÍNH TIỀN (calculate_booking_bill_v2)
DROP FUNCTION IF EXISTS public.calculate_booking_bill_v2(uuid);
DROP FUNCTION IF EXISTS public.calculate_booking_bill_v2(p_booking_id uuid);

CREATE OR REPLACE FUNCTION public.calculate_booking_bill_v2(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking RECORD;
    v_strategy jsonb;
    v_check_in timestamptz;
    v_check_out timestamptz;
    v_now timestamptz := now();
    
    v_room_price numeric := 0;
    v_service_total numeric := 0;
    v_early_surcharge numeric := 0;
    v_late_surcharge numeric := 0;
    v_total_amount numeric := 0;
    v_discount_amount numeric := 0;
    v_custom_surcharge numeric := 0;
    
    v_services jsonb;
    v_duration_text text;
    v_rule jsonb;
    v_diff interval;
BEGIN
    -- Lấy dữ liệu Booking
    SELECT 
        b.*, r.room_number, rc.prices as category_prices,
        c.full_name as customer_name, c.balance as customer_balance,
        s.compiled_pricing_strategy as strategy,
        s.value as settings_value
    INTO v_booking
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.room_categories rc ON r.category_id = rc.id
    LEFT JOIN public.customers c ON b.customer_id = c.id
    CROSS JOIN (SELECT compiled_pricing_strategy, value FROM public.settings WHERE key = 'system_settings') s
    WHERE b.id = p_booking_id;

    IF v_booking.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    v_strategy := COALESCE(v_booking.strategy, '{}'::jsonb);
    v_check_in := v_booking.check_in_at;
    v_check_out := COALESCE(v_booking.check_out_at, v_now);
    v_discount_amount := COALESCE(v_booking.discount_amount, 0);
    v_custom_surcharge := COALESCE(v_booking.custom_surcharge, 0);
    
    v_diff := v_check_out - v_check_in;

    -- TÍNH GIÁ PHÒNG GỐC
    IF v_booking.rental_type = 'hourly' THEN
        DECLARE
            v_base_hours numeric := COALESCE((v_booking.value->>'baseHours')::numeric, 1);
            v_grace_minutes numeric := COALESCE((v_booking.value->>'initial_grace_minutes')::numeric, 0);
            v_total_seconds numeric := extract(epoch from v_diff);
            v_billable_hours numeric;
        BEGIN
            -- Nếu tổng thời gian (trừ đi thời gian ân hạn) vượt quá block đầu
            IF v_total_seconds > (v_base_hours * 3600 + v_grace_minutes * 60) THEN
                -- Số giờ tính thêm = ceil((tổng giây - block đầu giây) / 3600)
                v_billable_hours := ceil((v_total_seconds - v_base_hours * 3600) / 3600);
                v_room_price := COALESCE((v_booking.category_prices->>'hourly')::numeric, 0) + 
                                (v_billable_hours * COALESCE((v_booking.category_prices->>'next_hour')::numeric, 0));
            ELSE
                v_room_price := COALESCE((v_booking.category_prices->>'hourly')::numeric, 0);
            END IF;
        END;
    ELSIF v_booking.rental_type = 'overnight' THEN
        v_room_price := COALESCE((v_booking.category_prices->>'overnight')::numeric, 0);
    ELSE
        v_room_price := COALESCE((v_booking.category_prices->>'daily')::numeric, 0);
    END IF;

    -- PHỤ PHÍ THEO STRATEGY (Nếu là Daily)
    IF v_booking.rental_type = 'daily' THEN
        -- Sớm
        IF v_check_in::time < (v_strategy->>'check_in_time')::time THEN
            FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_strategy->'early_rules', '[]'::jsonb)) LOOP
                IF v_check_in::time >= (v_rule->>'from')::time AND v_check_in::time <= (v_rule->>'to')::time THEN
                    v_early_surcharge := (v_rule->>'amount')::numeric; EXIT;
                END IF;
            END LOOP;
        END IF;
        -- Muộn
        IF v_check_out::time > (v_strategy->>'check_out_time')::time THEN
            FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_strategy->'late_rules', '[]'::jsonb)) LOOP
                IF v_check_out::time >= (v_rule->>'from')::time AND v_check_out::time <= (v_rule->>'to')::time THEN
                    v_late_surcharge := (v_rule->>'amount')::numeric; EXIT;
                END IF;
            END LOOP;
        END IF;
    END IF;

    -- DỊCH VỤ
    SELECT COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::numeric), 0), jsonb_agg(item)
    INTO v_service_total, v_services
    FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) AS item;

    -- TỔNG CỘNG
    v_total_amount := v_room_price + v_early_surcharge + v_late_surcharge + v_service_total + v_custom_surcharge - v_discount_amount;

    RETURN jsonb_build_object(
        'success', true,
        'room_charge', v_room_price,
        'service_charge', v_service_total,
        'surcharge', v_early_surcharge + v_late_surcharge + v_custom_surcharge,
        'discount_amount', v_discount_amount,
        'total_final', v_total_amount,
        'customer_balance', COALESCE(v_booking.customer_balance, 0)
    );
END;
$$;

-- 2. KHÔI PHỤC HÀM CHECKOUT (handle_checkout)
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, numeric, text, numeric, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, numeric, text, numeric, numeric, text, uuid, numeric, numeric);

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

    -- Tính bill
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

    -- Ghi Ledger (Trigger sẽ tự động tính nợ)
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

    -- Cập nhật thống kê chi tiêu (KHÔNG cập nhật balance)
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers SET total_spent = COALESCE(total_spent, 0) + v_booking_revenue, last_visit = now() WHERE id = v_customer_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'total_revenue', v_booking_revenue, 'amount_paid', p_amount_paid);
END;
$$;

NOTIFY pgrst, 'reload schema';
