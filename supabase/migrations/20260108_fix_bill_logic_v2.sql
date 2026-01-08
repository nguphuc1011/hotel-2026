CREATE OR REPLACE FUNCTION public.calculate_booking_bill_v2(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_booking RECORD;
    v_settings jsonb;
    v_check_in timestamptz;
    v_check_out timestamptz;
    v_room_charge numeric := 0;
    v_early_surcharge numeric := 0;
    v_late_surcharge numeric := 0;
    v_service_total numeric := 0;
    v_custom_surcharge numeric := 0;
    v_discount_amount numeric := 0;
    v_total_final numeric := 0;
    v_total_seconds numeric;
    v_room_cat_prices jsonb;
    v_surcharge_hourly_rate numeric;
    v_daily_price numeric;
    v_rule jsonb;
    v_rule_amount numeric;
BEGIN
    -- 1. LẤY DỮ LIỆU
    SELECT 
        b.*, 
        s.value as settings_value,
        COALESCE(b.pricing_snapshot->'prices', rc.prices) as cat_prices,
        COALESCE((b.pricing_snapshot->>'surcharge_hourly_rate')::numeric, rc.surcharge_hourly_rate, 0) as cat_surcharge_rate,
        COALESCE(c.balance, 0) as customer_balance
    INTO v_booking 
    FROM public.bookings b 
    JOIN public.rooms r ON b.room_id = r.id 
    LEFT JOIN public.room_categories rc ON r.category_id = rc.id 
    LEFT JOIN public.customers c ON b.customer_id = c.id
    CROSS JOIN (SELECT value FROM public.settings WHERE key = 'system_settings' LIMIT 1) s 
    WHERE b.id = p_booking_id; 

    IF v_booking.id IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); 
    END IF; 

    v_settings := v_booking.settings_value; 
    v_check_in := timezone('UTC', v_booking.check_in_at); 
    v_check_out := timezone('UTC', COALESCE(v_booking.check_out_at, now())); 
    v_room_cat_prices := v_booking.cat_prices; 
    v_surcharge_hourly_rate := v_booking.cat_surcharge_rate;
    v_daily_price := COALESCE((v_room_cat_prices->>'daily')::numeric, 0);
    v_total_seconds := extract(epoch from (v_check_out - v_check_in)); 

    -- 2. TÍNH GIÁ PHÒNG GỐC
    IF v_booking.rental_type = 'hourly' THEN 
        DECLARE 
            v_base_h numeric := COALESCE((v_settings->>'baseHours')::numeric, 2); 
            v_unit_m numeric := COALESCE((v_settings->>'hourUnit')::numeric, 60); 
            v_grace_m numeric := CASE WHEN (v_settings->>'initial_grace_enabled')::boolean THEN (v_settings->>'initial_grace_minutes')::numeric ELSE 0 END; 
            v_hourly_price numeric := COALESCE((v_room_cat_prices->>'hourly')::numeric, 0); 
            v_next_hour_price numeric := COALESCE((v_room_cat_prices->>'next_hour')::numeric, 0); 
        BEGIN 
            IF v_total_seconds > (v_base_h * 3600 + v_grace_m * 60) THEN 
                v_room_charge := v_hourly_price + ceil((v_total_seconds - v_base_h * 3600) / (v_unit_m * 60)) * v_next_hour_price; 
            ELSE 
                v_room_charge := v_hourly_price; 
            END IF; 
            IF (v_settings->>'hourly_ceiling_enabled')::boolean = true THEN 
                v_room_charge := LEAST(v_room_charge, (v_daily_price * COALESCE((v_settings->>'hourly_ceiling_percent')::numeric, 100) / 100)); 
            END IF; 
        END; 
    ELSIF v_booking.rental_type = 'overnight' THEN 
        v_room_charge := COALESCE((v_room_cat_prices->>'overnight')::numeric, 0); 
    ELSE 
        v_room_charge := v_daily_price; 
    END IF; 

    -- 3. TÍNH PHỤ THU
    IF (v_settings->>'enableAutoSurcharge')::boolean = true AND v_booking.rental_type != 'hourly' THEN 
        -- A. NHẬN SỚM
        IF (v_settings->>'early_mode') = 'hourly' THEN
            DECLARE
                v_std_in time := (v_settings->>'check_in')::time;
                v_early_s numeric;
            BEGIN
                IF v_check_in::time < v_std_in THEN
                    v_early_s := extract(epoch from (v_std_in - v_check_in::time));
                    v_early_surcharge := ceil(v_early_s / 3600) * v_surcharge_hourly_rate;
                END IF;
            END;
        ELSE
            FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_settings->'early_rules', '[]'::jsonb)) LOOP
                IF v_check_in::time >= (v_rule->>'from')::time AND v_check_in::time <= (v_rule->>'to')::time THEN
                    v_rule_amount := (v_daily_price * (v_rule->>'percent')::numeric / 100);
                    v_early_surcharge := v_early_surcharge + round(v_rule_amount / 1000) * 1000;
                END IF;
            END LOOP;
        END IF;

        -- B. TRẢ MUỘN
        IF (v_settings->>'late_mode') = 'hourly' THEN
            DECLARE
                v_std_out time := (v_settings->>'check_out')::time;
                v_late_s numeric;
            BEGIN
                IF v_check_out::time > v_std_out THEN
                    v_late_s := extract(epoch from (v_check_out::time - v_std_out));
                    v_late_surcharge := ceil(v_late_s / 3600) * v_surcharge_hourly_rate;
                END IF;
            END;
        ELSE
            FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_settings->'late_rules', '[]'::jsonb)) LOOP
                IF v_check_out::time >= (v_rule->>'from')::time AND v_check_out::time <= (v_rule->>'to')::time THEN
                    v_rule_amount := (v_daily_price * (v_rule->>'percent')::numeric / 100);
                    v_late_surcharge := v_late_surcharge + round(v_rule_amount / 1000) * 1000;
                END IF;
            END LOOP;
        END IF;
    END IF;

    -- 4. TỔNG HỢP & DỊCH VỤ
    SELECT COALESCE(SUM((val->>'quantity')::numeric * (val->>'price')::numeric), 0) INTO v_service_total
    FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) AS val;

    v_custom_surcharge := COALESCE(v_booking.custom_surcharge, 0);
    v_discount_amount := COALESCE(v_booking.discount_amount, 0);
    
    IF v_booking.rental_type != 'hourly' AND v_booking.initial_price IS NOT NULL THEN
        v_room_charge := v_booking.initial_price;
    END IF;

    v_total_final := v_room_charge + v_early_surcharge + v_late_surcharge + v_service_total + v_custom_surcharge - v_discount_amount;

    -- CHỐT HẠ LÀM TRÒN HÀNG NGHÌN THEO QUÂN LỆNH
    v_total_final := round(v_total_final / 1000) * 1000;

    RETURN jsonb_build_object(
        'success', true,
        'room_charge', v_room_charge,
        'early_surcharge', v_early_surcharge,
        'late_surcharge', v_late_surcharge,
        'service_total', v_service_total,
        'total_final', v_total_final,
        'final_amount', v_total_final
    );
END;
$function$;