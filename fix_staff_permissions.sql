-- FIX STAFF PERMISSIONS - SAFE UPDATE ONLY
-- Tuân thủ Hiến pháp Điều 3: Chỉ cập nhật dữ liệu, không thay đổi schema

-- 1. Kiểm tra hiện trạng
SELECT 'BEFORE UPDATE - CURRENT STAFF PERMISSIONS:' as status;
SELECT role_code, role_name, permissions, updated_at 
FROM public.role_permissions 
WHERE role_code = 'Staff';

-- 2. Cập nhật permissions cho Staff (CHỈ dữ liệu, không schema)
UPDATE public.role_permissions 
SET permissions = '["view_dashboard","view_money","view_money_balance_cash","view_money_extra_funds_receivable","view_reports"]'::jsonb,
    updated_at = NOW()
WHERE role_code = 'Staff';

-- 3. Xác nhận thay đổi
SELECT 'AFTER UPDATE - VERIFY CHANGES:' as status;
SELECT role_code, role_name, permissions, updated_at 
FROM public.role_permissions 
WHERE role_code = 'Staff';

-- 4. Kiểm tra không có thay đổi schema nào
SELECT 'SCHEMA INTEGRITY CHECK - NO CHANGES TO STRUCTURE:' as status;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'role_permissions'
ORDER BY ordinal_position;