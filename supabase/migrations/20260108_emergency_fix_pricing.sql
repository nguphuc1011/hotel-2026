-- Migration: Cứu viện khẩn cấp (Bản chuẩn) - Sửa lỗi tính tiền & Khóa múi giờ UTC
-- Description: Đảm bảo hàm calculate_booking_bill_v2 luôn tính đúng giá và vá Snapshot cho các đơn đang hoạt động

-- 1. CẬP NHẬT HÀM TÍNH TIỀN "BẤT TỬ" VỚI TIMEZONE LOCK
CREATE OR REPLACE FUNCTION public.calculate_booking_bill_v2(p_booking_id uuid) 
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$ 
DECLARE 
    v_booking RECORD; 
    v_settings jsonb; 
    v_strategy jsonb; 
    v_check_in timestamptz; 
    v_check_out timestamptz; 
    -- TIMEZONE LOCK: Sử dụng timezone() để đảm bảo kiểu timestamptz đồng nhất
    v_now timestamptz := timezone('UTC', now()); 
    
    v_room_charge numeric := 0; 
    v_early_surcharge numeric := 0; 
    v_late_surcharge numeric := 0; 
    v_service_total numeric := 0; 
    v_total_final numeric := 0; 
    
    v_diff interval; 
    v_total_seconds numeric; 
    v_rule jsonb; 
    v_room_cat_prices jsonb; 
BEGIN 
    -- 1. LẤY DỮ LIỆU BOOKING & SETTINGS (Gia cố logic Snapshot)
    SELECT 
        b.*, 
        COALESCE(b.pricing_snapshot->'settings', s.value) as settings_value,
        COALESCE(b.pricing_snapshot->'strategy', s.compiled_pricing_strategy->'config') as strategy_config,
        COALESCE(b.pricing_snapshot->'prices', rc.prices) as cat_prices
    INTO v_booking 
    FROM public.bookings b 
    JOIN public.rooms r ON b.room_id = r.id 
    LEFT JOIN public.room_categories rc ON r.category_id = rc.id 
    CROSS JOIN (SELECT value, compiled_pricing_strategy FROM public.settings WHERE key = 'system_settings' LIMIT 1) s 
    WHERE b.id = p_booking_id; 

    IF v_booking.id IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); 
    END IF; 

    -- Giải nén thông số và ép múi giờ đồng nhất
    v_settings := v_booking.settings_value; 
    v_strategy := v_booking.strategy_config; 
    v_check_in := timezone('UTC', v_booking.check_in_at); 
    v_check_out := timezone('UTC', COALESCE(v_booking.check_out_at, now())); 
    v_room_cat_prices := v_booking.cat_prices; 
    
    v_diff := v_check_out - v_check_in; 
    v_total_seconds := extract(epoch from v_diff); 

    -- 2. TÍNH GIÁ PHÒNG GỐC
    IF v_booking.rental_type = 'hourly' THEN 
        DECLARE 
            v_base_h numeric := COALESCE((v_settings->>'baseHours')::numeric, 2); 
            v_unit_m numeric := 60; 
            v_hourly_price numeric := COALESCE((v_room_cat_prices->>'hourly')::numeric, 0); 
            v_next_hour_price numeric := COALESCE((v_room_cat_prices->>'next_hour')::numeric, 0); 
            v_total_units int;
            v_extra_units int;
        BEGIN 
            -- Tổng số block (Ví dụ 3h54p = 3.9h -> CEIL = 4 block)
            v_total_units := CEIL(v_total_seconds::numeric / (v_unit_m * 60));
            -- Số block vượt quá giờ gốc (Ví dụ 4 block - 2h gốc = 2 block lố)
            v_extra_units := GREATEST(0, v_total_units - v_base_h);
            -- Tiền = Giá gốc + (Số block lố * Giá giờ tiếp)
            v_room_charge := v_hourly_price + (v_extra_units * v_next_hour_price);

            -- Giới hạn giá trần nếu có
            IF (v_settings->>'hourly_ceiling_enabled')::boolean = true THEN 
                v_room_charge := LEAST(v_room_charge, COALESCE((v_room_cat_prices->>'daily')::numeric, 0)); 
            END IF; 
        END; 
    ELSIF v_booking.rental_type = 'overnight' THEN 
        v_room_charge := COALESCE((v_room_cat_prices->>'overnight')::numeric, 0); 
    ELSE -- Daily 
        v_room_charge := COALESCE((v_room_cat_prices->>'daily')::numeric, 0); 
    END IF; 

    v_room_charge := COALESCE(v_booking.initial_price, v_room_charge); 

    -- 3. TÍNH PHỤ PHÍ SỚM/MUỘN (Chỉ khi bật Auto và không phải thuê giờ)
    IF (v_settings->>'enableAutoSurcharge')::boolean = true AND v_booking.rental_type != 'hourly' THEN 
        -- Phụ thu Sớm
        IF v_check_in::time < (v_settings->>'check_in')::time THEN 
            FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_strategy->'early_rules', '[]'::jsonb)) LOOP 
                IF v_check_in::time <= (v_rule->>'limit')::time THEN 
                    v_early_surcharge := (v_room_charge * (v_rule->>'pct')::numeric / 100); 
                    EXIT; 
                END IF; 
            END LOOP; 
        END IF; 

        -- Phụ thu Muộn
        DECLARE 
            v_check_out_std time := CASE WHEN v_booking.rental_type = 'overnight' THEN (v_settings->>'overnight_checkout')::time ELSE (v_settings->>'check_out')::time END; 
            v_late_grace numeric := CASE WHEN (v_settings->>'late_grace_enabled')::boolean THEN (v_settings->>'late_grace_minutes')::numeric ELSE 0 END; 
        BEGIN 
            IF v_check_out::time > (v_check_out_std + (COALESCE(v_late_grace, 0) || ' minutes')::interval) THEN 
                FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_strategy->'late_rules', '[]'::jsonb)) LOOP 
                    IF v_check_out::time <= (v_rule->>'limit')::time THEN 
                        v_late_surcharge := (v_room_charge * (v_rule->>'pct')::numeric / 100); 
                        EXIT; 
                    END IF; 
                END LOOP; 
            END IF; 
        END;
    END IF;

    -- 4. TỔNG HỢP DỊCH VỤ (Sửa từ services_used JSONB)
    SELECT COALESCE(SUM((val->>'quantity')::numeric * (val->>'price')::numeric), 0) INTO v_service_total
    FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) AS val;

    -- 5. KẾT QUẢ CUỐI CÙNG (Safe Arithmetic)
    v_total_final := COALESCE(v_room_charge, 0) + COALESCE(v_early_surcharge, 0) + COALESCE(v_late_surcharge, 0) + COALESCE(v_service_total, 0);

    RETURN jsonb_build_object(
        'success', true,
        'rental_type', v_booking.rental_type,
        'check_in_at', v_check_in,
        'check_out_at', v_check_out,
        'duration_seconds', v_total_seconds,
        'room_charge', v_room_charge,
        'service_charge', v_service_total,
        'early_surcharge', v_early_surcharge,
        'late_surcharge', v_late_surcharge,
        'discount_amount', COALESCE(v_booking.discount_amount, 0),
        'total_final', v_total_final - COALESCE(v_booking.discount_amount, 0),
        'timezone_mode', 'UTC'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Lỗi tính toán hóa đơn (Internal Server Error)',
            'error', SQLERRM,
            'detail', SQLSTATE
        );
END; 
$$;

-- 2. VÁ SNAPSHOT DIỆN RỘNG
UPDATE public.bookings b
SET pricing_snapshot = jsonb_build_object(
    'settings', s.value,
    'strategy', s.compiled_pricing_strategy->'config',
    'prices', COALESCE(rc.prices, r.prices),
    'category_name', rc.name,
    'refreshed_at', NOW(),
    'refresh_reason', 'Vá lỗi Snapshot khẩn cấp'
)
FROM public.rooms r
LEFT JOIN public.room_categories rc ON r.category_id = rc.id
CROSS JOIN (SELECT value, compiled_pricing_strategy FROM public.settings WHERE key = 'system_settings' LIMIT 1) s
WHERE b.room_id = r.id 
AND b.status NOT IN ('completed', 'cancelled') 
AND b.pricing_snapshot IS NULL;
