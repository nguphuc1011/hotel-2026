-- BILLING ENGINE V3 - REFINED (Manual Extra Person & Dynamic Surcharge Rules)
-- Created: 2026-01-12
-- Author: Trae (AI Architect)

--------------------------------------------------------------------------------
-- 1. HELPER FUNCTIONS
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_system_setting(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    -- Return the whole row as JSON since settings are now columns
    RETURN (SELECT row_to_json(s) FROM public.settings s WHERE key = 'config'); 
END;
$$;

--------------------------------------------------------------------------------
-- 2. CORE: ROOM CHARGE CALCULATION (Tính tiền phòng)
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
     -- Settings
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
     
     -- Prices
     v_price_hourly numeric;
     v_price_next numeric;
     v_price_daily numeric;
    v_price_overnight numeric;
    v_overnight_enabled boolean;
    
    -- Calculation vars
    v_duration_minutes numeric;
    v_total_charge numeric := 0;
    v_explanation text := '';
    
    -- Hourly specific
    v_first_block_min numeric;
    v_remaining_min numeric;
    v_next_blocks int;
    v_check_in_time time;
BEGIN
    -- 1. Load Settings (Direct Columns)
     SELECT 
         grace_in_enabled,
         grace_out_enabled,
         grace_minutes,
         hourly_unit,
         base_hourly_limit,
         hourly_ceiling_enabled,
         overnight_start_time,
         overnight_end_time,
        check_out_time,
        full_day_late_after
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
    FROM public.settings 
    WHERE key = 'config';
     
     v_grace_in_enabled := COALESCE(v_grace_in_enabled, false);
     v_grace_out_enabled := COALESCE(v_grace_out_enabled, false);
     v_grace_minutes := COALESCE(v_grace_minutes, 0);
     v_hourly_unit := COALESCE(v_hourly_unit, 60);
     v_base_block_count := COALESCE(v_base_block_count, 1);
     v_ceiling_enabled := COALESCE(v_ceiling_enabled, false);
     v_overnight_start := COALESCE(v_overnight_start, '22:00:00'::time);
     v_overnight_end := COALESCE(v_overnight_end, '06:00:00'::time);
     v_std_check_out := COALESCE(v_std_check_out, '12:00:00'::time);
     v_full_day_cutoff := COALESCE(v_full_day_cutoff, '18:00:00'::time);
    
    -- 2. Load Prices & Toggles
    SELECT 
        price_hourly,
        price_next_hour,
        price_daily,
        price_overnight,
        overnight_enabled
    INTO 
        v_price_hourly,
        v_price_next,
        v_price_daily,
        v_price_overnight,
        v_overnight_enabled
    FROM public.room_categories WHERE id = p_room_cat_id;
    
    -- Override Prices if custom_price is set in booking
    DECLARE
        v_custom_price numeric;
    BEGIN
        SELECT custom_price INTO v_custom_price 
        FROM public.bookings WHERE id = p_booking_id;
        
        IF v_custom_price IS NOT NULL AND v_custom_price > 0 THEN
            IF p_rental_type = 'daily' THEN
                v_price_daily := v_custom_price;
            ELSIF p_rental_type = 'overnight' THEN
                v_price_overnight := v_custom_price;
            ELSIF p_rental_type = 'hourly' THEN
                v_price_hourly := v_custom_price; -- Only override first block for hourly?
            END IF;
        END IF;
    END;
    
    v_price_hourly := COALESCE(v_price_hourly, 0);
    v_price_next := COALESCE(v_price_next, 0);
    v_price_daily := COALESCE(v_price_daily, 0);
    v_price_overnight := COALESCE(v_price_overnight, 0);

    -- 3. Calculate Raw Duration
    v_duration_minutes := EXTRACT(EPOCH FROM (p_check_out - p_check_in)) / 60;
    v_check_in_time := p_check_in::time;
    
    IF p_rental_type = 'hourly' THEN
        v_explanation := 'Tính tiền theo Giờ. ';
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
        IF v_overnight_enabled = true AND v_check_in_time >= v_overnight_start AND v_check_in_time <= v_overnight_end THEN
             v_total_charge := v_price_overnight;
             v_explanation := format('Giá qua đêm (trong khung): %s. ', v_price_overnight);
        ELSE
             v_total_charge := v_price_daily;
             v_explanation := format('Ngoài khung qua đêm -> Áp giá ngày: %s. ', v_price_daily);
        END IF;

     ELSE -- daily
         DECLARE
             v_days int;
             v_check_out_time time;
             v_late_min numeric;
         BEGIN
            -- Base days do not auto-increase by minute; only add extra day when past full-day cutoff
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
-- 3. CORE: SURCHARGE CALCULATION (Phụ thu Sớm/Muộn) - DYNAMIC RULES
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
    v_sys_settings jsonb;
    v_grace_in_enabled boolean;
    v_grace_out_enabled boolean;
    v_std_check_in time;
    v_std_check_out time;
    v_overnight_checkout_time time;
    v_full_day_cutoff time;
    v_grace_minutes int;
    v_auto_surcharge_enabled boolean;
    v_late_rules jsonb;
    v_early_rules jsonb;
    
    -- Prices
    v_price_daily numeric;
    v_hourly_surcharge_rate numeric;
    v_surcharge_mode text;
    
    -- Calc
    v_early_min numeric := 0;
    v_late_min numeric := 0;
    v_early_amount numeric := 0;
    v_late_amount numeric := 0;
    v_explanation text := '';
    
    -- Rule processing
    v_rules jsonb;
    v_rule jsonb;
    v_rule_from time;
    v_rule_to time;
    v_rule_percent numeric;
    v_check_out_time time;
    v_check_in_time time;
    v_rule_matched boolean := false;
BEGIN
    -- 0. SKIP SURCHARGE FOR HOURLY
    IF p_rental_type = 'hourly' THEN
        RETURN jsonb_build_object(
            'amount', 0, 'early_amount', 0, 'late_amount', 0,
            'explanation', 'Thuê giờ: Không áp dụng phụ thu Sớm/Muộn.'
        );
    END IF;

    -- 1. Load Settings (Direct Columns)
    SELECT 
        check_in_time,
        check_out_time,
        overnight_checkout_time,
        full_day_late_after,
        grace_minutes,
        grace_in_enabled,
        grace_out_enabled,
        surcharge_rules
    INTO 
        v_std_check_in,
        v_std_check_out,
        v_overnight_checkout_time,
        v_full_day_cutoff,
        v_grace_minutes,
        v_grace_in_enabled,
        v_grace_out_enabled,
        v_rules
    FROM public.settings 
    WHERE key = 'config';
    
    v_std_check_in := COALESCE(v_std_check_in, '14:00:00'::time);
    v_std_check_out := COALESCE(v_std_check_out, '12:00:00'::time);
    v_full_day_cutoff := COALESCE(v_full_day_cutoff, '18:00:00'::time);
    v_grace_minutes := COALESCE(v_grace_minutes, 0);
    v_grace_in_enabled := COALESCE(v_grace_in_enabled, false);
    v_grace_out_enabled := COALESCE(v_grace_out_enabled, false);
    v_overnight_checkout_time := COALESCE(v_overnight_checkout_time, '12:00'::time);
    
    -- Extract rules from JSONB
    v_late_rules := v_rules->'late_rules';
    v_early_rules := v_rules->'early_rules';
    
    -- 2. Load Room Prices
    SELECT 
        price_daily,
        COALESCE(hourly_surcharge_amount, 0),
        COALESCE(auto_surcharge_enabled, false),
        COALESCE(surcharge_mode, 'percent')
    INTO v_price_daily, v_hourly_surcharge_rate, v_auto_surcharge_enabled, v_surcharge_mode
    FROM public.room_categories WHERE id = p_room_cat_id;

    IF NOT v_auto_surcharge_enabled THEN
        RETURN jsonb_build_object(
            'amount', 0, 'early_amount', 0, 'late_amount', 0,
            'explanation', 'Phụ thu tự động đang tắt.'
        );
    END IF;

    -- 3. Late Checkout Logic
    DECLARE
        v_target_checkout time;
    BEGIN
        IF p_rental_type = 'overnight' THEN
            v_target_checkout := v_overnight_checkout_time;
        ELSE -- daily
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
                    IF v_surcharge_mode = 'amount' THEN
                        IF v_late_min > 0 THEN
                            v_late_amount := CEIL((v_late_min::numeric - COALESCE(v_grace_minutes,0)) / 60) * v_hourly_surcharge_rate;
                            IF v_late_amount < 0 THEN v_late_amount := 0; END IF;
                            v_explanation := v_explanation || format('Trả muộn theo giờ: %s phút -> %s. ', ROUND(v_late_min,0), v_late_amount);
                        END IF;
                    ELSE
                        IF v_late_rules IS NOT NULL AND jsonb_array_length(v_late_rules) > 0 THEN
                             FOR v_rule IN SELECT * FROM jsonb_array_elements(v_late_rules)
                             LOOP
                                v_rule_from := (v_rule->>'from')::time;
                                v_rule_to := (v_rule->>'to')::time;
                                v_rule_percent := (v_rule->>'percent')::numeric;
                                IF v_check_out_time <= v_rule_to THEN
                                    v_late_amount := v_price_daily * (v_rule_percent / 100);
                                    v_explanation := v_explanation || format('Trả muộn đến %s (Rule %s%%) -> %s. ', v_check_out_time, v_rule_percent, v_late_amount);
                                    v_rule_matched := true;
                                    EXIT;
                                END IF;
                             END LOOP;
                             IF NOT v_rule_matched THEN
                                 v_late_amount := v_price_daily;
                                 v_explanation := v_explanation || format('Trả muộn quá khung giờ -> Tính 1 ngày: %s. ', v_price_daily);
                             END IF;
                        ELSE
                             v_late_amount := v_price_daily * 0.3;
                             v_explanation := v_explanation || 'Không tìm thấy luật phụ thu, tính mặc định 30%. ';
                        END IF;
                    END IF;
                END IF;
            END IF;
        END IF;
    END;

    -- 4. Early Checkin Logic (Daily Only)
    IF p_rental_type = 'daily' THEN
        v_check_in_time := p_check_in::time;
        IF (v_check_in_time < v_std_check_in) THEN
            v_early_min := EXTRACT(EPOCH FROM (v_std_check_in - v_check_in_time)) / 60;
            
            IF v_grace_in_enabled AND v_early_min <= v_grace_minutes THEN
                v_early_min := 0;
            ELSE
                 v_rule_matched := false;
                 IF v_surcharge_mode = 'amount' THEN
                     IF v_early_min > 0 THEN
                         v_early_amount := CEIL((v_early_min::numeric - COALESCE(v_grace_minutes,0)) / 60) * v_hourly_surcharge_rate;
                         IF v_early_amount < 0 THEN v_early_amount := 0; END IF;
                         v_explanation := v_explanation || format('Vào sớm theo giờ: %s phút -> %s. ', ROUND(v_early_min,0), v_early_amount);
                     END IF;
                 ELSE
                     IF v_early_rules IS NOT NULL AND jsonb_array_length(v_early_rules) > 0 THEN
                         FOR v_rule IN SELECT * FROM jsonb_array_elements(v_early_rules)
                         LOOP
                            v_rule_from := (v_rule->>'from')::time;
                            v_rule_to := (v_rule->>'to')::time;
                            v_rule_percent := (v_rule->>'percent')::numeric;
                            IF v_check_in_time >= v_rule_from AND v_check_in_time < v_rule_to THEN
                                 v_early_amount := v_price_daily * (v_rule_percent / 100);
                                 v_explanation := v_explanation || format('Vào sớm lúc %s (Rule %s%%) -> %s. ', v_check_in_time, v_rule_percent, v_early_amount);
                                 v_rule_matched := true;
                                 EXIT;
                            END IF;
                         LOOP;
                         IF NOT v_rule_matched THEN
                             v_early_amount := v_price_daily * 0.5;
                             v_explanation := v_explanation || format('Vào sớm ngoài khung luật -> Mặc định 50%: %s. ', v_early_amount);
                         END IF;
                     END IF;
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
-- 4. CORE: EXTRA PERSON CALCULATION (MANUAL INPUT MODE)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calculate_extra_person_charge(
    p_booking_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_enabled boolean;
    v_price_adult numeric;
    v_price_child numeric;
    
    v_extra_adults int := 0;
    v_extra_children int := 0;
    v_total_amount numeric := 0;
    v_explanation text := '';
    
    -- Global Settings
    v_global_enabled boolean;
    v_room_cat_id uuid;
BEGIN
    -- Check Global Toggle First
    SELECT extra_person_enabled
    INTO v_global_enabled 
    FROM public.settings WHERE key = 'config';
    
    v_global_enabled := COALESCE(v_global_enabled, false);

    -- Get Booking Manual Extra Count
    SELECT 
        extra_adults, 
        extra_children, 
        r.id as room_cat_id,
        r.price_extra_adult,
        r.price_extra_child,
        r.extra_person_enabled
    INTO 
        v_extra_adults, 
        v_extra_children, 
        v_room_cat_id,
        v_price_adult,
        v_price_child,
        v_enabled
    FROM public.bookings b
    JOIN public.rooms rm ON b.room_id = rm.id
    JOIN public.room_categories r ON rm.category_id = r.id
    WHERE b.id = p_booking_id;

    v_extra_adults := COALESCE(v_extra_adults, 0);
    v_extra_children := COALESCE(v_extra_children, 0);
    v_price_adult := COALESCE(v_price_adult, 0);
    v_price_child := COALESCE(v_price_child, 0);
    
    IF v_extra_adults > 0 THEN
        v_total_amount := v_total_amount + (v_extra_adults * v_price_adult);
        v_explanation := v_explanation || format('Thêm %s người lớn (Manual): %s. ', v_extra_adults, (v_extra_adults * v_price_adult));
    END IF;
    
    IF v_extra_children > 0 THEN
        v_total_amount := v_total_amount + (v_extra_children * v_price_child);
        v_explanation := v_explanation || format('Thêm %s trẻ em (Manual): %s. ', v_extra_children, (v_extra_children * v_price_child));
    END IF;
    
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
    -- Settings
    v_vat_enabled boolean;
    v_vat_percent numeric;
    v_svc_enabled boolean;
    v_svc_percent numeric;
    
    -- Calc
    v_after_discount numeric;
    v_svc_amount numeric := 0;
    v_vat_amount numeric := 0;
    v_final_amount numeric;
BEGIN
    -- 1. Load Settings (Direct Columns)
    SELECT 
        vat_percent, 
        service_fee_percent,
        vat_enabled,
        service_fee_enabled
    INTO 
        v_vat_percent, 
        v_svc_percent,
        v_vat_enabled,
        v_svc_enabled
    FROM public.settings WHERE key = 'config';
    
    v_vat_percent := COALESCE(v_vat_percent, 0);
    v_svc_percent := COALESCE(v_svc_percent, 0);
    v_vat_enabled := COALESCE(v_vat_enabled, false);
    v_svc_enabled := COALESCE(v_svc_enabled, false);
    
    -- 2. Apply Discount & Custom Surcharge first
    v_after_discount := p_sub_total - COALESCE(p_discount_amount, 0) + COALESCE(p_custom_surcharge, 0);
    
    -- 3. Calc Service Fee (based on after-discount)
    IF v_svc_enabled THEN
        v_svc_amount := v_after_discount * (v_svc_percent / 100);
    END IF;
    
    -- 4. Calc VAT (based on subtotal + svc)
    IF v_vat_enabled THEN
        v_vat_amount := (v_after_discount + v_svc_amount) * (v_vat_percent / 100);
    END IF;
    
    v_final_amount := v_after_discount + v_svc_amount + v_vat_amount;
    
    RETURN jsonb_build_object(
        'sub_total', p_sub_total,
        'discount_amount', p_discount_amount,
        'custom_surcharge', p_custom_surcharge,
        'service_fee_amount', v_svc_amount,
        'vat_amount', v_vat_amount,
        'final_amount', v_final_amount
    );
END;
$$;

-- RELOAD PostgREST Schema cache
NOTIFY pgrst, 'reload schema';