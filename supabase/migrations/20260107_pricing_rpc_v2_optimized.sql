-- OPTIMIZED PRICING BRAIN V2.2
-- Migration: 20260107_pricing_rpc_v2_optimized.sql
-- Description: Sử dụng Compiled Pricing Strategy và Room Categories để đạt hiệu năng tối đa.

BEGIN;

-- 1. Cập nhật helper tính phụ phí (sử dụng mốc thời gian đã biên dịch)
CREATE OR REPLACE FUNCTION public.get_applicable_surcharge_v2(
    p_time timestamptz,
    p_rules jsonb,
    p_base_price numeric
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
    v_minutes_since_midnight INT;
    v_rule jsonb;
    v_max_percent numeric := 0;
BEGIN
    IF p_rules IS NULL OR jsonb_array_length(p_rules) = 0 THEN
        RETURN 0;
    END IF;

    -- Quy đổi thời gian hiện tại ra phút (Asia/Ho_Chi_Minh)
    v_minutes_since_midnight := (EXTRACT(HOUR FROM p_time AT TIME ZONE 'Asia/Ho_Chi_Minh') * 60) + EXTRACT(MINUTE FROM p_time AT TIME ZONE 'Asia/Ho_Chi_Minh');

    -- Tìm rule có phần trăm cao nhất (Sử dụng so sánh số nguyên thay vì chuỗi)
    FOR v_rule IN SELECT * FROM jsonb_array_elements(p_rules)
    LOOP
        DECLARE
            v_from INT := (split_part(v_rule->>'from', ':', 1)::INT * 60) + split_part(v_rule->>'from', ':', 2)::INT;
            v_to INT := (split_part(v_rule->>'to', ':', 1)::INT * 60) + split_part(v_rule->>'to', ':', 2)::INT;
        BEGIN
            IF v_minutes_since_midnight >= v_from AND v_minutes_since_midnight <= v_to THEN
                v_max_percent := GREATEST(v_max_percent, (v_rule->>'percent')::numeric);
            END IF;
        END;
    END LOOP;

    RETURN (p_base_price * v_max_percent) / 100;
END;
$$;

-- 2. Core function: calculate_booking_bill_v2 (Optimized)
CREATE OR REPLACE FUNCTION public.calculate_booking_bill_v2(
    p_booking_id uuid,
    p_check_out_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_room record;
    v_category record;
    v_strategy jsonb;
    v_tax_config jsonb;
    
    v_check_in timestamptz;
    v_check_out timestamptz := p_check_out_at;
    
    v_prices jsonb;
    v_price_hourly numeric;
    v_price_next_hour numeric;
    v_price_overnight numeric;
    v_price_daily numeric;
    
    v_minutes int;
    v_base_charge numeric := 0;
    v_surcharge numeric := 0;
    v_service_total numeric := 0;
    
    v_rental_type text;
    v_duration_text text;
    v_booking_revenue numeric := 0;
    v_summary jsonb;
BEGIN
    -- 1. Lấy dữ liệu Booking & Room & Category (Dùng JOIN để giảm số lần query)
    SELECT b.*, r.category_id, r.prices as room_prices, rc.prices as category_prices, rc.name as category_name
    INTO v_booking
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.room_categories rc ON r.category_id = rc.id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy đơn đặt phòng');
    END IF;

    -- 2. Lấy Strategy đã biên dịch
    SELECT compiled_pricing_strategy, tax_config INTO v_strategy, v_tax_config 
    FROM public.settings 
    WHERE key = 'system_settings';

    -- 3. Xác định giá (Ưu tiên Category)
    v_prices := COALESCE(v_booking.category_prices, v_booking.room_prices);
    v_price_hourly := (v_prices->>'hourly')::numeric;
    v_price_next_hour := (v_prices->>'next_hour')::numeric;
    v_price_overnight := (v_prices->>'overnight')::numeric;
    v_price_daily := (v_prices->>'daily')::numeric;
    
    v_check_in := v_booking.check_in_at;
    v_minutes := EXTRACT(EPOCH FROM (v_check_out - v_check_in))/60;
    v_rental_type := v_booking.rental_type;

    -- 4. Logic tính toán (Sử dụng v_strategy)
    IF v_rental_type = 'hourly' THEN
        DECLARE
            v_grace INT := (v_strategy->'grace_minutes'->>'late')::INT;
            v_extra_mins int := GREATEST(0, v_minutes - 60);
            v_extra_hours int := 0;
        BEGIN
            IF v_extra_mins > v_grace THEN
                v_extra_hours := CEIL(v_extra_mins::numeric / 60);
            END IF;
            v_base_charge := v_price_hourly + (v_extra_hours * v_price_next_hour);
            v_duration_text := (1 + v_extra_hours) || ' giờ';
            v_summary := jsonb_build_object('hours', 1 + v_extra_hours);
        END;

    ELSIF v_rental_type = 'overnight' THEN
        v_base_charge := v_price_overnight;
        v_duration_text := 'Qua đêm';
        -- Phụ phí tự động (Sử dụng helper v2)
        v_surcharge := public.get_applicable_surcharge_v2(v_check_in, v_strategy->'surcharge_rules'->'early', v_price_overnight) +
                       public.get_applicable_surcharge_v2(v_check_out, v_strategy->'surcharge_rules'->'late', v_price_overnight);
        v_summary := jsonb_build_object('type', 'overnight');

    ELSIF v_rental_type = 'daily' THEN
        DECLARE
            v_nights int := GREATEST(1, EXTRACT(DAY FROM (v_check_out - v_check_in)));
            v_check_in_m INT := (EXTRACT(HOUR FROM v_check_in AT TIME ZONE 'Asia/Ho_Chi_Minh') * 60) + EXTRACT(MINUTE FROM v_check_in AT TIME ZONE 'Asia/Ho_Chi_Minh');
            v_check_out_m INT := (EXTRACT(HOUR FROM v_check_out AT TIME ZONE 'Asia/Ho_Chi_Minh') * 60) + EXTRACT(MINUTE FROM v_check_out AT TIME ZONE 'Asia/Ho_Chi_Minh');
            v_std_checkin_m INT := (v_strategy->'time_milestones'->>'check_in_m')::INT;
            v_std_checkout_m INT := (v_strategy->'time_milestones'->>'check_out_m')::INT;
        BEGIN
            v_base_charge := v_nights * v_price_daily;
            v_surcharge := public.get_applicable_surcharge_v2(v_check_in, v_strategy->'surcharge_rules'->'early', v_price_daily) +
                           public.get_applicable_surcharge_v2(v_check_out, v_strategy->'surcharge_rules'->'late', v_price_daily);
            v_duration_text := v_nights || ' ngày';
            v_summary := jsonb_build_object('nights', v_nights);
        END;
    END IF;

    -- 5. Tiền dịch vụ
    SELECT SUM((item->>'price')::numeric * (item->>'quantity')::numeric) INTO v_service_total
    FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) AS item;

    -- 6. Tổng doanh thu (Đã bao gồm thuế)
    DECLARE
        v_total_before_tax numeric := v_base_charge + v_surcharge + COALESCE(v_booking.custom_surcharge, 0) - COALESCE(v_booking.discount_amount, 0);
        v_stay_tax numeric := (v_total_before_tax * COALESCE((v_tax_config->>'stay_tax')::numeric, 0)) / 100;
        v_service_tax numeric := (COALESCE(v_service_total, 0) * COALESCE((v_tax_config->>'service_tax')::numeric, 0)) / 100;
    BEGIN
        v_booking_revenue := v_total_before_tax + COALESCE(v_service_total, 0) + v_stay_tax + v_service_tax;
        
        RETURN jsonb_build_object(
            'success', true,
            'total_amount', ROUND(v_booking_revenue - COALESCE(v_booking.deposit_amount, 0)),
            'booking_revenue', ROUND(v_booking_revenue),
            'room_charge', ROUND(v_base_charge),
            'service_charge', ROUND(COALESCE(v_service_total, 0)),
            'surcharge', ROUND(v_surcharge + COALESCE(v_booking.custom_surcharge, 0)),
            'discount', COALESCE(v_booking.discount_amount, 0),
            'summary', v_summary || jsonb_build_object(
                'category', v_booking.category_name,
                'rental_type', v_rental_type,
                'duration_text', v_duration_text
            )
        );
    END;
END;
$$;

COMMIT;
