-- MIGRATION: CHUYỂN ĐỔI SANG MULTI-TENANT (SAAS) TRIỆT ĐỂ
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

-- G. Bảng Staff (Username)
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_username_key;
ALTER TABLE public.staff ADD CONSTRAINT staff_username_hotel_unique UNIQUE (username, hotel_id);

-- H. Bảng Customers (ID Card)
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_id_card_key;
ALTER TABLE public.customers ADD CONSTRAINT customers_id_card_hotel_unique UNIQUE (id_card, hotel_id);

-- 3. CẬP NHẬT HÀM ONBOARDING (SAU KHI ĐÃ SỬA SCHEMA)
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
    -- Bây giờ (id, hotel_id) là PK nên không bị lỗi trùng 'CASH' nữa
    INSERT INTO public.wallets (id, hotel_id, name, balance) VALUES 
    ('CASH', v_hotel_id, 'Tiền mặt', 0),
    ('BANK', v_hotel_id, 'Ngân hàng', 0),
    ('REVENUE', v_hotel_id, 'Doanh thu', 0),
    ('ESCROW', v_hotel_id, 'Tiền cọc', 0),
    ('RECEIVABLE', v_hotel_id, 'Công nợ', 0);

    -- C. Khởi tạo Danh mục Thu/Chi mặc định
    INSERT INTO public.cash_flow_categories (hotel_id, name, type) VALUES 
    (v_hotel_id, 'Tiền phòng', 'IN'),
    (v_hotel_id, 'Tiền cọc', 'IN'),
    (v_hotel_id, 'Bán dịch vụ', 'IN'),
    (v_hotel_id, 'Thu nợ khách', 'IN'),
    (v_hotel_id, 'Chi vận hành', 'OUT'),
    (v_hotel_id, 'Trả nợ NCC', 'OUT'),
    (v_hotel_id, 'Lương nhân viên', 'OUT');

    -- D. Khởi tạo Cấu hình mặc định
    INSERT INTO public.settings (hotel_id, key, value) VALUES 
    (v_hotel_id, 'config', '{
        "check_in_time": "14:00",
        "check_out_time": "12:00",
        "overnight_start_time": "21:00",
        "overnight_end_time": "08:00"
    }'::jsonb);

    -- E. Tạo tài khoản Owner đầu tiên
    INSERT INTO public.staff (hotel_id, full_name, phone, username, role, pin_hash, status)
    VALUES (v_hotel_id, p_admin_name, p_admin_phone, p_admin_phone, 'OWNER', p_admin_pin, 'active')
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

-- 4. CẬP NHẬT RLS POLICIES (BẢO MẬT PHÂN TÁCH DỮ LIỆU)
-- Hàm helper để lấy hotel_id của người dùng hiện tại
CREATE OR REPLACE FUNCTION public.fn_get_my_hotel_id() RETURNS UUID AS $$
    SELECT hotel_id FROM public.staff WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Áp dụng chính sách cho tất cả các bảng quan trọng
DO $$ 
DECLARE 
    t_name TEXT;
BEGIN 
    FOR t_name IN 
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (
            'rooms', 'room_categories', 'bookings', 'booking_services', 
            'customers', 'cash_flow', 'wallets', 'external_payables', 
            'staff', 'role_permissions', 'services', 'cash_flow_categories', 
            'settings', 'audit_logs', 'inventory_logs'
        )
    LOOP 
        -- Xóa các policy cũ
        EXECUTE format('DROP POLICY IF EXISTS "SaaS Isolation Policy" ON public.%I', t_name);
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated" ON public.%I', t_name);
        
        -- Tạo policy mới
        EXECUTE format('CREATE POLICY "SaaS Isolation Policy" ON public.%I 
                        FOR ALL TO authenticated 
                        USING (hotel_id = public.fn_get_my_hotel_id())
                        WITH CHECK (hotel_id = public.fn_get_my_hotel_id())', t_name);
    END LOOP;
END $$;
