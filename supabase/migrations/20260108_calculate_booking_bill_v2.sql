-- ==========================================================
-- RPC: calculate_booking_bill_v2
-- Version: 2.2 (Sửa lỗi logic phụ phí: Dùng Amount trực tiếp từ Strategy)
-- Author: Trae AI Assistant
-- Date: 2026-01-08
-- ==========================================================

DROP FUNCTION IF EXISTS public.calculate_booking_bill_v2(uuid);
DROP FUNCTION IF EXISTS public.calculate_booking_bill_v2(p_booking_id uuid);

CREATE OR REPLACE FUNCTION public.calculate_booking_bill_v2(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_booking RECORD;
    v_customer_balance numeric := 0; 
    v_strategy jsonb;
    v_check_in timestamptz;
    v_check_out timestamptz;
    v_now timestamptz := now();
    
    v_room_price numeric := 0;
    v_service_total numeric := 0;
    v_early_surcharge numeric := 0;
    v_late_surcharge numeric := 0;
    v_total_amount numeric := 0;
    
    v_services jsonb;
    v_duration_text text;
    v_rule jsonb;
    v_diff interval;
    v_total_hours numeric;
    
    v_is_overdue boolean := false;
BEGIN
    -- 1. Lấy dữ liệu Booking, Bản đồ chiến lược và Nợ cũ khách hàng
    SELECT 
        b.id, b.room_id, b.customer_id, b.check_in_at, b.check_out_at, 
        b.rental_type, b.initial_price, b.deposit_amount, b.services_used,
        r.room_number,
        rc.prices as category_prices,
        c.full_name as customer_name,
        s.compiled_pricing_strategy as strategy,
        COALESCE(c.balance, 0) as customer_balance
    INTO v_booking
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.room_categories rc ON r.category_id = rc.id
    LEFT JOIN public.customers c ON b.customer_id = c.id
    CROSS JOIN (SELECT compiled_pricing_strategy FROM public.settings WHERE key = 'system_settings') s
    WHERE b.id = p_booking_id;

    IF v_booking.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking: ' || p_booking_id);
    END IF;

    v_strategy := COALESCE(v_booking.strategy, '{}'::jsonb);
    v_check_in := v_booking.check_in_at;
    v_check_out := COALESCE(v_booking.check_out_at, v_now);
    v_customer_balance := v_booking.customer_balance;
    
    v_diff := v_check_out - v_check_in;
    v_total_hours := extract(epoch from v_diff) / 3600;

    -- 2. LOGIC TÍNH GIÁ GỐC (BASE PRICE)
    IF COALESCE(v_booking.initial_price, 0) > 0 THEN
        v_room_price := v_booking.initial_price;
    ELSE
        IF v_booking.rental_type = 'hourly' THEN
            v_room_price := COALESCE((v_booking.category_prices->>'hourly')::numeric, 0);
            IF v_total_hours > 1 THEN
                v_room_price := v_room_price + (ceil(v_total_hours - 1) * COALESCE((v_booking.category_prices->>'next_hour')::numeric, 0));
            END IF;
        ELSIF v_booking.rental_type = 'overnight' THEN
            v_room_price := COALESCE((v_booking.category_prices->>'overnight')::numeric, 0);
        ELSE
            v_room_price := COALESCE((v_booking.category_prices->>'daily')::numeric, 0);
        END IF;
    END IF;

    v_room_price := COALESCE(v_room_price, 0);

    -- 3. PHỤ PHÍ (Lấy tiền trực tiếp từ Strategy)
    IF v_booking.rental_type = 'daily' THEN
        -- Sớm
        IF v_check_in::time < (v_strategy->>'check_in_time')::time AND v_check_in::date = v_check_out::date THEN
            FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_strategy->'early_rules', '[]'::jsonb)) LOOP
                IF v_check_in::time >= (v_rule->>'from')::time AND v_check_in::time <= (v_rule->>'to')::time THEN
                    v_early_surcharge := (v_rule->>'amount')::numeric;
                    EXIT;
                END IF;
            END LOOP;
        END IF;
        -- Muộn
        IF v_check_out::time > (v_strategy->>'check_out_time')::time THEN
            FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_strategy->'late_rules', '[]'::jsonb)) LOOP
                IF v_check_out::time >= (v_rule->>'from')::time AND v_check_out::time <= (v_rule->>'to')::time THEN
                    v_late_surcharge := (v_rule->>'amount')::numeric;
                    EXIT;
                END IF;
            END LOOP;
        END IF;
    END IF;

    -- 4. Tiền dịch vụ
    SELECT 
        COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::numeric), 0),
        jsonb_agg(item)
    INTO v_service_total, v_services
    FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) AS item;

    -- 5. Tổng hợp
    v_total_amount := v_room_price + v_early_surcharge + v_late_surcharge + v_service_total;

    v_duration_text :=
        CASE WHEN extract(day from v_diff) > 0 THEN extract(day from v_diff) || ' ngày ' ELSE '' END ||
        CASE WHEN extract(hour from v_diff) > 0 THEN extract(hour from v_diff)::int % 24 || ' giờ ' ELSE '' END ||
        (extract(minute from v_diff)::int % 60) || ' phút';

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'room_number', v_booking.room_number,
        'customer_name', v_booking.customer_name,
        'rental_type', v_booking.rental_type,
        'check_in_at', v_check_in,
        'check_out_at', v_check_out,
        'duration_text', v_duration_text,
        'room_charge', v_room_price,
        'early_surcharge', v_early_surcharge,
        'late_surcharge', v_late_surcharge,
        'service_charges', COALESCE(v_services, '[]'::jsonb),
        'total_amount', v_total_amount,
        'deposit', COALESCE(v_booking.deposit_amount, 0),
        'customer_balance', v_customer_balance,
        'final_amount', v_total_amount - COALESCE(v_booking.deposit_amount, 0) - v_customer_balance
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', SQLERRM,
        'detail', SQLSTATE
    );
END;
$function$;
