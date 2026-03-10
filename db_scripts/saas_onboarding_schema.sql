-- 1. TẠO BẢNG QUẢN LÝ KHÁCH SẠN (TENANTS)
CREATE TABLE IF NOT EXISTS public.hotels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    settings JSONB DEFAULT '{}'::jsonb -- Lưu các cấu hình riêng biệt của hotel
);

-- 2. THÊM CỘT hotel_id VÀO CÁC BẢNG LÕI (NẾU CHƯA CÓ)
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
            'settings', 'audit_logs', 'inventory_logs', 'user_floors'
        )
    LOOP 
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS hotel_id UUID REFERENCES public.hotels(id)', t_name);
    END LOOP;
END $$;

-- 3. HÀM KHỞI TẠO DỮ LIỆU MẶC ĐỊNH CHO HOTEL MỚI (DÙNG CHO SALE)
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

    -- B. Khởi tạo 5 Ví mặc định
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

    -- E. Tạo tài khoản Admin đầu tiên cho khách sạn
    -- Lưu ý: Đây là tài khoản trong bảng staff để quản lý nội bộ hotel
    INSERT INTO public.staff (hotel_id, full_name, phone, role, pin_hash, status)
    VALUES (v_hotel_id, p_admin_name, p_admin_phone, 'OWNER', p_admin_pin, 'active')
    RETURNING id INTO v_admin_id;

    RETURN jsonb_build_object(
        'success', true, 
        'hotel_id', v_hotel_id, 
        'admin_id', v_admin_id,
        'message', 'Khởi tạo khách hàng ' || p_hotel_name || ' thành công!'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
