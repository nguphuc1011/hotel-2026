-- 1. DROP OLD VERSIONS OF THE FUNCTION TO AVOID CONFLICTS
DROP FUNCTION IF EXISTS public.fn_onboard_new_hotel(text, text, text, text);
DROP FUNCTION IF EXISTS public.fn_onboard_new_hotel(text, text, text, text, text);

-- 2. CREATE THE FINAL REFINED ONBOARDING FUNCTION
CREATE OR REPLACE FUNCTION public.fn_onboard_new_hotel(
    p_hotel_name TEXT,
    p_admin_name TEXT,
    p_admin_phone TEXT,
    p_admin_pin TEXT,
    p_hotel_slug TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_hotel_id UUID;
    v_admin_id UUID;
    v_slug TEXT;
BEGIN
    -- A. Xử lý Slug (URL định danh)
    v_slug := COALESCE(p_hotel_slug, lower(regexp_replace(p_hotel_name, '[^a-zA-Z0-9]+', '-', 'g')));
    
    -- Kiểm tra slug trùng lặp, nếu trùng thì thêm đuôi ngẫu nhiên
    IF EXISTS (SELECT 1 FROM public.hotels WHERE slug = v_slug) THEN
        v_slug := v_slug || '-' || floor(random() * 1000)::text;
    END IF;

    -- B. Tạo Hotel mới
    INSERT INTO public.hotels (name, phone, slug, status)
    VALUES (p_hotel_name, p_admin_phone, v_slug, 'active')
    RETURNING id INTO v_hotel_id;

    -- C. Khởi tạo 5 Ví mặc định (Bắt buộc có hotel_id, name, id)
    INSERT INTO public.wallets (id, hotel_id, name, balance) VALUES 
    ('CASH', v_hotel_id, 'Tiền mặt', 0),
    ('BANK', v_hotel_id, 'Ngân hàng', 0),
    ('REVENUE', v_hotel_id, 'Doanh thu', 0),
    ('ESCROW', v_hotel_id, 'Tiền cọc', 0),
    ('RECEIVABLE', v_hotel_id, 'Công nợ', 0);

    -- D. Khởi tạo Danh mục Thu/Chi mặc định
    INSERT INTO public.cash_flow_categories (hotel_id, name, type, is_system, is_active, is_revenue) VALUES 
    (v_hotel_id, 'Tiền phòng', 'IN', true, true, true),
    (v_hotel_id, 'Tiền cọc', 'IN', true, true, false),
    (v_hotel_id, 'Bán dịch vụ', 'IN', true, true, true),
    (v_hotel_id, 'Thu nợ khách', 'IN', true, true, false),
    (v_hotel_id, 'Chi vận hành', 'OUT', true, true, false),
    (v_hotel_id, 'Trả nợ NCC', 'OUT', true, true, false),
    (v_hotel_id, 'Lương nhân viên', 'OUT', true, true, false);

    -- E. Khởi tạo Cấu hình mặc định (Tuân thủ NOT NULL constraints)
    INSERT INTO public.settings (
        hotel_id, 
        key, 
        hotel_name, 
        check_in_time, 
        check_out_time, 
        overnight_start_time, 
        overnight_end_time,
        auto_surcharge_enabled,
        vat_enabled,
        vat_percent,
        service_fee_enabled,
        service_fee_percent,
        grace_minutes,
        auto_deduct_inventory,
        enable_print_bill,
        allow_manual_price_override
    ) VALUES (
        v_hotel_id, 
        'config', 
        p_hotel_name, 
        '14:00'::time, 
        '12:00'::time, 
        '22:00'::time, 
        '08:00'::time,
        true,
        false,
        10,
        false,
        5,
        15,
        true,
        true,
        false
    );

    -- F. Tạo tài khoản Owner (Fix lỗi password_hash NOT NULL)
    -- Sử dụng SĐT làm username để Sale dễ bàn giao
    INSERT INTO public.staff (
        hotel_id, 
        full_name, 
        username, 
        password_hash, -- Cột này NOT NULL nên phải có giá trị
        role, 
        pin_hash, 
        is_active
    )
    VALUES (
        v_hotel_id, 
        p_admin_name, 
        p_admin_phone, 
        'NOT_SET_USE_PIN', -- Placeholder vì hệ thống dùng PIN
        'OWNER', 
        p_admin_pin, 
        true
    )
    RETURNING id INTO v_admin_id;

    RETURN jsonb_build_object(
        'success', true, 
        'hotel_id', v_hotel_id, 
        'slug', v_slug,
        'message', 'Khởi tạo khách hàng ' || p_hotel_name || ' thành công! Đường dẫn: /' || v_slug || '/login'
    );
EXCEPTION WHEN OTHERS THEN
    -- Trả về lỗi chi tiết để debug
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi DB: ' || SQLERRM);
END;
$$;
