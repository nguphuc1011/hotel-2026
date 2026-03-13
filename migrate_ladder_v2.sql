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
    v_cat_price_hourly numeric;
    v_cat_price_next numeric;
    v_cat_price_daily numeric;
    v_cat_price_overnight numeric;
    v_base_hourly_limit int;
    v_hourly_unit int;
    v_grace_minutes int;
    v_grace_out_enabled boolean;
    v_std_check_out_time time;
    v_full_day_late_after time;
    v_auto_full_day_late boolean;
    
    v_test_time timestamptz;
    v_bill jsonb;
    v_i int;
    v_milestones timestamptz[] := '{}';
    v_m timestamptz;
    v_tz text := 'Asia/Ho_Chi_Minh';
BEGIN
    -- 1. Lấy thông tin Booking & Cài đặt
    SELECT b.check_in_actual, b.rental_type, r.category_id 
    INTO v_check_in, v_rental_type, v_room_cat_id
    FROM public.bookings b 
    JOIN public.rooms r ON b.room_id = r.id 
    WHERE b.id = p_booking_id;

    SELECT 
        grace_minutes, grace_out_enabled, check_out_time, 
        full_day_late_after, auto_full_day_late
    INTO v_grace_minutes, v_grace_out_enabled, v_std_check_out_time, 
         v_full_day_late_after, v_auto_full_day_late
    FROM public.settings WHERE key = 'config' LIMIT 1;

    SELECT 
        COALESCE(price_hourly, 0), COALESCE(price_next_hour, 0), 
        COALESCE(price_daily, 0), COALESCE(price_overnight, 0),
        COALESCE(base_hourly_limit, 1), COALESCE(hourly_unit, 60)
    INTO v_cat_price_hourly, v_cat_price_next, v_cat_price_daily, v_cat_price_overnight,
         v_base_hourly_limit, v_hourly_unit
    FROM public.room_categories WHERE id = v_room_cat_id;

    -- 2. Xác định các mốc thời gian nhảy tiền (Milestones)
    
    -- Mốc 0: Bây giờ
    v_milestones := array_append(v_milestones, v_now);

    IF v_rental_type = 'hourly' THEN
        -- Mốc kết thúc block đầu: check_in + base_limit + grace
        v_test_time := v_check_in + (v_base_hourly_limit * interval '1 hour') + (v_grace_minutes * interval '1 minute') + interval '1 second';
        IF v_test_time > v_now THEN v_milestones := array_append(v_milestones, v_test_time); END IF;
        
        -- Các mốc block tiếp theo (tính cho 12h tới)
        FOR v_i IN 1..12 LOOP
            v_test_time := v_test_time + (v_hourly_unit * interval '1 minute');
            IF v_test_time > v_now AND v_test_time < v_now + interval '24 hours' THEN
                v_milestones := array_append(v_milestones, v_test_time);
            END IF;
        END LOOP;
    
    ELSIF v_rental_type IN ('daily', 'overnight') THEN
        -- Mốc trả phòng hôm nay
        v_test_time := ((v_now AT TIME ZONE v_tz)::date + v_std_check_out_time) AT TIME ZONE v_tz;
        
        -- Nếu có phụ thu muộn
        IF v_auto_full_day_late THEN
            -- Mốc bắt đầu tính phụ thu (sau ân hạn)
            v_m := v_test_time + (v_grace_minutes * interval '1 minute') + interval '1 second';
            IF v_m > v_now THEN v_milestones := array_append(v_milestones, v_m); END IF;
            
            -- Mốc nhảy sang nguyên ngày (sau full_day_late_after)
            v_m := ((v_now AT TIME ZONE v_tz)::date + v_full_day_late_after) AT TIME ZONE v_tz + interval '1 second';
            IF v_m > v_now THEN v_milestones := array_append(v_milestones, v_m); END IF;
        END IF;

        -- Mốc các ngày tiếp theo (3 ngày tới)
        FOR v_i IN 1..3 LOOP
            v_test_time := v_test_time + interval '1 day';
            IF v_test_time > v_now THEN v_milestones := array_append(v_milestones, v_test_time); END IF;
        END LOOP;
    END IF;

    -- 3. Tính tiền tại các mốc và tạo Ladder
    -- Sắp xếp và lọc các mốc trùng hoặc quá khứ
    SELECT jsonb_agg(ladder_item) INTO v_ladder FROM (
        SELECT DISTINCT ON (m_time)
            jsonb_build_object('time', m_time, 'amount', (public.calculate_booking_bill(p_booking_id, m_time))->'total_amount') as ladder_item,
            m_time
        FROM unnest(v_milestones) as m_time
        WHERE m_time >= v_now - interval '1 minute'
        ORDER BY m_time ASC
    ) t;

    RETURN COALESCE(v_ladder, '[]'::jsonb);
END;
$$;
