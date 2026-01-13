-- BILLING ENGINE V2 - FIXED FOR SCHEMA COMPATIBILITY
-- Updated: 2026-01-14
-- Fixes: Column names, settings loading, price loading

--------------------------------------------------------------------------------
-- 1. HELPER FUNCTIONS
--------------------------------------------------------------------------------
-- No longer needed if we select directly, but kept for compatibility if needed
DROP FUNCTION IF EXISTS public.fn_get_system_setting(text);

CREATE OR REPLACE FUNCTION public.fn_get_system_setting(p_key text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_val text;
BEGIN
    -- Dynamic SQL to select column from settings table (single row config)
    EXECUTE format('SELECT %I::text FROM public.settings LIMIT 1', p_key) INTO v_val;
    RETURN v_val;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

--------------------------------------------------------------------------------
-- 2. CORE: ROOM CHARGE CALCULATION
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calculate_room_charge(
    p_booking_id uuid,
    p_check_in timestamptz,
    p_check_out timestamptz,
    p_rental_type text,
    p_room_cat_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    -- Settings variables
    v_grace_in_enabled boolean;
    v_grace_out_enabled boolean;
    v_grace_minutes int;
    v_hourly_unit int;
    v_base_block_count int;
    v_ceiling_enabled boolean;
    v_overnight_start time;
    v_overnight_end time;
    v_std_check_out time;
    v_full_day_cutoff time;
    
    -- Price variables
    v_price_hourly numeric;
    v_price_next numeric;
    v_price_daily numeric;
    v_price_overnight numeric;
    v_overnight_enabled boolean;
   
   v_duration_minutes numeric;
   v_total_charge numeric := 0;
   v_explanation text := '';
   
   v_first_block_min numeric;
   v_remaining_min numeric;
   v_next_blocks int;
   v_check_in_time time;
BEGIN
    -- 1. Load settings from COLUMNS
    SELECT 
        COALESCE(grace_in_enabled, false),
        COALESCE(grace_out_enabled, false),
        COALESCE(grace_minutes, 0),
        COALESCE(hourly_unit, 60),
        COALESCE(base_hourly_limit, 1),
        COALESCE(hourly_ceiling_enabled, false),
        COALESCE(overnight_start_time, '22:00:00'::time),
        COALESCE(overnight_end_time, '06:00:00'::time),
        COALESCE(check_out_time, '12:00:00'::time),
        COALESCE(full_day_late_after, '18:00:00'::time)
    INTO 
        v_grace_in_enabled, 
        v_grace_out_enabled, 
        v_grace_minutes,
        v_hourly_unit, 
        v_base_block_count, 
        v_ceiling_enabled,
        v_overnight_start, 
        v_overnight_end,
        v_std_check_out, 
        v_full_day_cutoff
    FROM public.settings LIMIT 1;
    
    -- Fallback if settings not found
    IF NOT FOUND THEN
         v_grace_in_enabled := false;
         v_grace_out_enabled := false;
         v_grace_minutes := 0;
         v_hourly_unit := 60;
         v_base_block_count := 1;
         v_ceiling_enabled := false;
         v_overnight_start := '22:00:00'::time;
         v_overnight_end := '06:00:00'::time;
         v_std_check_out := '12:00:00'::time;
         v_full_day_cutoff := '18:00:00'::time;
    END IF;

    -- 2. Load prices from room_categories columns
    SELECT 
        price_hourly, 
        price_next_hour, 
        price_daily, 
        price_overnight,
        overnight_enabled,
        hourly_unit,
        base_hourly_limit
    INTO 
        v_price_hourly, 
        v_price_next, 
        v_price_daily, 
        v_price_overnight,
        v_overnight_enabled,
        v_hourly_unit,
        v_base_block_count
    FROM public.room_categories 
    WHERE id = p_room_cat_id;
    
    -- Apply Overrides (Priority: Room > Global)
    -- If room config is NULL, keep the global value loaded in step 1
    -- If room config is set, overwrite it
    IF v_hourly_unit IS NULL THEN v_hourly_unit := COALESCE(v_hourly_unit, 60); END IF; -- Should already be set by step 1, but safety
    IF v_base_block_count IS NULL THEN v_base_block_count := COALESCE(v_base_block_count, 1); END IF;


    v_duration_minutes := EXTRACT(EPOCH FROM (p_check_out - p_check_in)) / 60;
    v_check_in_time := p_check_in::time;
    
    IF p_rental_type = 'hourly' THEN
        v_explanation := v_explanation || 'Tính tiền theo Giờ. ';
        v_first_block_min := v_base_block_count * v_hourly_unit;
        v_total_charge := v_price_hourly;
        v_explanation := v_explanation || format('Gói đầu %s phút: %s. ', v_first_block_min, v_price_hourly);
        
        IF v_duration_minutes > v_first_block_min THEN
            v_remaining_min := v_duration_minutes - v_first_block_min;
            IF v_remaining_min <= v_grace_minutes THEN
                v_remaining_min := 0;
                v_explanation := v_explanation || format('(Dư %s phút trong ân hạn -> Miễn phí). ', ROUND(v_remaining_min,0));
            END IF;
            
            IF v_remaining_min > 0 THEN
                v_next_blocks := CEIL(v_remaining_min / v_hourly_unit);
                v_total_charge := v_total_charge + (v_next_blocks * v_price_next);
                v_explanation := v_explanation || format('Tiếp theo: %s phút = %s block x %s = %s. ', 
                    ROUND(v_remaining_min,0), v_next_blocks, v_price_next, (v_next_blocks * v_price_next));
            END IF;
        END IF;
        
        IF v_ceiling_enabled AND v_total_charge > v_price_daily THEN
            v_total_charge := v_price_daily;
            v_explanation := v_explanation || format(' -> Vượt quá giá ngày, áp dụng trần: %s.', v_price_daily);
        END IF;

    ELSIF p_rental_type = 'overnight' THEN
        IF v_overnight_enabled = true AND (v_check_in_time >= v_overnight_start OR v_check_in_time <= v_overnight_end) THEN
             v_total_charge := v_price_overnight;
             v_explanation := format('Giá qua đêm (trong khung): %s. ', v_price_overnight);
        ELSE
             v_total_charge := v_price_daily;
             v_explanation := format('Ngoài khung qua đêm -> Áp giá ngày: %s. ', v_price_daily);
        END IF;

    ELSE -- Daily
        DECLARE
            v_days int;
            v_check_out_time time;
            v_late_min numeric;
        BEGIN
           v_days := FLOOR(v_duration_minutes / 1440);
           IF v_days < 1 THEN v_days := 1; END IF;
           v_check_out_time := p_check_out::time;
           v_late_min := EXTRACT(EPOCH FROM (v_check_out_time - v_std_check_out)) / 60;
           IF v_late_min < 0 THEN v_late_min := 0; END IF;
           
           IF (v_check_out_time > v_full_day_cutoff) THEN
               IF NOT (v_grace_out_enabled AND v_late_min <= v_grace_minutes) THEN
                   v_days := v_days + 1;
                   v_explanation := v_explanation || format('Qua mốc 100%% (%s) -> Cộng thêm 1 ngày. ', v_full_day_cutoff);
               END IF;
           END IF;
           v_total_charge := v_days * v_price_daily;
           v_explanation := format('Giá theo ngày (%s ngày): %s. ', v_days, v_total_charge);
        END;
    END IF;

    RETURN jsonb_build_object(
        'amount', v_total_charge,
        'explanation', v_explanation,
        'duration_minutes', v_duration_minutes
    );
END;
$$;

--------------------------------------------------------------------------------
-- 3. CORE: SURCHARGE CALCULATION
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calculate_surcharge(
    p_check_in timestamptz,
    p_check_out timestamptz,
    p_room_cat_id uuid,
    p_rental_type text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    -- Settings
    v_std_check_in time;
    v_std_check_out time;
    v_overnight_checkout_time time;
    v_full_day_cutoff time;
    v_grace_minutes int;
    v_grace_in_enabled boolean;
    v_grace_out_enabled boolean;
    v_surcharge_rules jsonb;
    v_auto_surcharge_enabled boolean;
    
    v_price_daily numeric;
    v_hourly_surcharge_rate numeric;
    
    v_early_min numeric := 0;
    v_late_min numeric := 0;
    v_early_amount numeric := 0;
    v_late_amount numeric := 0;
    v_explanation text := '';
    
    v_rule jsonb;
    v_rule_from time;
    v_rule_to time;
    v_rule_percent numeric;
    v_check_out_time time;
    v_check_in_time time;
    v_rule_matched boolean := false;
BEGIN
    IF p_rental_type = 'hourly' THEN
        RETURN jsonb_build_object(
            'amount', 0, 'early_amount', 0, 'late_amount', 0,
            'explanation', 'Thuê giờ: Không áp dụng phụ thu Sớm/Muộn.'
        );
    END IF;

    -- Load Settings from COLUMNS
    SELECT 
        COALESCE(check_in_time, '14:00:00'::time),
        COALESCE(check_out_time, '12:00:00'::time),
        COALESCE(overnight_checkout_time, '12:00:00'::time),
        COALESCE(full_day_late_after, '18:00:00'::time),
        COALESCE(grace_minutes, 0),
        COALESCE(grace_in_enabled, false),
        COALESCE(grace_out_enabled, false),
        COALESCE(surcharge_rules, '[]'::jsonb),
        COALESCE(auto_surcharge_enabled, false)
    INTO 
        v_std_check_in, 
        v_std_check_out, 
        v_overnight_checkout_time, 
        v_full_day_cutoff, 
        v_grace_minutes, 
        v_grace_in_enabled, 
        v_grace_out_enabled, 
        v_surcharge_rules,
        v_auto_surcharge_enabled
    FROM public.settings LIMIT 1;
    
    -- Fallback if settings not found
    IF NOT FOUND THEN
         v_std_check_in := '14:00:00'::time;
         v_std_check_out := '12:00:00'::time;
         v_overnight_checkout_time := '12:00:00'::time;
         v_full_day_cutoff := '18:00:00'::time;
         v_grace_minutes := 0;
         v_grace_in_enabled := false;
         v_grace_out_enabled := false;
         v_surcharge_rules := '[]'::jsonb;
         v_auto_surcharge_enabled := false;
    END IF;

    SELECT 
        price_daily,
        COALESCE(hourly_surcharge_amount, 0),
        COALESCE(surcharge_rules, v_surcharge_rules),
        COALESCE(auto_surcharge_enabled, v_auto_surcharge_enabled)
    INTO 
        v_price_daily, 
        v_hourly_surcharge_rate,
        v_surcharge_rules,
        v_auto_surcharge_enabled
    FROM public.room_categories WHERE id = p_room_cat_id;

    IF NOT v_auto_surcharge_enabled THEN
        RETURN jsonb_build_object(
            'amount', 0, 'early_amount', 0, 'late_amount', 0,
            'explanation', 'Phụ thu tự động đang tắt.'
        );
    END IF;

    DECLARE
        v_target_checkout time;
    BEGIN
        IF p_rental_type = 'overnight' THEN
            v_target_checkout := v_overnight_checkout_time;
        ELSE 
            v_target_checkout := v_std_check_out;
        END IF;
        
        v_check_out_time := p_check_out::time;

        IF (v_check_out_time > v_target_checkout) THEN
            v_late_min := EXTRACT(EPOCH FROM (v_check_out_time - v_target_checkout)) / 60;
            
            IF v_grace_out_enabled AND v_late_min <= v_grace_minutes THEN
                v_late_min := 0;
                v_explanation := v_explanation || format('(Trễ %s phút trong ân hạn). ', ROUND(v_late_min, 0));
            ELSE
                IF p_rental_type = 'daily' AND v_check_out_time > v_full_day_cutoff THEN
                    v_late_amount := 0;
                    v_explanation := v_explanation || format('Qua mốc 100%% (%s) -> Không tính phụ thu trễ. ', v_full_day_cutoff);
                ELSE
                    -- Try to use rules (Handle object structure with late_rules)
                    IF v_surcharge_rules IS NOT NULL AND (v_surcharge_rules ? 'late_rules') THEN
                         FOR v_rule IN SELECT * FROM jsonb_array_elements(v_surcharge_rules->'late_rules')
                         LOOP
                            v_rule_from := (v_rule->>'from')::time;
                            v_rule_to := (v_rule->>'to')::time;
                            v_rule_percent := (v_rule->>'percent')::numeric;
                            
                            IF v_check_out_time > v_rule_from AND v_check_out_time <= v_rule_to THEN
                                v_late_amount := v_price_daily * (v_rule_percent / 100);
                                v_explanation := v_explanation || format('Trả muộn đến %s (Rule %s%%) -> %s. ', v_check_out_time, v_rule_percent, v_late_amount);
                                v_rule_matched := true;
                                EXIT;
                            END IF;
                         END LOOP;
                    ELSIF v_surcharge_rules IS NOT NULL AND jsonb_typeof(v_surcharge_rules) = 'array' AND jsonb_array_length(v_surcharge_rules) > 0 THEN
                         -- Fallback for array structure (legacy or test)
                         FOR v_rule IN SELECT * FROM jsonb_array_elements(v_surcharge_rules)
                         LOOP
                            v_rule_from := (v_rule->>'from')::time;
                            v_rule_to := (v_rule->>'to')::time;
                            v_rule_percent := (v_rule->>'percent')::numeric;
                            IF v_check_out_time > v_rule_from AND v_check_out_time <= v_rule_to THEN
                                v_late_amount := v_price_daily * (v_rule_percent / 100);
                                v_explanation := v_explanation || format('Trả muộn đến %s (Rule %s%%) -> %s. ', v_check_out_time, v_rule_percent, v_late_amount);
                                v_rule_matched := true;
                                EXIT;
                            END IF;
                         END LOOP;
                    END IF;
                    
                    IF NOT v_rule_matched THEN
                         v_late_amount := v_price_daily * 0.3;
                         v_explanation := v_explanation || 'Không tìm thấy luật phụ thu, tính mặc định 30%. ';
                    END IF;
                END IF;
            END IF;
        END IF;
    END;

    -- Early Check-in
    IF p_rental_type = 'daily' THEN
        v_check_in_time := p_check_in::time;
        IF (v_check_in_time < v_std_check_in) THEN
            v_early_min := EXTRACT(EPOCH FROM (v_std_check_in - v_check_in_time)) / 60;
            
            IF v_grace_in_enabled AND v_early_min <= v_grace_minutes THEN
                v_early_min := 0;
            ELSE
                 v_rule_matched := false;
                 -- Try to use early_rules
                 IF v_surcharge_rules IS NOT NULL AND (v_surcharge_rules ? 'early_rules') THEN
                     FOR v_rule IN SELECT * FROM jsonb_array_elements(v_surcharge_rules->'early_rules')
                     LOOP
                         v_rule_from := (v_rule->>'from')::time;
                         v_rule_to := (v_rule->>'to')::time;
                         v_rule_percent := (v_rule->>'percent')::numeric;
                         
                         IF v_check_in_time >= v_rule_from AND v_check_in_time < v_rule_to THEN
                             v_early_amount := v_price_daily * (v_rule_percent / 100);
                             v_explanation := v_explanation || format('Vào sớm (%s-%s) (Rule %s%%) -> %s. ', v_rule_from, v_rule_to, v_rule_percent, v_early_amount);
                             v_rule_matched := true;
                             EXIT;
                         END IF;
                     END LOOP;
                 END IF;

                 IF NOT v_rule_matched THEN
                     -- Default 50% if early
                     v_early_amount := v_price_daily * 0.5;
                     v_explanation := v_explanation || format('Vào sớm %s (Mặc định 50%%). ', v_check_in_time);
                 END IF;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'amount', v_early_amount + v_late_amount,
        'early_amount', v_early_amount,
        'late_amount', v_late_amount,
        'explanation', v_explanation
    );
END;
$$;

--------------------------------------------------------------------------------
-- 4. CORE: EXTRA PERSON CALCULATION
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calculate_extra_person_charge(
    p_booking_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_total_amount numeric := 0;
    v_explanation text := '';
BEGIN
    -- Placeholder for V2 extra person logic
    RETURN jsonb_build_object(
        'amount', v_total_amount,
        'explanation', v_explanation
    );
END;
$$;

--------------------------------------------------------------------------------
-- 5. CORE: BILL ADJUSTMENTS
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calculate_bill_adjustments(
    p_sub_total numeric,
    p_discount_amount numeric,
    p_custom_surcharge numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_vat_percent numeric;
    v_svc_percent numeric;
    v_vat_enabled boolean;
    v_svc_enabled boolean;
    
    v_after_discount numeric;
    v_svc_amount numeric := 0;
    v_vat_amount numeric := 0;
    v_final_amount numeric;
BEGIN
    SELECT 
        COALESCE(vat_percent, 0),
        COALESCE(service_fee_percent, 0),
        COALESCE(vat_enabled, false),
        COALESCE(service_fee_enabled, false)
    INTO 
        v_vat_percent, 
        v_svc_percent,
        v_vat_enabled,
        v_svc_enabled
    FROM public.settings LIMIT 1;
    
    IF NOT FOUND THEN
        v_vat_percent := 0;
        v_svc_percent := 0;
        v_vat_enabled := false;
        v_svc_enabled := false;
    END IF;
    
    -- Apply Toggles
    IF NOT v_vat_enabled THEN v_vat_percent := 0; END IF;
    IF NOT v_svc_enabled THEN v_svc_percent := 0; END IF;
    
    v_after_discount := p_sub_total - p_discount_amount + p_custom_surcharge;
    if v_after_discount < 0 THEN v_after_discount := 0; END IF;

    v_svc_amount := v_after_discount * (v_svc_percent / 100);
    v_vat_amount := (v_after_discount + v_svc_amount) * (v_vat_percent / 100);
    
    v_final_amount := v_after_discount + v_svc_amount + v_vat_amount;
    
    RETURN jsonb_build_object(
        'sub_total_adjusted', v_after_discount,
        'service_fee', v_svc_amount,
        'vat_amount', v_vat_amount,
        'final_amount', v_final_amount
    );
END;
$$;

--------------------------------------------------------------------------------
-- 6. MASTER: CALCULATE BOOKING BILL V2
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_booking_bill_v2(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
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
    v_final_amount numeric;
    v_deposit numeric;
    v_customer_balance numeric;
    
    v_room_name text;
    v_customer_name text;
    v_duration_hours numeric;
    v_duration_minutes numeric;
BEGIN
    -- 1. Get Booking Info (Using actual V2 columns)
    SELECT 
        b.id, b.room_id, b.customer_id, 
        b.check_in_actual as check_in_at, 
        b.check_out_actual as check_out_at, 
        b.rental_type, 0 as initial_price, b.deposit_amount, 
        COALESCE(b.custom_surcharge, 0) as custom_surcharge, 
        COALESCE(b.discount_amount, 0) as discount_amount,
        r.category_id, 
        r.room_number as room_name,
        c.balance as cust_balance,
        c.full_name as cust_name,
        b.services_used
    INTO v_booking 
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.customers c ON b.customer_id = c.id
    WHERE b.id = p_booking_id;
    
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;
    
    v_check_out := COALESCE(v_booking.check_out_at, now());
    v_room_cat_id := v_booking.category_id;
    v_customer_balance := COALESCE(v_booking.cust_balance, 0);
    v_deposit := COALESCE(v_booking.deposit_amount, 0);
    v_room_name := v_booking.room_name;
    v_customer_name := COALESCE(v_booking.cust_name, 'Khách lẻ');
    
    v_duration_minutes := EXTRACT(EPOCH FROM (v_check_out - v_booking.check_in_at)) / 60;
    v_duration_hours := ROUND((v_duration_minutes / 60)::numeric, 2);

    -- 2. Calc Room Charge
    v_room_res := public.fn_calculate_room_charge(
        p_booking_id,
        v_booking.check_in_at,
        v_check_out,
        v_booking.rental_type,
        v_room_cat_id
    );

    -- 3. Calc Surcharge (Early/Late)
    v_surcharge_res := public.fn_calculate_surcharge(
        v_booking.check_in_at,
        v_check_out,
        v_room_cat_id,
        v_booking.rental_type
    );
    
    -- 4. Calc Extra Person
    v_extra_person_res := public.fn_calculate_extra_person_charge(
        p_booking_id
    );

    -- 5. Calc Services
    BEGIN
        SELECT 
            COALESCE(SUM(quantity * price_at_time), 0),
            COALESCE(jsonb_agg(jsonb_build_object(
                'name', s.name, 
                'quantity', bs.quantity, 
                'price', bs.price_at_time, 
                'total', bs.quantity * bs.price_at_time
            )), '[]'::jsonb)
        INTO v_service_total, v_service_items
        FROM public.booking_services bs
        JOIN public.services s ON bs.service_id = s.id
        WHERE bs.booking_id = p_booking_id;
    EXCEPTION WHEN OTHERS THEN
        SELECT 
            COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::numeric), 0),
            COALESCE(jsonb_agg(item), '[]'::jsonb)
        INTO v_service_total, v_service_items
        FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) AS item;
    END;

    -- 6. Totals & Adjustments
    v_total_amount := (v_room_res->>'amount')::numeric + 
                      (v_surcharge_res->>'amount')::numeric + 
                      (v_extra_person_res->>'amount')::numeric +
                      v_service_total;

    v_adj_res := public.fn_calculate_bill_adjustments(
        v_total_amount,
        v_booking.discount_amount,
        v_booking.custom_surcharge
    );
    
    v_final_amount := (v_adj_res->>'final_amount')::numeric;

    -- 7. Return (Format for Frontend)
    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'room_number', v_room_name,
        'room_name', v_room_name,
        'customer_name', v_customer_name,
        'rental_type', v_booking.rental_type,
        'check_in_at', v_booking.check_in_at,
        'check_out_at', v_check_out,
        'check_in', v_booking.check_in_at,
        'check_out', v_check_out,
        'duration_hours', v_duration_hours,
        'duration_minutes', v_duration_minutes,
        'duration_text', CASE 
            WHEN v_duration_hours < 1 THEN format('%s phút', ROUND(v_duration_minutes))
            WHEN v_duration_hours < 24 THEN format('%s giờ %s phút', FLOOR(v_duration_hours), ROUND(MOD(v_duration_minutes, 60)))
            ELSE format('%s ngày %s giờ', FLOOR(v_duration_hours/24), ROUND(MOD(v_duration_hours,24)::numeric,1))
        END,
        
        'room_charge', (v_room_res->>'amount')::numeric,
        'base_price', (v_room_res->>'amount')::numeric,
        'explanation', (v_room_res->>'explanation') || ' ' || (v_surcharge_res->>'explanation'),
        'room_explanation', v_room_res->>'explanation',
        'surcharge', (v_surcharge_res->>'amount')::numeric,
        'early_surcharge', (v_surcharge_res->>'early_amount')::numeric,
        'late_surcharge', (v_surcharge_res->>'late_amount')::numeric,
        'custom_surcharge', v_booking.custom_surcharge,
        'extra_person', (v_extra_person_res->>'amount')::numeric,
        'service_total', v_service_total,
        'service_charges', v_service_items,
        'service_items', v_service_items,
        
        'sub_total', v_total_amount,
        'subtotal', v_total_amount,
        'discount_amount', v_booking.discount_amount,
        'service_fee_amount', (v_adj_res->>'service_fee')::numeric,
        'vat_amount', (v_adj_res->>'vat_amount')::numeric,
        
        'total_amount', v_final_amount,
        'final_amount', v_final_amount,
        'deposit_amount', v_deposit,
        'deposit', v_deposit,
        'customer_balance', v_customer_balance,
        'amount_to_pay', (v_final_amount - v_deposit),
        'total_receivable', (v_final_amount - v_deposit - v_customer_balance)
    );
END;
$$;

--------------------------------------------------------------------------------
-- 7. MASTER: PROCESS CHECKOUT V2 (Fixed)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_checkout_v2(
    p_booking_id uuid,
    p_payment_method text,
    p_amount_paid numeric,
    p_discount numeric,
    p_surcharge numeric,
    p_notes text,
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_staff_id uuid;
    v_room_id uuid;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());
    
    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- Update booking with check_out_actual (Fixed column name)
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, '')
    WHERE id = p_booking_id;

    -- Calculate bill
    v_bill := public.calculate_booking_bill_v2(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 4. Update room
    UPDATE public.rooms 
    SET 
        status = 'dirty', 
        updated_at = now()
    WHERE id = v_room_id;

    -- Accounting
    BEGIN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'REVENUE', 'ROOM', (v_bill->>'room_charge')::numeric, 'Tiền phòng', v_staff_id, p_payment_method);
        
        IF p_amount_paid > 0 THEN
            INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
            VALUES (p_booking_id, v_customer_id, 'PAYMENT', 'ROOM', p_amount_paid, 'Khách thanh toán checkout', v_staff_id, p_payment_method);
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Gracefully handle
    END;

    -- 6. Update customer
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET 
            balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit),
            updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Check-out thành công',
        'bill', v_bill
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false, 
        'message', 'Lỗi: ' || SQLERRM
    );
END;
$$;
