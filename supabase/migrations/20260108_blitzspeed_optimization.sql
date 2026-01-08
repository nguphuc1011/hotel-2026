-- ==========================================
-- CHIẾN DỊCH TỐI ƯU HÓA "CHỚP NHOÁNG" (BLITZSPEED)
-- ==========================================

-- 1. TỐI ƯU HÓA calculate_booking_bill_v2
-- Mục tiêu: Loại bỏ vòng lặp FOR, sử dụng jsonb_to_recordset
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
BEGIN
    -- 1. LẤY DỮ LIỆU TẬP TRUNG (Single Query)
    SELECT 
        b.*, 
        s.value as settings_value,
        COALESCE(b.pricing_snapshot->'prices', rc.prices) as cat_prices,
        COALESCE((b.pricing_snapshot->>'extra_hour_price')::numeric, rc.extra_hour_price, 0) as cat_surcharge_rate
    INTO v_booking 
    FROM public.bookings b 
    JOIN public.rooms r ON b.room_id = r.id 
    LEFT JOIN public.room_categories rc ON r.category_id = rc.id 
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

    -- 2. TÍNH GIÁ PHÒNG GỐC (Logic Phẳng)
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

    -- 3. TÍNH PHỤ THU (Sử dụng jsonb_to_recordset - KHÔNG VÒNG LẶP)
    IF (v_settings->>'enableAutoSurcharge')::boolean = true AND v_booking.rental_type != 'hourly' THEN 
        -- A. NHẬN SỚM
        IF (v_settings->>'early_mode') = 'hourly' THEN
            IF v_check_in::time < (v_settings->>'check_in')::time THEN
                v_early_surcharge := ceil(extract(epoch from ((v_settings->>'check_in')::time - v_check_in::time)) / 3600) * v_surcharge_hourly_rate;
            END IF;
        ELSE
            SELECT COALESCE(SUM(round((v_daily_price * percent / 100) / 1000) * 1000), 0)
            INTO v_early_surcharge
            FROM jsonb_to_recordset(COALESCE(v_settings->'early_rules', '[]'::jsonb)) AS r("from" time, "to" time, "percent" numeric)
            WHERE v_check_in::time >= r."from" AND v_check_in::time <= r."to";
        END IF;

        -- B. TRẢ MUỘN
        IF (v_settings->>'late_mode') = 'hourly' THEN
            IF v_check_out::time > (v_settings->>'check_out')::time THEN
                v_late_surcharge := ceil(extract(epoch from (v_check_out::time - (v_settings->>'check_out')::time)) / 3600) * v_surcharge_hourly_rate;
            END IF;
        ELSE
            SELECT COALESCE(SUM(round((v_daily_price * percent / 100) / 1000) * 1000), 0)
            INTO v_late_surcharge
            FROM jsonb_to_recordset(COALESCE(v_settings->'late_rules', '[]'::jsonb)) AS r("from" time, "to" time, "percent" numeric)
            WHERE v_check_out::time >= r."from" AND v_check_out::time <= r."to";
        END IF;
    END IF;

    -- 4. TỔNG HỢP & DỊCH VỤ (Tối ưu SUM)
    SELECT COALESCE(SUM((val->>'quantity')::numeric * (val->>'price')::numeric), 0) INTO v_service_total
    FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) AS val;

    v_custom_surcharge := COALESCE(v_booking.custom_surcharge, 0);
    v_discount_amount := COALESCE(v_booking.discount_amount, 0);
    
    -- Ghi đè giá gốc nếu là Daily/Overnight và có initial_price
    IF v_booking.rental_type != 'hourly' AND v_booking.initial_price IS NOT NULL THEN
        v_room_charge := v_booking.initial_price;
    END IF;

    v_total_final := v_room_charge + v_early_surcharge + v_late_surcharge + v_service_total + v_custom_surcharge - v_discount_amount;
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

-- 2. TỐI ƯU HÓA get_checkout_details
-- Mục tiêu: Loại bỏ regexp_replace, chuẩn hóa ép kiểu trực tiếp
CREATE OR REPLACE FUNCTION public.get_checkout_details(p_booking_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bill jsonb;
BEGIN
    -- Sử dụng trực tiếp bộ não calculate_booking_bill_v2 để đảm bảo đồng nhất
    v_bill := public.calculate_booking_bill_v2(p_booking_id);
    
    RETURN json_build_object(
        'room_charge', (v_bill->>'room_charge')::numeric,
        'service_charges', COALESCE((SELECT services_used FROM public.bookings WHERE id = p_booking_id), '[]'::jsonb),
        'total_amount', (v_bill->>'total_final')::numeric
    );
END;
$$;
