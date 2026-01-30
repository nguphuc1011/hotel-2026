-- BILLING ENGINE - STANDARD CLEAN VERSION
-- Updated: 2026-01-16
-- Description: Core business logic for Billing, Checkout, and Inventory.
-- All functions are standardized without _v2/_v3 suffixes.

--------------------------------------------------------------------------------
-- 1. CLEANUP: REMOVE ALL OLD VERSIONS
--------------------------------------------------------------------------------
-- Drop triggers first to avoid dependency errors
DROP TRIGGER IF EXISTS tr_service_inventory_v2 ON public.booking_services;
DROP TRIGGER IF EXISTS tr_check_inventory ON public.booking_services;
DROP TRIGGER IF EXISTS tr_handle_service_inventory ON public.booking_services;

-- Drop functions with CASCADE to be sure
DROP FUNCTION IF EXISTS public.calculate_booking_bill_v2(uuid, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.calculate_booking_bill_v2(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.calculate_booking_bill_v3(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_booking_bill_v3(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.process_checkout_v2(uuid, text, numeric, numeric, numeric, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.process_checkout_v3(uuid, text, numeric, numeric, numeric, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_room_categories_v2() CASCADE;
DROP FUNCTION IF EXISTS public.update_room_category_v2(uuid, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.handle_service_inventory_v2() CASCADE;
DROP FUNCTION IF EXISTS public.fn_calculate_room_charge_v2(text, timestamptz, timestamptz, jsonb, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.fn_calculate_surcharge_v2(text, timestamptz, timestamptz, integer, integer, jsonb, jsonb) CASCADE;

--------------------------------------------------------------------------------
-- 2. HELPER: GET SYSTEM SETTINGS & FORMATTING
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_format_money_vi(p_amount numeric) 
RETURNS text AS $$
BEGIN
    IF p_amount IS NULL THEN RETURN '0'; END IF;
    RETURN replace(to_char(p_amount, 'FM999,999,999,999'), ',', '.');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_settings()
RETURNS SETOF public.settings
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY SELECT * FROM public.settings WHERE key = 'config' LIMIT 1;
END;
$$;

--------------------------------------------------------------------------------
-- 3. CORE: ROOM CHARGE CALCULATION
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
   v_next_blocks int;
   v_check_in_time time;
   v_rental_type_actual text := p_rental_type;
   v_tz text := 'Asia/Ho_Chi_Minh';
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

    -- [HỢP NHẤT] Mốc vào sớm tính thêm 1 ngày chính là mốc Night Audit
    IF v_full_day_early_cutoff IS NULL THEN
        v_full_day_early_cutoff := '04:00:00'::time;
    END IF;
    
    -- 1.1. Validate Settings (CƯỞNG CHẾ: Không dùng thông số cứng)
    IF v_std_check_out IS NULL OR v_overnight_start IS NULL OR v_overnight_end IS NULL OR v_hourly_unit IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', 'LỖI CẤU HÌNH: Bệ hạ chưa thiết lập đầy đủ các thông số (Check-out, Qua đêm, Block giờ...) trong Cài đặt. Không thể tính tiền.'
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
    
    -- Apply Overrides (Priority: Custom Price > Category Price)
    IF v_custom_price > 0 THEN
        IF p_rental_type = 'hourly' THEN 
            v_price_hourly := v_custom_price;
            v_explanations := array_append(v_explanations, format('Giá phòng thỏa thuận (Theo giờ): %sđ', public.fn_format_money_vi(v_custom_price)));
        ELSIF p_rental_type = 'overnight' THEN 
            v_price_overnight := v_custom_price;
            v_explanations := array_append(v_explanations, format('Giá phòng thỏa thuận (Qua đêm): %sđ', public.fn_format_money_vi(v_custom_price)));
        ELSE 
            v_price_daily := v_custom_price;
            v_explanations := array_append(v_explanations, format('Giá phòng thỏa thuận (Theo ngày): %sđ', public.fn_format_money_vi(v_custom_price)));
        END IF;
    END IF;

    -- v_hourly_unit và v_base_block_count đã được load từ settings/category

    v_duration_minutes := FLOOR(EXTRACT(EPOCH FROM (p_check_out - p_check_in)) / 60);
    v_check_in_time := (p_check_in AT TIME ZONE v_tz)::time;
    
    -- [Gạt] Auto-switch to Overnight logic
    IF v_auto_overnight_switch AND p_rental_type IN ('hourly', 'daily') AND v_overnight_enabled THEN
        IF (v_check_in_time >= v_overnight_start OR v_check_in_time <= v_overnight_end) THEN
            v_rental_type_actual := 'overnight';
            v_explanations := array_append(v_explanations, format('Tự động áp dụng giá Qua đêm (Khách nhận phòng lúc %s, thuộc khung giờ %s - %s)', to_char(p_check_in AT TIME ZONE v_tz, 'HH24:MI DD/MM'), to_char(v_overnight_start, 'HH24:MI'), to_char(v_overnight_end, 'HH24:MI')));
        END IF;
    END IF;

    -- [Gạt] Auto-switch Hourly -> Daily (Ceiling Check)
    IF v_rental_type_actual = 'hourly' AND v_ceiling_enabled THEN
        DECLARE
            v_tmp_charge numeric := v_price_hourly;
            v_tmp_remaining numeric;
            v_tmp_blocks int;
        BEGIN
            v_first_block_min := v_base_block_count * v_hourly_unit;
            
            IF v_duration_minutes > v_first_block_min THEN
                v_tmp_remaining := v_duration_minutes - v_first_block_min;
                IF v_grace_out_enabled AND v_tmp_remaining <= v_grace_minutes THEN
                    v_tmp_remaining := 0;
                END IF;
                
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
        v_explanations := array_append(v_explanations, 'Loại hình: Thuê theo giờ');
        v_first_block_min := v_base_block_count * v_hourly_unit;
        v_total_charge := v_price_hourly;
        v_explanations := array_append(v_explanations, format('Giờ đầu tiên (%s phút): %sđ', v_first_block_min, public.fn_format_money_vi(v_price_hourly)));
        
        IF v_duration_minutes > v_first_block_min THEN
            v_remaining_min := v_duration_minutes - v_first_block_min;
            -- [LOGIC MỚI] Khoan hồng từng Block (Grace per Block)
            -- Nguyên tắc: Tính số block trọn vẹn + Xử lý phần dư của block cuối cùng
            
            DECLARE
                v_remainder_min numeric;
            BEGIN
                -- Tính số block trọn vẹn (ví dụ: 65 phút / 60 = 1 block trọn)
                v_next_blocks := FLOOR(v_remaining_min / v_hourly_unit);
                
                -- Tính phần dư (ví dụ: 65 % 60 = 5 phút)
                v_remainder_min := MOD(v_remaining_min, v_hourly_unit);
                
                IF v_remainder_min > 0 THEN
                    -- Nếu phần dư > ân hạn -> Tính thêm 1 block
                    IF (NOT v_grace_out_enabled) OR (v_remainder_min > v_grace_minutes) THEN
                        v_next_blocks := v_next_blocks + 1;
                        v_explanations := array_append(v_explanations, format('Block lẻ %s phút (> %s phút ân hạn) -> Tính tròn 1 block', ROUND(v_remainder_min, 0), v_grace_minutes));
                    ELSE
                        -- Nếu phần dư <= ân hạn -> Miễn phí block này
                        v_explanations := array_append(v_explanations, format('Block lẻ %s phút (<= %s phút ân hạn) -> Miễn phí', ROUND(v_remainder_min, 0), v_grace_minutes));
                    END IF;
                END IF;
            END;

            IF v_next_blocks > 0 THEN
                v_total_charge := v_total_charge + (v_next_blocks * v_price_next);
                v_explanations := array_append(v_explanations, format('Tổng tính thêm: %s block x %sđ = %sđ', 
                    v_next_blocks, public.fn_format_money_vi(v_price_next), public.fn_format_money_vi(v_next_blocks * v_price_next)));
            END IF;
        END IF;
        
        -- Khống chế giá giờ: Đã xử lý ở bước kiểm tra chuyển đổi sang Ngày phía trên


    ELSIF v_rental_type_actual = 'overnight' THEN
        DECLARE
            v_nights int;
        BEGIN
            v_nights := ((p_check_out AT TIME ZONE v_tz)::date - (p_check_in AT TIME ZONE v_tz)::date);
            IF v_nights < 1 THEN v_nights := 1; END IF;

            IF v_overnight_enabled = true AND (v_check_in_time >= v_overnight_start OR v_check_in_time <= v_overnight_end) THEN
                 v_total_charge := v_nights * v_price_overnight;
                 v_explanations := array_append(v_explanations, format('Tiền phòng qua đêm (%s đêm x %sđ): %sđ', v_nights, public.fn_format_money_vi(v_price_overnight), public.fn_format_money_vi(v_total_charge)));
            ELSE
                 v_total_charge := v_nights * v_price_daily;
                 v_explanations := array_append(v_explanations, format('Nhận phòng lúc %s (ngoài khung qua đêm %s-%s): Chuyển sang tính giá ngày (%s ngày x %sđ) = %sđ', to_char(p_check_in AT TIME ZONE v_tz, 'HH24:MI DD/MM'), to_char(v_overnight_start, 'HH24:MI'), to_char(v_overnight_end, 'HH24:MI'), v_nights, public.fn_format_money_vi(v_price_daily), public.fn_format_money_vi(v_total_charge)));
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
           SELECT COALESCE(check_in_time, NULL) INTO v_std_check_in FROM public.settings WHERE key = 'config' LIMIT 1;

           v_days := ((p_check_out AT TIME ZONE v_tz)::date - (p_check_in AT TIME ZONE v_tz)::date);
           
           IF v_days < 0 THEN v_days := 0; END IF;

           -- 1. Check Late Check-out (Full day charge)
           v_check_out_time := (p_check_out AT TIME ZONE v_tz)::time;
           v_late_min := FLOOR(EXTRACT(EPOCH FROM (v_check_out_time - v_std_check_out)) / 60);
           
           -- [Gạt] Sau mốc giờ tự động tính thêm 1 ngày
           IF v_auto_full_day_late AND (v_check_out_time > v_full_day_cutoff) THEN
               IF NOT (v_grace_out_enabled AND v_late_min <= v_grace_minutes) THEN
                   v_days := v_days + 1;
                   v_explanations := array_append(v_explanations, format('Trả phòng lúc %s (sau %s): Tính thêm 1 ngày phòng', to_char(p_check_out AT TIME ZONE v_tz, 'HH24:MI DD/MM'), to_char(v_full_day_cutoff, 'HH24:MI')));
               ELSE
                   v_explanations := array_append(v_explanations, format('Trả muộn %s phút (trong mức miễn phí %s phút): Không tính thêm ngày', ROUND(v_late_min,0), v_grace_minutes));
               END IF;
           END IF;

           -- 2. Check Early Check-in (Full day charge)
           v_check_in_time_only := (p_check_in AT TIME ZONE v_tz)::time;
           v_early_min := FLOOR(EXTRACT(EPOCH FROM (v_std_check_in - v_check_in_time_only)) / 60);

           -- [Gạt] Vào trước mốc Night Audit tự động tính thêm 1 ngày
           IF v_auto_full_day_early AND (v_check_in_time_only < v_full_day_early_cutoff) THEN
               IF NOT (v_grace_in_enabled AND v_early_min <= v_grace_minutes) THEN
                   v_days := v_days + 1;
                   v_explanations := array_append(v_explanations, format('Nhận phòng lúc %s (trước mốc Night Audit %s): Tính thêm 1 ngày phòng', to_char(p_check_in AT TIME ZONE v_tz, 'HH24:MI DD/MM'), to_char(v_full_day_early_cutoff, 'HH24:MI')));
               ELSE
                   v_explanations := array_append(v_explanations, format('Nhận sớm %s phút (trong mức miễn phí %s phút): Không tính thêm ngày', ROUND(v_early_min,0), v_grace_minutes));
               END IF;
           END IF;
           
           IF v_days < 1 THEN 
               v_days := 1; 
               v_explanations := array_append(v_explanations, 'Thời gian ở tối thiểu: Tính 1 ngày phòng');
           END IF;
           
           v_total_charge := v_days * v_price_daily;
           v_explanations := array_append(v_explanations, format('Tiền phòng theo ngày (%s ngày x %sđ): %sđ', v_days, public.fn_format_money_vi(v_price_daily), public.fn_format_money_vi(v_total_charge)));
        END;
    END IF;

    RETURN jsonb_build_object(
        'amount', v_total_charge,
        'explanation', v_explanations,
        'duration_minutes', v_duration_minutes,
        'rental_type_actual', v_rental_type_actual
    );
END;
$$;

--------------------------------------------------------------------------------
-- 4. CORE: SURCHARGE CALCULATION
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
    v_full_day_early_cutoff time;
    v_grace_minutes int;
    v_grace_in_enabled boolean;
    v_grace_out_enabled boolean;
    v_surcharge_rules jsonb;
    v_auto_surcharge_enabled boolean;
    
    v_price_daily numeric;
    v_hourly_surcharge_rate numeric;
    v_surcharge_mode text;
    
    v_early_min numeric := 0;
    v_late_min numeric := 0;
    v_early_amount numeric := 0;
    v_late_amount numeric := 0;
    v_explanations text[] := '{}';
    
    v_rule jsonb;
    v_rule_from_min int;
    v_rule_to_min int;
    v_rule_percent numeric;
    v_rule_type text;
    
    v_check_out_time time;
    v_check_in_time time;
    v_rule_matched boolean := false;
    v_tz text := 'Asia/Ho_Chi_Minh';
BEGIN
    IF p_rental_type = 'hourly' THEN
        RETURN jsonb_build_object('amount', 0, 'early_amount', 0, 'late_amount', 0, 'explanation', ARRAY['Thuê giờ: Không áp dụng phụ thu Sớm/Muộn.']);
    END IF;

    SELECT 
        check_in_time,
        check_out_time,
        overnight_checkout_time,
        full_day_late_after,
        night_audit_time,
        grace_minutes,
        grace_in_enabled,
        grace_out_enabled,
        surcharge_rules,
        auto_surcharge_enabled
    INTO 
        v_std_check_in, v_std_check_out, v_overnight_checkout_time, 
        v_full_day_cutoff, v_full_day_early_cutoff, v_grace_minutes, 
        v_grace_in_enabled, v_grace_out_enabled, v_surcharge_rules, 
        v_auto_surcharge_enabled
    FROM public.settings WHERE key = 'config' LIMIT 1;
    
    -- Validate Settings
    IF v_std_check_in IS NULL OR v_std_check_out IS NULL THEN
         RETURN jsonb_build_object('amount', 0, 'success', false, 'explanation', ARRAY['LỖI CẤU HÌNH: Thiếu mốc giờ Check-in/Check-out chuẩn.']);
    END IF;
    
    SELECT 
        price_daily, hourly_surcharge_amount, surcharge_mode,
        surcharge_rules, auto_surcharge_enabled
    INTO 
        v_price_daily, v_hourly_surcharge_rate, v_surcharge_mode,
        v_surcharge_rules, v_auto_surcharge_enabled
    FROM public.room_categories WHERE id = p_room_cat_id;

    IF NOT v_auto_surcharge_enabled THEN
        RETURN jsonb_build_object('amount', 0, 'early_amount', 0, 'late_amount', 0, 'explanation', ARRAY['Phụ thu tự động đang tắt.']);
    END IF;

    -- 1. LATE CHECK-OUT
    DECLARE
        v_target_checkout time;
    BEGIN
        IF p_rental_type = 'overnight' THEN
            v_target_checkout := v_overnight_checkout_time;
        ELSE 
            v_target_checkout := v_std_check_out;
        END IF;
        
        v_check_out_time := (p_check_out AT TIME ZONE v_tz)::time;

        IF (v_check_out_time > v_target_checkout) THEN
            -- [FIX] Daily rental on same day should NOT be charged Late Fee
            -- (Because Daily rental entitlement usually lasts until next day 12:00)
            IF p_rental_type = 'daily' AND ((p_check_out AT TIME ZONE v_tz)::date = (p_check_in AT TIME ZONE v_tz)::date) THEN
                 v_explanations := array_append(v_explanations, 'Trả phòng trong ngày: Không tính phụ thu trả muộn');
                 v_late_min := 0;
            ELSE
                v_late_min := EXTRACT(EPOCH FROM (v_check_out_time - v_target_checkout)) / 60;
                
                -- Ân hạn ra muộn cho ngày
                IF v_grace_out_enabled AND v_late_min <= v_grace_minutes THEN
                    v_explanations := array_append(v_explanations, format('Trả muộn %s phút (trong mức miễn phí %s phút): Không tính phụ phí', FLOOR(v_late_min), v_grace_minutes));
                    v_late_min := 0;
                ELSE
                    IF p_rental_type = 'daily' AND v_check_out_time > v_full_day_cutoff THEN
                        v_late_amount := 0;
                        v_explanations := array_append(v_explanations, format('Trả phòng lúc %s (sau %s): Đã cộng vào tiền phòng chính', to_char(p_check_out AT TIME ZONE v_tz, 'HH24:MI DD/MM'), to_char(v_full_day_cutoff, 'HH24:MI')));
                    ELSIF v_surcharge_mode = 'amount' THEN
                        v_late_amount := CEIL(v_late_min / 60) * v_hourly_surcharge_rate;
                        v_explanations := array_append(v_explanations, format('Trả muộn %s phút (vượt mức miễn phí %s phút): Phụ thu %s giờ x %sđ/giờ = %sđ', FLOOR(v_late_min), v_grace_minutes, CEIL(v_late_min/60), public.fn_format_money_vi(v_hourly_surcharge_rate), public.fn_format_money_vi(v_late_amount)));
                    ELSE
                        IF v_surcharge_rules IS NOT NULL AND jsonb_typeof(v_surcharge_rules) = 'array' THEN
                             FOR v_rule IN SELECT * FROM jsonb_array_elements(v_surcharge_rules)
                             LOOP
                                v_rule_type := v_rule->>'type';
                                IF v_rule_type = 'Late' THEN
                                    v_rule_from_min := COALESCE((v_rule->>'from_minute')::int, 0);
                                    v_rule_to_min := COALESCE((v_rule->>'to_minute')::int, 0);
                                    v_rule_percent := (v_rule->>'percentage')::numeric;
                                    
                                    IF v_late_min > v_rule_from_min AND v_late_min <= v_rule_to_min THEN
                                        v_late_amount := v_price_daily * (v_rule_percent / 100);
                                        v_explanations := array_append(v_explanations, format('Trả muộn %s phút (Khung %s-%s phút): Phụ thu %s%% giá ngày = %sđ', FLOOR(v_late_min), v_rule_from_min, v_rule_to_min, v_rule_percent, public.fn_format_money_vi(v_late_amount)));
                                        v_rule_matched := true;
                                        EXIT;
                                    END IF;
                                END IF;
                             END LOOP;
                        END IF;
                        
                        IF NOT v_rule_matched THEN
                             v_late_amount := 0;
                             v_explanations := array_append(v_explanations, format('Trả muộn %s phút (Chưa có quy định phụ thu trễ)', FLOOR(v_late_min)));
                        END IF;
                    END IF;
                END IF;
            END IF;
        END IF;
    END;

    -- 2. EARLY CHECK-IN
    IF p_rental_type = 'daily' THEN
        BEGIN
            v_check_in_time := (p_check_in AT TIME ZONE v_tz)::time;
            IF (v_check_in_time < v_std_check_in) THEN
                v_early_min := EXTRACT(EPOCH FROM (v_std_check_in - v_check_in_time)) / 60;
                
                IF v_grace_in_enabled AND v_early_min <= v_grace_minutes THEN
                    v_explanations := array_append(v_explanations, format('Nhận sớm %s phút (trong mức miễn phí %s phút): Không tính phụ phí', FLOOR(v_early_min), v_grace_minutes));
                    v_early_min := 0;
                ELSIF v_check_in_time < v_full_day_early_cutoff THEN
                    v_early_amount := 0;
                    v_explanations := array_append(v_explanations, format('Nhận sớm lúc %s (trước %s): Đã cộng vào tiền phòng chính', to_char(p_check_in AT TIME ZONE v_tz, 'HH24:MI DD/MM'), to_char(v_full_day_early_cutoff, 'HH24:MI')));
                ELSIF v_surcharge_mode = 'amount' THEN
                    v_early_amount := CEIL(v_early_min / 60) * v_hourly_surcharge_rate;
                    v_explanations := array_append(v_explanations, format('Nhận sớm %s phút (vượt mức miễn phí %s phút): Phụ thu %s giờ x %sđ/giờ = %sđ', FLOOR(v_early_min), v_grace_minutes, CEIL(v_early_min/60), public.fn_format_money_vi(v_hourly_surcharge_rate), public.fn_format_money_vi(v_early_amount)));
                ELSE
                    v_rule_matched := false;
                    IF v_surcharge_rules IS NOT NULL AND jsonb_typeof(v_surcharge_rules) = 'array' THEN
                         FOR v_rule IN SELECT * FROM jsonb_array_elements(v_surcharge_rules)
                         LOOP
                            v_rule_type := v_rule->>'type';
                            IF v_rule_type = 'Early' THEN
                                v_rule_from_min := COALESCE((v_rule->>'from_minute')::int, 0);
                                v_rule_to_min := COALESCE((v_rule->>'to_minute')::int, 0);
                                v_rule_percent := (v_rule->>'percentage')::numeric;
                                
                                IF v_early_min > v_rule_from_min AND v_early_min <= v_rule_to_min THEN
                                    v_early_amount := v_price_daily * (v_rule_percent / 100);
                                    v_explanations := array_append(v_explanations, format('Nhận sớm %s phút (Khung %s-%s phút): Phụ thu %s%% giá ngày = %sđ', FLOOR(v_early_min), v_rule_from_min, v_rule_to_min, v_rule_percent, public.fn_format_money_vi(v_early_amount)));
                                    v_rule_matched := true;
                                    EXIT;
                                END IF;
                            END IF;
                         END LOOP;
                    END IF;
                    
                    IF NOT v_rule_matched THEN
                        v_early_amount := 0;
                        v_explanations := array_append(v_explanations, format('Nhận sớm %s phút (Chưa có quy định phụ thu sớm)', FLOOR(v_early_min)));
                    END IF;
                END IF;
            END IF;
        END;
    END IF;

    RETURN jsonb_build_object(
        'amount', v_early_amount + v_late_amount,
        'early_amount', v_early_amount,
        'late_amount', v_late_amount,
        'explanation', v_explanations
    );
END;
$$;

--------------------------------------------------------------------------------
-- 5. CORE: EXTRA PERSON CALCULATION
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
    v_explanations text[] := '{}';
    
    v_global_enabled boolean;
BEGIN
    SELECT extra_person_enabled
    INTO v_global_enabled 
    FROM public.settings WHERE key = 'config' LIMIT 1;
    
    v_global_enabled := COALESCE(v_global_enabled, false);

    SELECT 
        extra_adults, 
        extra_children, 
        r.price_extra_adult,
        r.price_extra_child,
        r.extra_person_enabled
    INTO 
        v_extra_adults, 
        v_extra_children, 
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
    
    IF v_global_enabled AND v_enabled THEN
        IF v_extra_adults > 0 THEN
            v_total_amount := v_total_amount + (v_extra_adults * v_price_adult);
            v_explanations := array_append(v_explanations, format('Phụ thu thêm %s người lớn (x %sđ/người) = %sđ', v_extra_adults, v_price_adult, (v_extra_adults * v_price_adult)));
        END IF;
        
        IF v_extra_children > 0 THEN
            v_total_amount := v_total_amount + (v_extra_children * v_price_child);
            v_explanations := array_append(v_explanations, format('Phụ thu thêm %s trẻ em (x %sđ/bé) = %sđ', v_extra_children, v_price_child, (v_extra_children * v_price_child)));
        END IF;
    END IF;
    
    RETURN jsonb_build_object(
        'amount', v_total_amount,
        'explanation', v_explanations
    );
END;
$$;

--------------------------------------------------------------------------------
-- 6. CORE: BILL ADJUSTMENTS (VAT & SVC)
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
    v_vat_enabled boolean;
    v_vat_percent numeric;
    v_svc_enabled boolean;
    v_svc_percent numeric;
    
    v_after_discount numeric;
    v_svc_amount numeric := 0;
    v_vat_amount numeric := 0;
    v_final_amount numeric;
    v_explanations text[] := '{}';
BEGIN
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
    FROM public.settings WHERE key = 'config' LIMIT 1;
    
    v_vat_percent := COALESCE(v_vat_percent, 0);
    v_svc_percent := COALESCE(v_svc_percent, 0);
    v_vat_enabled := COALESCE(v_vat_enabled, false);
    v_svc_enabled := COALESCE(v_svc_enabled, false);
    
    v_after_discount := p_sub_total - p_discount_amount + p_custom_surcharge;
    
    -- 1. Explanations
    IF p_discount_amount > 0 THEN
        v_explanations := array_append(v_explanations, format('Giảm giá trực tiếp: -%sđ', p_discount_amount));
    END IF;

    IF p_custom_surcharge > 0 THEN
        v_explanations := array_append(v_explanations, format('Phụ phí cộng thêm: +%sđ', p_custom_surcharge));
    END IF;

    IF v_after_discount < 0 THEN v_after_discount := 0; END IF;

    -- 2. SVC
    IF v_svc_enabled AND v_svc_percent > 0 THEN
        v_svc_amount := v_after_discount * (v_svc_percent / 100);
        v_explanations := array_append(v_explanations, format('Phí phục vụ (%s%%): %sđ', v_svc_percent, v_svc_amount));
    END IF;
    
    -- 3. VAT
    IF v_vat_enabled AND v_vat_percent > 0 THEN
        v_vat_amount := (v_after_discount + v_svc_amount) * (v_vat_percent / 100);
        v_explanations := array_append(v_explanations, format('Thuế VAT (%s%%): %sđ', v_vat_percent, v_vat_amount));
    END IF;
    
    v_final_amount := v_after_discount + v_svc_amount + v_vat_amount;
    
    RETURN jsonb_build_object(
        'sub_total_adjusted', v_after_discount,
        'service_fee', v_svc_amount,
        'vat_amount', v_vat_amount,
        'final_amount', v_final_amount,
        'explanation', v_explanations
    );
END;
$$;

--------------------------------------------------------------------------------
-- 7. MASTER: CALCULATE BILLING
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_booking_bill(p_booking_id uuid, p_now_override timestamptz DEFAULT NULL)
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
 
     -- 1. Room Charge
   v_room_res := public.fn_calculate_room_charge(p_booking_id, v_booking.check_in_actual, v_check_out, v_booking.rental_type, v_room_cat_id);
   v_audit_trail := v_audit_trail || ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_room_res->'explanation') = 'array' THEN v_room_res->'explanation' ELSE '[]'::jsonb END) AS x);
   
   -- 2. Early/Late Surcharge
   -- [FIX] Use actual rental type (in case it switched from Hourly -> Daily)
   v_surcharge_res := public.fn_calculate_surcharge(v_booking.check_in_actual, v_check_out, v_room_cat_id, COALESCE(v_room_res->>'rental_type_actual', v_booking.rental_type));
   v_audit_trail := v_audit_trail || ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_surcharge_res->'explanation') = 'array' THEN v_surcharge_res->'explanation' ELSE '[]'::jsonb END) AS x);
    
    -- 3. Extra Person
    v_extra_person_res := public.fn_calculate_extra_person_charge(p_booking_id);
    v_audit_trail := v_audit_trail || ARRAY(SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_extra_person_res->'explanation') = 'array' THEN v_extra_person_res->'explanation' ELSE '[]'::jsonb END) AS x);

    -- 4. Services
    SELECT 
        COALESCE(SUM(quantity * price_at_time), 0),
        COALESCE(jsonb_agg(jsonb_build_object('name', s.name, 'quantity', bs.quantity, 'price', bs.price_at_time, 'total', bs.quantity * bs.price_at_time)), '[]'::jsonb)
    INTO v_service_total, v_service_items
    FROM public.booking_services bs
    JOIN public.services s ON bs.service_id = s.id
    WHERE bs.booking_id = p_booking_id;

    IF v_service_total > 0 THEN
        v_audit_trail := array_append(v_audit_trail, format('Dịch vụ: %s', public.fn_format_money_vi(v_service_total)));
    END IF;

    v_total_amount := COALESCE((v_room_res->>'amount')::numeric, 0) + 
                      COALESCE((v_surcharge_res->>'amount')::numeric, 0) + 
                      COALESCE((v_extra_person_res->>'amount')::numeric, 0) + 
                      v_service_total;

    -- 5. VAT, SVC, Discounts
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
 $$;

--------------------------------------------------------------------------------
-- 8. CORE: PROCESS CHECKOUT
--------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid);

CREATE OR REPLACE FUNCTION public.process_checkout(
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
SECURITY DEFINER
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

    -- 1. Update Booking
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, '')
    WHERE id = p_booking_id;

    -- 2. Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 3. Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 4. Record Cash Flow (Dòng tiền)
    BEGIN
        IF p_amount_paid > 0 THEN
            INSERT INTO public.cash_flow (
                flow_type, 
                category, 
                amount, 
                description, 
                created_by, 
                ref_id, 
                is_auto, 
                occurred_at,
                payment_method_code
            )
            VALUES (
                'IN', 
                'Tiền phòng', 
                p_amount_paid, 
                'Thanh toán checkout phòng ' || COALESCE(v_bill->>'room_name', '???') || ' - ' || COALESCE(v_bill->>'customer_name', 'Khách lẻ'), 
                v_staff_id, 
                p_booking_id, 
                true, 
                now(),
                lower(p_payment_method)
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN 
        -- Log error to audit_logs instead of silent fail
        INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
        VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, 0, to_jsonb(ARRAY['Lỗi ghi nhận dòng tiền: ' || SQLERRM]));
    END;

    -- 5. Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- 6. Record Audit Log (Lưu vết tính toán)
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');

    -- 7. Lưu giải trình vào Booking (Audit Trail)
    UPDATE public.bookings 
    SET billing_audit_trail = v_bill->'explanation'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$$;

--------------------------------------------------------------------------------
-- 9. CATEGORY MANAGEMENT
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_room_categories()
RETURNS SETOF public.room_categories
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY SELECT * FROM public.room_categories ORDER BY name;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_room_category(p_id uuid, p_category jsonb)
 RETURNS room_categories
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE v_ret public.room_categories;
BEGIN
    UPDATE public.room_categories SET 
        name = COALESCE((p_category->>'name'), name),
        prices = COALESCE((p_category->'prices'), prices),
        max_adults = COALESCE((p_category->>'max_adults')::integer, max_adults),
        max_children = COALESCE((p_category->>'max_children')::integer, max_children),
        extra_person_enabled = COALESCE((p_category->>'extra_person_enabled')::boolean, extra_person_enabled),
        updated_at = now()
    WHERE id = p_id RETURNING * INTO v_ret;
    RETURN v_ret;
END; $$;

--------------------------------------------------------------------------------
-- 10. INVENTORY TRIGGER
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_service_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
DECLARE v_new_stock integer;
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.services SET stock_quantity = stock_quantity - NEW.quantity WHERE id = NEW.service_id AND track_inventory = true RETURNING stock_quantity INTO v_new_stock;
        IF FOUND THEN INSERT INTO public.inventory_logs (service_id, type, quantity, balance_before, balance_after, reference_id, notes) VALUES (NEW.service_id, 'SALE', -NEW.quantity, v_new_stock + NEW.quantity, v_new_stock, NEW.booking_id, 'Xuất bán cho phòng'); END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.status = 'active' AND (NEW.status = 'returned' OR NEW.status = 'voided')) THEN
            UPDATE public.services SET stock_quantity = stock_quantity + OLD.quantity WHERE id = OLD.service_id AND track_inventory = true RETURNING stock_quantity INTO v_new_stock;
            IF FOUND THEN INSERT INTO public.inventory_logs (service_id, type, quantity, balance_before, balance_after, reference_id, notes) VALUES (OLD.service_id, 'RETURN', OLD.quantity, v_new_stock - OLD.quantity, v_new_stock, OLD.booking_id, 'Hoàn kho do ' || CASE WHEN NEW.status = 'returned' THEN 'khách trả' ELSE 'hủy món' END); END IF;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
         IF OLD.status = 'active' THEN
            UPDATE public.services SET stock_quantity = stock_quantity + OLD.quantity WHERE id = OLD.service_id AND track_inventory = true RETURNING stock_quantity INTO v_new_stock;
            IF FOUND THEN INSERT INTO public.inventory_logs (service_id, type, quantity, balance_before, balance_after, reference_id, notes) VALUES (OLD.service_id, 'RETURN', OLD.quantity, v_new_stock - OLD.quantity, v_new_stock, OLD.booking_id, 'Hoàn kho do xóa khỏi phòng'); END IF;
         END IF;
         RETURN OLD;
    END IF;
    RETURN NULL;
END; $$;

--------------------------------------------------------------------------------
-- 11. TRIGGERS
--------------------------------------------------------------------------------
CREATE TRIGGER tr_handle_service_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.booking_services
FOR EACH ROW EXECUTE FUNCTION public.handle_service_inventory();
