-- ==========================================================
-- RPC: calculate_booking_bill_v2
-- Version: 2.1 (Fix Zero Bill & Add Services List)
-- Author: Trae AI Assistant
-- Date: 2026-01-08
-- ==========================================================

-- 1. Bổ sung cột snapshot nếu chưa có (Để lưu giá tại thời điểm check-in)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'pricing_snapshot') THEN
        ALTER TABLE public.bookings ADD COLUMN pricing_snapshot jsonb DEFAULT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'rental_period_count') THEN
        ALTER TABLE public.bookings ADD COLUMN rental_period_count int DEFAULT 0;
    END IF;
    
    -- Thêm cột compiled_pricing_strategy vào settings nếu chưa có
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'compiled_pricing_strategy') THEN
        ALTER TABLE public.settings ADD COLUMN compiled_pricing_strategy jsonb DEFAULT NULL;
    END IF;
END $$;

-- 2. Hàm tính toán hóa đơn (Single Source of Truth)
CREATE OR REPLACE FUNCTION public.calculate_booking_bill_v2(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_booking record;
    v_room_cat record;
    v_settings record;
    v_strategy jsonb;
    v_prices jsonb;
    v_check_in timestamptz;
    v_check_out timestamptz;
    v_now timestamptz;
    
    -- Biến tính toán
    v_total_hours numeric;
    v_rental_type text := 'hourly'; -- Mặc định
    v_base_price numeric := 0;
    v_surcharge_early numeric := 0;
    v_surcharge_late numeric := 0;
    v_service_total numeric := 0;
    v_total_bill numeric := 0;
    v_final_amount numeric := 0;
    v_customer_debt numeric := 0;
    v_customer_name text;
    v_duration_text text;
    
    -- Biến vòng lặp
    v_rule jsonb;
    v_service jsonb;
    v_cat_strategy jsonb;
    v_diff interval;
BEGIN
    -- 1. Lấy dữ liệu Booking & Khách hàng & Phòng
    SELECT b.*, c.balance as customer_balance, c.full_name
    INTO v_booking
    FROM public.bookings b
    LEFT JOIN public.customers c ON b.customer_id = c.id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Booking not found');
    END IF;

    v_customer_name := COALESCE(v_booking.full_name, 'Khách vãng lai');
    v_customer_debt := COALESCE(v_booking.customer_balance, 0);

    -- Lấy thông tin Hạng phòng (Để lấy giá gốc nếu không có snapshot)
    SELECT * INTO v_room_cat FROM public.room_categories WHERE id = v_booking.room_id;
    
    -- Lấy Cấu hình hệ thống (Để lấy Strategy Map)
    SELECT * INTO v_settings FROM public.settings WHERE key = 'system_settings';
    v_strategy := v_settings.compiled_pricing_strategy;
    
    -- Xác định Bảng giá (Ưu tiên Snapshot -> Hạng phòng)
    v_prices := COALESCE(v_booking.pricing_snapshot, v_room_cat.prices);
    
    -- Xác định Thời gian
    v_check_in := v_booking.check_in_at;
    v_now := now();
    v_check_out := COALESCE(v_booking.check_out_at, v_now);
    
    v_diff := v_check_out - v_check_in;
    v_duration_text := 
        CASE WHEN extract(day from v_diff) > 0 THEN extract(day from v_diff) || ' ngày ' ELSE '' END ||
        CASE WHEN extract(hour from v_diff) > 0 THEN extract(hour from v_diff)::int % 24 || ' giờ ' ELSE '' END ||
        (extract(minute from v_diff)::int % 60) || ' phút';
    
    -- 2. TÍNH GIÁ CƠ BẢN (BASE PRICE)
    -- Ưu tiên 1: Giá thỏa thuận (Initial Price) - Chỉ dùng nếu > 0
    IF COALESCE(v_booking.initial_price, 0) > 0 THEN
        v_base_price := v_booking.initial_price;
        v_rental_type := 'negotiated';
    ELSE
        -- Logic tính toán cơ bản (Tạm thời: Dưới 4h là Giờ, Trên 4h là Ngày)
        v_total_hours := EXTRACT(EPOCH FROM (v_check_out - v_check_in)) / 3600;
        
        IF v_total_hours <= 4 THEN
                -- Giá giờ đầu + (số giờ tiếp theo * giá tiếp theo)
                v_base_price := COALESCE((v_prices->>'hourly')::numeric, 50000) + (GREATEST(0, ceil(v_total_hours) - 1) * COALESCE((v_prices->>'next_hour')::numeric, 20000)); 
                v_rental_type := 'hourly';
        ELSE
                v_base_price := COALESCE((v_prices->>'daily')::numeric, 300000);
                v_rental_type := 'daily';
        END IF;
    END IF;

    -- 3. TÍNH PHỤ THU (SURCHARGES) - Dựa trên Strategy Map
    -- Map cấu trúc: { "room_cat_id": { "early_rules": [...], "late_rules": [...] } }
    IF v_strategy IS NOT NULL THEN
        v_cat_strategy := v_strategy->(v_booking.room_id::text);
        
        IF v_cat_strategy IS NOT NULL THEN
                -- Phụ thu Nhận sớm
                FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_cat_strategy->'early_rules', '[]'::jsonb)) LOOP
                    -- Rule: {from, to, amount}
                    IF v_check_in::time >= (v_rule->>'from')::time AND v_check_in::time <= (v_rule->>'to')::time THEN
                        v_surcharge_early := v_surcharge_early + (v_rule->>'amount')::numeric;
                    END IF;
                END LOOP;
                
                -- Phụ thu Trả muộn
                FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_cat_strategy->'late_rules', '[]'::jsonb)) LOOP
                    IF v_check_out::time >= (v_rule->>'from')::time AND v_check_out::time <= (v_rule->>'to')::time THEN
                        v_surcharge_late := v_surcharge_late + (v_rule->>'amount')::numeric;
                    END IF;
                END LOOP;
        END IF;
    END IF;

    -- 4. TÍNH DỊCH VỤ (SERVICES)
    FOR v_service IN SELECT * FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) LOOP
        v_service_total := v_service_total + ((v_service->>'quantity')::numeric * (v_service->>'price')::numeric);
    END LOOP;

    -- 5. TỔNG HỢP (FINAL SETTLEMENT)
    -- Total Bill = Base + Surcharges (Auto + Manual) + Services - Discount
    v_total_bill := v_base_price 
                    + v_surcharge_early 
                    + v_surcharge_late 
                    + COALESCE(v_booking.custom_surcharge, 0) 
                    + v_service_total 
                    - COALESCE(v_booking.discount_amount, 0);
    
    -- Khách phải trả = Tổng bill - (Số dư ví). 
    -- Nếu Balance < 0 (Khách đang nợ) -> Tổng trả tăng lên.
    -- Nếu Balance > 0 (Khách có tiền thừa) -> Tổng trả giảm đi.
    v_final_amount := v_total_bill - v_customer_debt;

    -- Trả về kết quả
    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'rental_type', v_rental_type,
        'check_in_at', v_check_in,
        'check_out_at', v_check_out,
        'duration_text', v_duration_text,
        'base_price', v_base_price,
        'surcharge_early', v_surcharge_early,
        'surcharge_late', v_surcharge_late,
        'service_total', v_service_total,
        'services_list', COALESCE(v_booking.services_used, '[]'::jsonb),
        'total_bill', v_total_bill,
        'customer_debt', v_customer_debt,
        'final_amount', v_final_amount,
        'customer_name', v_customer_name,
        'breakdown', jsonb_build_object(
            'base', v_base_price,
            'early', v_surcharge_early,
            'late', v_surcharge_late,
            'services', v_service_total,
            'debt', v_customer_debt
        )
    );
END;
$function$;
