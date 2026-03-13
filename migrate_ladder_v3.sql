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
    v_grace_in_enabled boolean;
    v_grace_out_enabled boolean;
    v_hourly_unit int;
    v_base_hourly_limit int;
    v_std_check_out_time time;
    v_overnight_start time;
    v_overnight_end time;
    v_full_day_late_after time;
    v_full_day_early_before time;
    v_auto_overnight_switch boolean;
    v_auto_full_day_early boolean;
    v_auto_full_day_late boolean;
    
    v_test_time timestamptz;
    v_milestones timestamptz[] := '{}';
    v_m timestamptz;
    v_tz text := 'Asia/Ho_Chi_Minh';
    v_i int;
BEGIN
    -- 1. Lấy thông tin Booking & Toàn bộ cấu hình (Cẩn thận từng tham số)
    SELECT b.check_in_actual, b.rental_type, r.category_id 
    INTO v_check_in, v_rental_type, v_room_cat_id
    FROM public.bookings b 
    JOIN public.rooms r ON b.room_id = r.id 
    WHERE b.id = p_booking_id;

    SELECT 
        grace_minutes, grace_in_enabled, grace_out_enabled, 
        check_out_time, overnight_start_time, overnight_end_time,
        full_day_late_after, full_day_early_before,
        auto_overnight_switch, auto_full_day_early, auto_full_day_late,
        COALESCE(hourly_unit, 60), COALESCE(base_hourly_limit, 1)
    INTO 
        v_grace_minutes, v_grace_in_enabled, v_grace_out_enabled,
        v_std_check_out_time, v_overnight_start, v_overnight_end,
        v_full_day_late_after, v_full_day_early_before,
        v_auto_overnight_switch, v_auto_full_day_early, v_auto_full_day_late,
        v_hourly_unit, v_base_hourly_limit
    FROM public.settings WHERE key = 'config' LIMIT 1;

    -- 2. DÒ MỐC (MILESTONE DETECTION)
    
    -- Mốc 0: Hiện tại
    v_milestones := array_append(v_milestones, v_now);

    -- A. LOGIC PHÒNG GIỜ (HOURLY)
    IF v_rental_type = 'hourly' THEN
        -- Mốc chuyển đổi sang Qua đêm tự động (nếu bật)
        IF v_auto_overnight_switch THEN
            v_m := ((v_now AT TIME ZONE v_tz)::date + v_overnight_start) AT TIME ZONE v_tz;
            IF v_m < v_now AND v_overnight_start < v_overnight_end THEN v_m := v_m + interval '1 day'; END IF;
            IF v_m > v_now THEN v_milestones := array_append(v_milestones, v_m); END IF;
        END IF;

        -- Các mốc nhảy block giờ
        v_test_time := v_check_in + (v_base_hourly_limit * interval '1 hour');
        -- Mốc hết block đầu + ân hạn
        v_m := v_test_time + (CASE WHEN v_grace_out_enabled THEN v_grace_minutes ELSE 0 END * interval '1 minute') + interval '1 second';
        IF v_m > v_now THEN v_milestones := array_append(v_milestones, v_m); END IF;

        -- Dò tiếp 12 block tiếp theo
        FOR v_i IN 1..12 LOOP
            v_test_time := v_test_time + (v_hourly_unit * interval '1 minute');
            v_m := v_test_time + (CASE WHEN v_grace_out_enabled THEN v_grace_minutes ELSE 0 END * interval '1 minute') + interval '1 second';
            IF v_m > v_now AND v_m < v_now + interval '24 hours' THEN
                v_milestones := array_append(v_milestones, v_m);
            END IF;
        END LOOP;
    END IF;

    -- B. LOGIC PHÒNG NGÀY/ĐÊM (DAILY/OVERNIGHT)
    IF v_rental_type IN ('daily', 'overnight') THEN
        -- Mốc trả phòng tiêu chuẩn
        v_test_time := ((v_now AT TIME ZONE v_tz)::date + v_std_check_out_time) AT TIME ZONE v_tz;
        IF v_test_time < v_now THEN v_test_time := v_test_time + interval '1 day'; END IF;

        -- Mốc bắt đầu tính phụ thu Muộn (nếu bật)
        IF v_auto_full_day_late THEN
            v_m := v_test_time + (CASE WHEN v_grace_out_enabled THEN v_grace_minutes ELSE 0 END * interval '1 minute') + interval '1 second';
            IF v_m > v_now THEN v_milestones := array_append(v_milestones, v_m); END IF;

            -- Mốc nhảy sang tính Nguyên ngày (Full day late after)
            v_m := ((v_test_time AT TIME ZONE v_tz)::date + v_full_day_late_after) AT TIME ZONE v_tz + interval '1 second';
            IF v_m > v_now THEN v_milestones := array_append(v_milestones, v_m); END IF;
        END IF;

        -- Các ngày tiếp theo
        FOR v_i IN 1..2 LOOP
            v_test_time := v_test_time + interval '1 day';
            IF v_test_time > v_now THEN v_milestones := array_append(v_milestones, v_test_time); END IF;
        END LOOP;
    END IF;

    -- 3. TỔNG HỢP & TÍNH TIỀN (FINAL CALCULATION)
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
    ) t;

    RETURN COALESCE(v_ladder, '[]'::jsonb);
END;
$$;
