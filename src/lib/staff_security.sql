-- STAFF & SECURITY SCHEMA AND RPCs
-- Created: 2026-01-20
-- Description: Quản lý nhân viên và cấu hình nút gạt bảo mật

--------------------------------------------------------------------------------
-- 0. Schema Setup
--------------------------------------------------------------------------------

-- Create settings_security table
CREATE TABLE IF NOT EXISTS public.settings_security (
    key text PRIMARY KEY,
    description text,
    is_enabled boolean DEFAULT true,
    category text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add pin_hash to staff table
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS pin_hash text;

-- Initialize security settings
INSERT INTO public.settings_security (key, description, is_enabled, category)
VALUES 
    ('checkin_custom_price', 'Nhập giá phòng tùy chỉnh', true, 'checkin'),
    ('checkin_override_surcharge', 'Tắt/Sửa phụ thu tự động', true, 'checkin'),
    ('checkin_debt_allow', 'Cho phép nhận phòng khi đang nợ', true, 'checkin'),
    ('folio_add_service', 'Thêm dịch vụ/đồ uống', false, 'folio'),
    ('folio_remove_service', 'Xóa món dịch vụ (CỰC NHẠY CẢM)', true, 'folio'),
    ('folio_edit_service', 'Sửa số lượng/đơn giá dịch vụ', true, 'folio'),
    ('folio_change_room', 'Đổi phòng', true, 'folio'),
    ('checkout_discount', 'Áp dụng giảm giá (Discount)', true, 'checkout'),
    ('checkout_custom_surcharge', 'Thêm phụ thu thủ công', true, 'checkout'),
    ('checkout_mark_as_debt', 'Xác nhận khách nợ (Ghi sổ)', true, 'checkout'),
    ('checkout_refund', 'Hoàn tiền mặt cho khách', true, 'checkout'),
    ('checkout_void_bill', 'Hủy hóa đơn đã thanh toán', true, 'checkout'),
    ('finance_manage_category', 'Quản lý danh mục thu chi', true, 'finance'),
    ('finance_manual_cash_out', 'Chi tiền mặt từ két', true, 'finance'),
    ('finance_delete_transaction', 'Xóa lịch sử thu chi', true, 'finance'),
    ('inventory_adjust', 'Điều chỉnh kho (Hư hỏng/mất)', true, 'inventory')
ON CONFLICT (key) DO NOTHING;

--------------------------------------------------------------------------------
-- 1. Quản lý cấu hình bảo mật (Nút gạt)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_security_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_object_agg(key, is_enabled)
    INTO v_result
    FROM public.settings_security;
    
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_security_setting(
    p_key text,
    p_is_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.settings_security
    SET is_enabled = p_is_enabled,
        updated_at = NOW()
    WHERE key = p_key;
    
    RETURN jsonb_build_object('success', true, 'message', 'Cập nhật cấu hình thành công');
END;
$$;

--------------------------------------------------------------------------------
-- 2. Quản lý nhân viên (Thêm/Sửa/Xóa/Đổi PIN)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_manage_staff(
    p_action text, -- 'CREATE', 'UPDATE', 'DELETE', 'SET_PIN'
    p_id uuid DEFAULT NULL,
    p_username text DEFAULT NULL,
    p_full_name text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_pin_hash text DEFAULT NULL,
    p_is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_action = 'CREATE' THEN
        IF EXISTS (SELECT 1 FROM public.staff WHERE username = p_username) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Tên đăng nhập đã tồn tại');
        END IF;
        
        -- Insert with default password_hash to satisfy constraint
        INSERT INTO public.staff (username, full_name, role, is_active, pin_hash, password_hash)
        VALUES (p_username, p_full_name, p_role, p_is_active, p_pin_hash, 'PENDING_SETUP');
        
        RETURN jsonb_build_object('success', true, 'message', 'Thêm nhân viên thành công');
        
    ELSIF p_action = 'UPDATE' THEN
        UPDATE public.staff
        SET full_name = COALESCE(p_full_name, full_name),
            role = COALESCE(p_role, role),
            is_active = COALESCE(p_is_active, is_active)
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Cập nhật nhân viên thành công');
        
    ELSIF p_action = 'SET_PIN' THEN
        UPDATE public.staff
        SET pin_hash = p_pin_hash
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Cài đặt mã PIN thành công');
        
    ELSIF p_action = 'DELETE' THEN
        -- Check if staff is tied to any shifts before deleting
        -- For now, just deactivate
        UPDATE public.staff SET is_active = false WHERE id = p_id;
        RETURN jsonb_build_object('success', true, 'message', 'Đã ngừng kích hoạt tài khoản nhân viên');
    END IF;
    
    RETURN jsonb_build_object('success', false, 'message', 'Hành động không hợp lệ');
END;
$$;

--------------------------------------------------------------------------------
-- 3. Xác thực PIN
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_verify_staff_pin(
    p_staff_id uuid,
    p_pin_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_correct_hash text;
BEGIN
    SELECT pin_hash INTO v_correct_hash FROM public.staff WHERE id = p_staff_id;
    RETURN v_correct_hash = p_pin_hash;
END;
$$;
