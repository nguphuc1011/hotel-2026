-- 1. Bổ sung các cột còn thiếu cho bảng bookings (Snapshot & Period Count)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB DEFAULT NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS rental_period_count JSONB DEFAULT NULL;

-- 2. Xây dựng "Đại Động Cơ" RPC - Phiên bản V2 Chuẩn Hóa (Tính toán dựa trên Snapshot & Strategy Map)
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
    
    -- Biến vòng lặp
    v_rule jsonb;
    v_service jsonb;
    v_cat_strategy jsonb;
BEGIN
    -- 1. Lấy dữ liệu Booking & Khách hàng & Phòng
    SELECT b.*, c.balance as customer_balance, c.full_name
    INTO v_booking
    FROM public.bookings b
    LEFT JOIN public.customers c ON b.customer_id = c.id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Booking not found');
    END IF;

    v_customer_name := v_booking.full_name;
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
    
    -- 2. TÍNH GIÁ CƠ BẢN (BASE PRICE)
    -- Ưu tiên 1: Giá thỏa thuận (Initial Price)
    IF COALESCE(v_booking.initial_price, 0) > 0 THEN
        v_base_price := v_booking.initial_price;
        v_rental_type := 'negotiated';
    ELSE
        -- Logic tính toán cơ bản (Tạm thời: Dưới 4h là Giờ, Trên 4h là Ngày)
        -- TODO: Cần logic Time Engine phức tạp hơn ở đây (Ngày/Đêm/Giờ) dựa trên Settings.
        -- Hiện tại để đảm bảo không bị 0đ, ta dùng logic đơn giản này.
        v_total_hours := EXTRACT(EPOCH FROM (v_check_out - v_check_in)) / 3600;
        
        IF v_total_hours <= 4 THEN
             -- Lấy giá giờ đầu (giả sử cấu trúc prices có first_hour)
             -- Cấu trúc prices thực tế: {"hourly": 50000, "daily": 300000...}
             v_base_price := COALESCE((v_prices->>'hourly')::numeric, 50000) + (GREATEST(0, v_total_hours - 1) * 20000); -- Giả định logic lũy tiến đơn giản
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
                 -- Kiểm tra giờ Check-in có nằm trong khung không
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
    v_total_bill := v_base_price + v_surcharge_early + v_surcharge_late + v_service_total;
    
    -- Khách phải trả = Tổng bill - (Số dư ví). 
    -- Nếu ví âm (Nợ): Bill - (-100) = Bill + 100 (Phải trả thêm nợ cũ)
    -- Nếu ví dương (Cọc): Bill - 100 (Trừ đi tiền đã cọc)
    v_final_amount := v_total_bill - v_customer_debt;

    -- Trả về kết quả
    RETURN jsonb_build_object(
        'booking_id', p_booking_id,
        'rental_type', v_rental_type,
        'base_price', v_base_price,
        'surcharge_early', v_surcharge_early,
        'surcharge_late', v_surcharge_late,
        'service_total', v_service_total,
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
