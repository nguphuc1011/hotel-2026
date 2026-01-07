-- Migration: 20260107_add_pricing_snapshot_to_bookings.sql
-- Description: Thêm cột pricing_snapshot để lưu trữ giá và chiến lược tại thời điểm check-in, đảm bảo tính nhất quán hóa đơn.

BEGIN;

-- 1. Thêm cột pricing_snapshot vào bảng bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB;

-- 2. Cập nhật RPC calculate_booking_bill_v2 để ưu tiên sử dụng snapshot
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
    -- 1. Lấy dữ liệu Booking & Room & Category
    SELECT b.*, r.category_id, r.prices as room_prices, rc.prices as category_prices, rc.name as category_name
    INTO v_booking
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.room_categories rc ON r.category_id = rc.id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy đơn đặt phòng');
    END IF;

    -- 2. Xác định Strategy và Giá (Ưu tiên từ snapshot)
    -- Nếu có snapshot, dùng snapshot. Nếu không, dùng dữ liệu hiện tại (tương thích ngược)
    IF v_booking.pricing_snapshot IS NOT NULL THEN
        v_strategy := v_booking.pricing_snapshot->'strategy';
        v_tax_config := v_booking.pricing_snapshot->'tax_config';
        v_prices := v_booking.pricing_snapshot->'prices';
    ELSE
        -- Fallback về settings hệ thống nếu chưa có snapshot
        SELECT compiled_pricing_strategy, tax_config INTO v_strategy, v_tax_config 
        FROM public.settings 
        WHERE key = 'system_settings';
        
        v_prices := COALESCE(v_booking.category_prices, v_booking.room_prices);
    END IF;

    -- Trích xuất giá
    v_price_hourly := (v_prices->>'hourly')::numeric;
    v_price_next_hour := (v_prices->>'next_hour')::numeric;
    v_price_overnight := (v_prices->>'overnight')::numeric;
    v_price_daily := (v_prices->>'daily')::numeric;
    
    v_check_in := v_booking.check_in_at;
    v_minutes := EXTRACT(EPOCH FROM (v_check_out - v_check_in))/60;
    v_rental_type := v_booking.rental_type;

    -- 3. Logic tính toán (Sử dụng v_strategy)
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
        v_surcharge := public.get_applicable_surcharge_v2(v_check_in, v_strategy->'surcharge_rules'->'early', v_price_overnight) +
                       public.get_applicable_surcharge_v2(v_check_out, v_strategy->'surcharge_rules'->'late', v_price_overnight);
        v_summary := jsonb_build_object('type', 'overnight');

    ELSIF v_rental_type = 'daily' THEN
        DECLARE
            v_nights int := GREATEST(1, EXTRACT(DAY FROM (v_check_out - v_check_in)));
        BEGIN
            v_base_charge := v_nights * v_price_daily;
            v_surcharge := public.get_applicable_surcharge_v2(v_check_in, v_strategy->'surcharge_rules'->'early', v_price_daily) +
                           public.get_applicable_surcharge_v2(v_check_out, v_strategy->'surcharge_rules'->'late', v_price_daily);
            v_duration_text := v_nights || ' ngày';
            v_summary := jsonb_build_object('nights', v_nights);
        END;
    END IF;

    -- 4. Tiền dịch vụ
    SELECT SUM((item->>'price')::numeric * (item->>'quantity')::numeric) INTO v_service_total
    FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) AS item;

    -- 5. Tổng doanh thu
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
                'category', COALESCE(v_booking.pricing_snapshot->>'category_name', v_booking.category_name),
                'rental_type', v_rental_type,
                'duration_text', v_duration_text,
                'is_snapshot', (v_booking.pricing_snapshot IS NOT NULL)
            )
        );
    END;
END;
$$;

-- 3. Trigger tự động tạo snapshot khi check-in
CREATE OR REPLACE FUNCTION public.fn_create_booking_pricing_snapshot()
RETURNS TRIGGER AS $$
DECLARE
    v_strategy jsonb;
    v_tax_config jsonb;
    v_prices jsonb;
    v_category_name TEXT;
BEGIN
    -- Chỉ thực hiện khi chuyển trạng thái sang 'checked_in' hoặc tạo mới với 'checked_in'
    -- Hoặc nếu rental_type thay đổi (cần cập nhật snapshot nếu muốn)
    IF (TG_OP = 'INSERT' AND NEW.status = 'checked_in') OR 
       (TG_OP = 'UPDATE' AND OLD.status != 'checked_in' AND NEW.status = 'checked_in') THEN
        
        -- Lấy strategy hiện tại
        SELECT compiled_pricing_strategy, tax_config INTO v_strategy, v_tax_config 
        FROM public.settings 
        WHERE key = 'system_settings';

        -- Lấy giá từ phòng/hạng phòng
        SELECT 
            COALESCE(rc.prices, r.prices),
            rc.name
        INTO v_prices, v_category_name
        FROM public.rooms r
        LEFT JOIN public.room_categories rc ON r.category_id = rc.id
        WHERE r.id = NEW.room_id;

        -- Tạo snapshot
        NEW.pricing_snapshot := jsonb_build_object(
            'strategy', v_strategy,
            'tax_config', v_tax_config,
            'prices', v_prices,
            'category_name', v_category_name,
            'created_at', NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_booking_pricing_snapshot ON public.bookings;
CREATE TRIGGER trg_create_booking_pricing_snapshot
    BEFORE INSERT OR UPDATE ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_create_booking_pricing_snapshot();

COMMIT;
