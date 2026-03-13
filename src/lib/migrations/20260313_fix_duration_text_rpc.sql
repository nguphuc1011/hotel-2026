-- MIGRATION: UPDATE RPCS TO RETURN CORRECT DURATION TEXT (BUSINESS LOGIC BASED)
-- TRÍCH DẪN HIẾN PHÁP:
-- ĐIỀU 4 (Nhất thống Mật lệnh): Mỗi nghiệp vụ 1 RPC duy nhất. DB quyết định UI.
-- ĐIỀU 10 (Kỷ luật sinh tồn): Trích dẫn 2 Điều Hiến pháp trước khi hành động.

-- 1. Cập nhật fn_calculate_room_charge để trả về số đơn vị (units) và duration_text
CREATE OR REPLACE FUNCTION public.fn_calculate_room_charge(p_booking_id uuid, p_check_in timestamp with time zone, p_check_out timestamp with time zone, p_rental_type text, p_room_cat_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    -- Settings variables
    v_grace_in_enabled boolean;
    v_grace_out_enabled boolean;
    v_grace_minutes int;
    v_hourly_unit int;
    v_base_block_count int;
    v_ceiling_enabled boolean;
    v_ceiling_percent numeric;
    v_overnight_start time;
    v_overnight_end time;
    v_std_check_out time;
    v_full_day_cutoff time;
    v_full_day_early_cutoff time;
    
    -- New toggles
    v_auto_overnight_switch boolean;
    v_auto_full_day_early boolean;
    v_auto_full_day_late boolean;
    
    -- Price variables
    v_price_hourly numeric;
    v_price_next numeric;
    v_price_daily numeric;
    v_price_overnight numeric;
    v_overnight_enabled boolean;
    
    -- Custom price
    v_custom_price numeric;
   
   v_duration_minutes numeric;
   v_total_charge numeric := 0;
   v_explanations text[] := '{}';
   v_ceiling_amount numeric;
   
   v_first_block_min numeric;
   v_remaining_min numeric;
   v_next_blocks int := 0;
   v_check_in_time time;
   v_rental_type_actual text := p_rental_type;
   v_tz text := 'Asia/Ho_Chi_Minh';
   v_units numeric := 0;
   v_duration_text text := '';
BEGIN
    -- 1. Load settings from COLUMNS
    SELECT 
        grace_in_enabled,
        grace_out_enabled,
        grace_minutes,
        hourly_unit,
        base_hourly_limit,
        hourly_ceiling_enabled,
        hourly_ceiling_percent,
        overnight_start_time,
        overnight_end_time,
        check_out_time,
        full_day_late_after,
        night_audit_time,
        auto_overnight_switch,
        auto_full_day_early,
        auto_full_day_late
    INTO 
        v_grace_in_enabled, v_grace_out_enabled, v_grace_minutes,
        v_hourly_unit, v_base_block_count, v_ceiling_enabled,
        v_ceiling_percent, v_overnight_start, v_overnight_end,
        v_std_check_out, v_full_day_cutoff, v_full_day_early_cutoff,
        v_auto_overnight_switch, v_auto_full_day_early, v_auto_full_day_late
    FROM public.settings WHERE key = 'config' LIMIT 1;

    IF v_full_day_early_cutoff IS NULL THEN
        v_full_day_early_cutoff := '04:00:00'::time;
    END IF;
    
    IF v_std_check_out IS NULL OR v_overnight_start IS NULL OR v_overnight_end IS NULL OR v_hourly_unit IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', 'LỖI CẤU HÌNH: Bệ hạ chưa thiết lập đầy đủ các thông số trong Cài đặt.'
        );
    END IF;

    -- 2. Load prices from room_categories
    SELECT 
        COALESCE(price_hourly, 0), 
        COALESCE(price_next_hour, 0), 
        COALESCE(price_daily, 0), 
        COALESCE(price_overnight, 0),
        COALESCE(overnight_enabled, false), 
        COALESCE(hourly_unit, 60), 
        COALESCE(base_hourly_limit, 1)
    INTO 
        v_price_hourly, v_price_next, v_price_daily, v_price_overnight,
        v_overnight_enabled, v_hourly_unit, v_base_block_count
    FROM public.room_categories
    WHERE id = p_room_cat_id;

    -- 3. Load Custom Price from Booking
    SELECT COALESCE(custom_price, 0) INTO v_custom_price FROM public.bookings WHERE id = p_booking_id;
    v_custom_price := COALESCE(v_custom_price, 0);
    
    IF v_custom_price > 0 THEN
        IF p_rental_type = 'hourly' THEN v_price_hourly := v_custom_price;
        ELSIF p_rental_type = 'overnight' THEN v_price_overnight := v_custom_price;
        ELSE v_price_daily := v_custom_price; END IF;
    END IF;

    v_duration_minutes := FLOOR(EXTRACT(EPOCH FROM (p_check_out - p_check_in)) / 60);
    v_check_in_time := (p_check_in AT TIME ZONE v_tz)::time;
    
    -- Auto-switch logic
    IF v_auto_overnight_switch AND p_rental_type IN ('hourly', 'daily') AND v_overnight_enabled THEN
        IF (v_check_in_time >= v_overnight_start OR v_check_in_time <= v_overnight_end) THEN
            v_rental_type_actual := 'overnight';
            v_explanations := array_append(v_explanations, format('Tự động áp dụng giá Qua đêm (Khách nhận phòng lúc %s)', to_char(p_check_in AT TIME ZONE v_tz, 'HH24:MI DD/MM')));
        END IF;
    END IF;

    -- Ceiling logic
    IF v_rental_type_actual = 'hourly' AND v_ceiling_enabled THEN
        DECLARE
            v_tmp_charge numeric := v_price_hourly;
            v_tmp_remaining numeric;
            v_tmp_blocks int;
        BEGIN
            v_first_block_min := v_base_block_count * v_hourly_unit;
            IF v_duration_minutes > v_first_block_min THEN
                v_tmp_remaining := v_duration_minutes - v_first_block_min;
                IF v_grace_out_enabled AND v_tmp_remaining <= v_grace_minutes THEN v_tmp_remaining := 0; END IF;
                IF v_tmp_remaining > 0 THEN
                    v_tmp_blocks := CEIL(v_tmp_remaining / v_hourly_unit);
                    v_tmp_charge := v_tmp_charge + (v_tmp_blocks * v_price_next);
                END IF;
            END IF;
            v_ceiling_amount := v_price_daily * (v_ceiling_percent / 100);
            IF v_tmp_charge > v_ceiling_amount THEN
                v_rental_type_actual := 'daily';
                v_explanations := array_append(v_explanations, format('Tiền giờ (%sđ) vượt trần giá ngày (%sđ) -> Chuyển sang tính giá Ngày', public.fn_format_money_vi(v_tmp_charge), public.fn_format_money_vi(v_ceiling_amount)));
            END IF;
        END;
    END IF;

    IF v_rental_type_actual = 'hourly' THEN
        v_first_block_min := v_base_block_count * v_hourly_unit;
        v_total_charge := v_price_hourly;
        v_units := 1; -- 1 block đầu
        v_duration_text := v_base_block_count || ' giờ';
        
        IF v_duration_minutes > v_first_block_min THEN
            v_remaining_min := v_duration_minutes - v_first_block_min;
            DECLARE
                v_remainder_min numeric;
            BEGIN
                v_next_blocks := FLOOR(v_remaining_min / v_hourly_unit);
                v_remainder_min := MOD(v_remaining_min, v_hourly_unit);
                IF v_remainder_min > 0 THEN
                    IF (NOT v_grace_out_enabled) OR (v_remainder_min > v_grace_minutes) THEN
                        v_next_blocks := v_next_blocks + 1;
                        v_explanations := array_append(v_explanations, format('Block lẻ %s phút (> %s phút ân hạn) -> Tính tròn 1 block', ROUND(v_remainder_min, 0), v_grace_minutes));
                    END IF;
                END IF;
            END;
            IF v_next_blocks > 0 THEN
                v_total_charge := v_total_charge + (v_next_blocks * v_price_next);
                v_units := v_units + v_next_blocks;
                v_duration_text := (v_base_block_count + v_next_blocks) || ' giờ';
            END IF;
        END IF;

    ELSIF v_rental_type_actual = 'overnight' THEN
        DECLARE
            v_nights int;
        BEGIN
            v_nights := ((p_check_out AT TIME ZONE v_tz)::date - (p_check_in AT TIME ZONE v_tz)::date);
            IF v_nights < 1 THEN v_nights := 1; END IF;
            IF v_overnight_enabled = true AND (v_check_in_time >= v_overnight_start OR v_check_in_time <= v_overnight_end) THEN
                 v_total_charge := v_nights * v_price_overnight;
                 v_units := v_nights;
                 v_duration_text := v_nights || ' đêm';
            ELSE
                 v_total_charge := v_nights * v_price_daily;
                 v_units := v_nights;
                 v_duration_text := v_nights || ' ngày';
            END IF;
        END;

    ELSE -- Daily
        DECLARE
            v_days int;
            v_check_out_time time;
            v_check_in_time_only time;
            v_late_min numeric;
            v_early_min numeric;
            v_std_check_in time;
        BEGIN
           SELECT COALESCE(check_in_time, '14:00:00'::time) INTO v_std_check_in FROM public.settings WHERE key = 'config' LIMIT 1;
           v_days := ((p_check_out AT TIME ZONE v_tz)::date - (p_check_in AT TIME ZONE v_tz)::date);
           IF v_days < 0 THEN v_days := 0; END IF;

           v_check_out_time := (p_check_out AT TIME ZONE v_tz)::time;
           v_late_min := FLOOR(EXTRACT(EPOCH FROM (v_check_out_time - v_std_check_out)) / 60);
           
           IF v_auto_full_day_late AND (v_check_out_time > v_full_day_cutoff) THEN
               IF NOT (v_grace_out_enabled AND v_late_min <= v_grace_minutes) THEN
                   v_days := v_days + 1;
                   v_explanations := array_append(v_explanations, format('Trả phòng muộn (%s) -> Tính thêm 1 ngày', to_char(p_check_out AT TIME ZONE v_tz, 'HH24:MI')));
               END IF;
           END IF;

           v_check_in_time_only := (p_check_in AT TIME ZONE v_tz)::time;
           v_early_min := FLOOR(EXTRACT(EPOCH FROM (v_std_check_in - v_check_in_time_only)) / 60);

           IF v_auto_full_day_early AND (v_check_in_time_only < v_full_day_early_cutoff) THEN
               IF NOT (v_grace_in_enabled AND v_early_min <= v_grace_minutes) THEN
                   v_days := v_days + 1;
                   v_explanations := array_append(v_explanations, format('Nhận phòng sớm (%s) -> Tính thêm 1 ngày', to_char(p_check_in AT TIME ZONE v_tz, 'HH24:MI')));
               END IF;
           END IF;
           
           IF v_days < 1 THEN v_days := 1; END IF;
           v_total_charge := v_days * v_price_daily;
           v_units := v_days;
           v_duration_text := v_days || ' ngày';
        END;
    END IF;

    RETURN jsonb_build_object(
        'amount', v_total_charge,
        'explanation', v_explanations,
        'duration_minutes', v_duration_minutes,
        'rental_type_actual', v_rental_type_actual,
        'units', v_units,
        'duration_text', v_duration_text
    );
END;
$function$;

-- 2. Cập nhật calculate_booking_bill để đưa duration_text ra ngoài
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
 $function$;

-- 3. Cập nhật fn_get_dashboard_data để đưa duration_text ra rates
CREATE OR REPLACE FUNCTION public.fn_get_dashboard_data(p_hotel_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_hotel_id uuid;
    v_rooms jsonb;
    v_bookings jsonb;
    v_rates jsonb;
    v_wallets jsonb;
BEGIN
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());

    SELECT jsonb_agg(r_data) INTO v_rooms FROM (
        SELECT r.id, r.room_number, r.status, r.updated_at, r.notes, r.category_id, r.floor,
            jsonb_build_object('id', rc.id, 'name', rc.name, 'price_hourly', rc.price_hourly, 'price_daily', rc.price_daily, 'price_overnight', rc.price_overnight, 'base_hourly_limit', rc.base_hourly_limit, 'hourly_unit', rc.hourly_unit) as category
        FROM public.rooms r LEFT JOIN public.room_categories rc ON r.category_id = rc.id
        WHERE (v_hotel_id IS NULL OR r.hotel_id = v_hotel_id) ORDER BY r.room_number
    ) r_data;

    SELECT jsonb_agg(b_data) INTO v_bookings FROM (
        SELECT b.id, b.room_id, b.customer_id, b.rental_type, b.check_in_actual, b.status, b.parent_booking_id, b.deposit_amount, b.notes,
            jsonb_build_object('full_name', c.full_name, 'balance', c.balance) as customer
        FROM public.bookings b LEFT JOIN public.customers c ON b.customer_id = c.id
        WHERE b.status IN ('confirmed', 'checked_in', 'occupied') AND (v_hotel_id IS NULL OR b.hotel_id = v_hotel_id)
    ) b_data;

    SELECT jsonb_agg(rate_data) INTO v_rates FROM (
        SELECT b.id as booking_id, (bill->>'total_amount')::numeric as total_amount, (bill->>'duration_hours')::int as duration_hours, (bill->>'duration_minutes')::int as duration_minutes, bill->>'rental_type_actual' as rental_type_actual, bill->>'duration_text' as duration_text, bill->'explanation' as explanation
        FROM public.bookings b CROSS JOIN LATERAL public.calculate_booking_bill(b.id) AS bill
        WHERE b.status IN ('confirmed', 'checked_in', 'occupied') AND (v_hotel_id IS NULL OR b.hotel_id = v_hotel_id)
    ) rate_data;

    SELECT jsonb_agg(w) INTO v_wallets FROM public.wallets w WHERE (v_hotel_id IS NULL OR w.hotel_id = v_hotel_id);

    RETURN jsonb_build_object('success', true, 'rooms', COALESCE(v_rooms, '[]'::jsonb), 'bookings', COALESCE(v_bookings, '[]'::jsonb), 'rates', COALESCE(v_rates, '[]'::jsonb), 'wallets', COALESCE(v_wallets, '[]'::jsonb));
END;
$function$;
