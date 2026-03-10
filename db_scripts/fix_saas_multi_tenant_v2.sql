-- MIGRATION: CHUYỂN ĐỔI SANG MULTI-TENANT (SAAS) TRIỆT ĐỂ - PHIÊN BẢN CHUẨN SCHEMA
-- 1. TẠO KHÁCH SẠN MẶC ĐỊNH CHO DỮ LIỆU HIỆN CÓ
DO $$ 
DECLARE 
    v_default_hotel_id UUID;
BEGIN 
    -- Kiểm tra nếu chưa có hotel nào, tạo một cái mặc định
    IF NOT EXISTS (SELECT 1 FROM public.hotels) THEN
        INSERT INTO public.hotels (name, phone, status)
        VALUES ('Khách sạn mặc định', '0000000000', 'active')
        RETURNING id INTO v_default_hotel_id;
    ELSE
        SELECT id INTO v_default_hotel_id FROM public.hotels LIMIT 1;
    END IF;

    -- Cập nhật hotel_id cho toàn bộ dữ liệu hiện có (nếu đang NULL)
    UPDATE public.rooms SET hotel_id = v_default_hotel_id WHERE hotel_id IS NULL;
    UPDATE public.room_categories SET hotel_id = v_default_hotel_id WHERE hotel_id IS NULL;
    UPDATE public.bookings SET hotel_id = v_default_hotel_id WHERE hotel_id IS NULL;
    UPDATE public.booking_services SET hotel_id = v_default_hotel_id WHERE hotel_id IS NULL;
    UPDATE public.customers SET hotel_id = v_default_hotel_id WHERE hotel_id IS NULL;
    UPDATE public.cash_flow SET hotel_id = v_default_hotel_id WHERE hotel_id IS NULL;
    UPDATE public.wallets SET hotel_id = v_default_hotel_id WHERE hotel_id IS NULL;
    UPDATE public.external_payables SET hotel_id = v_default_hotel_id WHERE hotel_id IS NULL;
    UPDATE public.staff SET hotel_id = v_default_hotel_id WHERE hotel_id IS NULL;
    UPDATE public.role_permissions SET hotel_id = v_default_hotel_id WHERE hotel_id IS NULL;
    UPDATE public.services SET hotel_id = v_default_hotel_id WHERE hotel_id IS NULL;
    UPDATE public.cash_flow_categories SET hotel_id = v_default_hotel_id WHERE hotel_id IS NULL;
    UPDATE public.settings SET hotel_id = v_default_hotel_id WHERE hotel_id IS NULL;
END $$;

-- 2. THAY ĐỔI CẤU TRÚC KHÓA CHÍNH (PRIMARY KEY) VÀ UNIQUE CONSTRAINTS
-- A. Bảng Wallets (Khắc phục lỗi duplicate wallets_pkey)
ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_pkey;
ALTER TABLE public.wallets ADD PRIMARY KEY (id, hotel_id);

-- B. Bảng Settings
ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE public.settings ADD PRIMARY KEY (key, hotel_id);

-- C. Bảng Cash Flow Categories
ALTER TABLE public.cash_flow_categories DROP CONSTRAINT IF EXISTS cash_flow_categories_name_key;
ALTER TABLE public.cash_flow_categories DROP CONSTRAINT IF EXISTS cash_flow_categories_type_key;
ALTER TABLE public.cash_flow_categories ADD CONSTRAINT cash_flow_categories_name_hotel_unique UNIQUE (name, hotel_id);

-- D. Bảng Rooms
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_room_number_key;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_number_hotel_unique UNIQUE (room_number, hotel_id);

-- E. Bảng Room Categories
ALTER TABLE public.room_categories DROP CONSTRAINT IF EXISTS room_categories_name_key;
ALTER TABLE public.room_categories ADD CONSTRAINT room_categories_name_hotel_unique UNIQUE (name, hotel_id);

-- F. Bảng Services
ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_name_key;
ALTER TABLE public.services ADD CONSTRAINT services_name_hotel_unique UNIQUE (name, hotel_id);

-- G. Bảng Staff (Username per Hotel)
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_username_key;
ALTER TABLE public.staff ADD CONSTRAINT staff_username_hotel_unique UNIQUE (username, hotel_id);

-- H. Bảng Customers (ID Card per Hotel)
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_id_card_key;
ALTER TABLE public.customers ADD CONSTRAINT customers_id_card_hotel_unique UNIQUE (id_card, hotel_id);

-- 3. CẬP NHẬT HÀM ONBOARDING (SỬA LỖI TRÙNG KHÓA VÀ SAI CỘT)
CREATE OR REPLACE FUNCTION public.fn_onboard_new_hotel(
    p_hotel_name TEXT,
    p_admin_name TEXT,
    p_admin_phone TEXT,
    p_admin_pin TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_hotel_id UUID;
    v_admin_id UUID;
BEGIN
    -- A. Tạo Hotel
    INSERT INTO public.hotels (name, phone)
    VALUES (p_hotel_name, p_admin_phone)
    RETURNING id INTO v_hotel_id;

    -- B. Khởi tạo 5 Ví mặc định cho Hotel này
    INSERT INTO public.wallets (id, hotel_id, name, balance) VALUES 
    ('CASH', v_hotel_id, 'Tiền mặt', 0),
    ('BANK', v_hotel_id, 'Ngân hàng', 0),
    ('REVENUE', v_hotel_id, 'Doanh thu', 0),
    ('ESCROW', v_hotel_id, 'Tiền cọc', 0),
    ('RECEIVABLE', v_hotel_id, 'Công nợ', 0);

    -- C. Khởi tạo Danh mục Thu/Chi mặc định
    INSERT INTO public.cash_flow_categories (hotel_id, name, type, is_system, is_active) VALUES 
    (v_hotel_id, 'Tiền phòng', 'IN', true, true),
    (v_hotel_id, 'Tiền cọc', 'IN', true, true),
    (v_hotel_id, 'Bán dịch vụ', 'IN', true, true),
    (v_hotel_id, 'Thu nợ khách', 'IN', true, true),
    (v_hotel_id, 'Chi vận hành', 'OUT', true, true),
    (v_hotel_id, 'Trả nợ NCC', 'OUT', true, true),
    (v_hotel_id, 'Lương nhân viên', 'OUT', true, true);

    -- D. Khởi tạo Cấu hình mặc định
    INSERT INTO public.settings (hotel_id, key, value) VALUES 
    (v_hotel_id, 'config', '{
        "check_in_time": "14:00",
        "check_out_time": "12:00",
        "overnight_start_time": "21:00",
        "overnight_end_time": "08:00"
    }'::jsonb);

    -- E. Tạo tài khoản Owner đầu tiên
    -- Dùng phone làm username vì bảng staff không có cột phone riêng
    INSERT INTO public.staff (hotel_id, full_name, username, role, pin_hash, is_active)
    VALUES (v_hotel_id, p_admin_name, p_admin_phone, 'OWNER', p_admin_pin, true)
    RETURNING id INTO v_admin_id;

    RETURN jsonb_build_object(
        'success', true, 
        'hotel_id', v_hotel_id, 
        'admin_id', v_admin_id,
        'message', 'Khởi tạo khách hàng ' || p_hotel_name || ' thành công!'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi khởi tạo: ' || SQLERRM);
END;
$$;

-- 4. CẬP NHẬT HÀM LOGIN (SỬA SAI CỘT STATUS/PHONE)
CREATE OR REPLACE FUNCTION public.fn_staff_login(p_username text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_staff record;
BEGIN
    -- 1. Verify Credentials (Username có thể là SĐT khách hàng đã tạo)
    SELECT id, username, full_name, role, is_active, pin_hash, hotel_id
    FROM public.staff 
    WHERE username = p_username
    INTO v_staff;

    IF v_staff.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tên đăng nhập không tồn tại');
    END IF;

    IF v_staff.is_active = false THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tài khoản đã bị khóa');
    END IF;

    -- Check PIN
    IF v_staff.pin_hash IS NULL OR v_staff.pin_hash <> p_pin THEN
        RETURN jsonb_build_object('success', false, 'message', 'Mã PIN không chính xác');
    END IF;

    -- 2. Success
    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Đăng nhập thành công',
        'data', jsonb_build_object(
            'id', v_staff.id,
            'username', v_staff.username,
            'full_name', v_staff.full_name,
            'role', v_staff.role,
            'hotel_id', v_staff.hotel_id
        )
    );
END;
$function$;
