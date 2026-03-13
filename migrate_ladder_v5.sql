CREATE OR REPLACE FUNCTION public.fn_generate_pricing_ladder(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_ladder jsonb := '[]'::jsonb;
    v_now timestamptz := now();
    v_check_in timestamptz;
    v_rental_type text;
    v_room_cat_id uuid;
    
    -- Configs
    v_grace_minutes int;
    v_grace_out_enabled boolean;
    v_hourly_unit int;
    v_base_hourly_limit int;
    v_std_check_out_time time;
    v_overnight_checkout_time time;
    v_overnight_start time;
    v_overnight_end time;
    v_full_day_late_after time;
    v_auto_overnight_switch boolean;
    v_auto_full_day_late boolean;
    v_surcharge_mode text;
    v_surcharge_rules jsonb;
    v_ceiling_enabled boolean;
    v_ceiling_percent numeric;
    v_price_daily numeric;
    
    v_milestones timestamptz[] := '{}';
    v_m timestamptz;
    v_tz text := 'Asia/Ho_Chi_Minh';
    v_i int;
    v_rule jsonb;
    v_bill jsonb;
BEGIN
    -- 1. Lấy thông tin Booking & Toàn bộ cấu hình
    SELECT b.check_in_actual, b.rental_type, r.category_id 
    INTO v_check_in, v_rental_type, v_room_cat_id
    FROM public.bookings b 
    JOIN public.rooms r ON b.room_id = r.id 
    WHERE b.id = p_booking_id;

    SELECT 
        grace_minutes, grace_out_enabled, 
        check_out_time, overnight_checkout_time, overnight_start_time, overnight_end_time,
        full_day_late_after, auto_overnight_switch, auto_full_day_late,
        hourly_ceiling_enabled, hourly_ceiling_percent
    INTO 
        v_grace_minutes, v_grace_out_enabled,
        v_std_check_out_time, v_overnight_checkout_time, v_overnight_start, v_overnight_end,
        v_full_day_late_after, v_auto_overnight_switch, v_auto_full_day_late,
        v_ceiling_enabled, v_ceiling_percent
    FROM public.settings WHERE key = 'config' LIMIT 1;

    SELECT 
        price_daily, surcharge_mode, surcharge_rules,
        COALESCE(hourly_unit, 60), COALESCE(base_hourly_limit, 1)
    INTO 
        v_price_daily, v_surcharge_mode, v_surcharge_rules,
        v_hourly_unit, v_base_hourly_limit
    FROM public.room_categories WHERE id = v_room_cat_id;

    -- 2. XÁC ĐỊNH MỐC NHẢY TIỀN (MILESTONES)
    
    -- Mốc 0: Hiện tại
    v_milestones := array_append(v_milestones, v_now);

    -- A. LOGIC PHÒNG GIỜ (HOURLY)
    IF v_rental_type = 'hourly' THEN
        -- Mốc tự động nhảy Qua đêm (nếu bật)
        IF v_auto_overnight_switch THEN
            v_m := ((v_now AT TIME ZONE v_tz)::date + v_overnight_start) AT TIME ZONE v_tz;
            IF v_m < v_now AND v_overnight_start < v_overnight_end THEN v_m := v_m + interval '1 day'; END IF;
            IF v_m > v_now THEN v_milestones := array_append(v_milestones, v_m + interval '1 second'); END IF;
        END IF;

        -- Mốc nhảy block đầu: Check-in + (base_limit * unit) + grace
        -- Chú ý: fn_calculate_room_charge tính v_first_block_min = v_base_block_count * v_hourly_unit
        v_m := v_check_in + (v_base_hourly_limit * v_hourly_unit * interval '1 minute');
        IF v_grace_out_enabled THEN v_m := v_m + (v_grace_minutes * interval '1 minute'); END IF;
        v_m := v_m + interval '1 second';
        IF v_m > v_now THEN v_milestones := array_append(v_milestones, v_m); END IF;

        -- Dò tiếp 24 block tiếp theo
        FOR v_i IN 1..24 LOOP
            -- Mốc nhảy block i: Check-in + base + (i * unit) + grace
            v_m := v_check_in + (v_base_hourly_limit * v_hourly_unit * interval '1 minute') + (v_i * v_hourly_unit * interval '1 minute');
            IF v_grace_out_enabled THEN v_m := v_m + (v_grace_minutes * interval '1 minute'); END IF;
            v_m := v_m + interval '1 second';
            
            IF v_m > v_now AND v_m < v_now + interval '30 hours' THEN
                v_milestones := array_append(v_milestones, v_m);
            END IF;
        END LOOP;
    END IF;

    -- B. LOGIC PHÒNG QUA ĐÊM (OVERNIGHT)
    IF v_rental_type = 'overnight' THEN
        v_m := ((v_now AT TIME ZONE v_tz)::date + v_overnight_checkout_time) AT TIME ZONE v_tz;
        IF v_m < v_now THEN v_m := v_m + interval '1 day'; END IF;
        
        -- Mốc hết giờ + ân hạn
        IF v_grace_out_enabled THEN v_m := v_m + (v_grace_minutes * interval '1 minute'); END IF;
        v_m := v_m + interval '1 second';
        IF v_m > v_now THEN v_milestones := array_append(v_milestones, v_m); END IF;

        -- Phụ thu muộn theo Rules hoặc Amount
        IF v_surcharge_mode = 'rules' AND v_surcharge_rules IS NOT NULL THEN
            FOR v_rule IN SELECT * FROM jsonb_array_elements(v_surcharge_rules) LOOP
                IF v_rule->>'type' = 'Late' THEN
                    v_milestones := array_append(v_milestones, v_m + ( (v_rule->>'to_minute')::int * interval '1 minute' ));
                END IF;
            END LOOP;
        ELSIF v_surcharge_mode = 'amount' THEN
            FOR v_i IN 1..12 LOOP
                v_milestones := array_append(v_milestones, v_m + (v_i * interval '1 hour'));
            END LOOP;
        END IF;
    END IF;

    -- C. LOGIC PHÒNG NGÀY (DAILY)
    IF v_rental_type = 'daily' THEN
        v_m := ((v_now AT TIME ZONE v_tz)::date + v_std_check_out_time) AT TIME ZONE v_tz;
        IF v_m < v_now THEN v_m := v_m + interval '1 day'; END IF;

        -- Mốc hết giờ + ân hạn
        IF v_grace_out_enabled THEN v_m := v_m + (v_grace_minutes * interval '1 minute'); END IF;
        v_m := v_m + interval '1 second';
        IF v_m > v_now THEN v_milestones := array_append(v_milestones, v_m); END IF;

        -- Phụ thu muộn -> Nguyên ngày
        IF v_auto_full_day_late THEN
            v_milestones := array_append(v_milestones, ((v_m AT TIME ZONE v_tz)::date + v_full_day_late_after) AT TIME ZONE v_tz + interval '1 second');
        END IF;
    END IF;

    -- 3. TỔNG HỢP & TÍNH TIỀN CHÍNH XÁC (FINAL CALCULATION)
    -- Sử dụng calculate_booking_bill để đảm bảo logic khớp tuyệt đối
    SELECT jsonb_agg(ladder_item) INTO v_ladder FROM (
        SELECT DISTINCT ON (m_time)
            jsonb_build_object(
                'time', m_time, 
                'amount', (public.calculate_booking_bill(p_booking_id, m_time))->'total_amount',
                'reason', (public.calculate_booking_bill(p_booking_id, m_time))->>'duration_text'
            ) as ladder_item,
            m_time
        FROM unnest(v_milestones) as m_time
        WHERE m_time >= v_now - interval '1 minute'
        ORDER BY m_time ASC
        LIMIT 40
    ) t;

    RETURN COALESCE(v_ladder, '[]'::jsonb);
END;
$$;
