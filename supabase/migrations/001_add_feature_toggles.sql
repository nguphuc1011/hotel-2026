-- Migration 001: Thêm cơ chế Feature Toggles (Công tắc tính năng)
-- Mục tiêu: Cho phép Bệ Hạ bật/tắt tính năng Pro/Premium cho từng khách hàng.

-- 1. Thêm cột features vào bảng hotels
ALTER TABLE public.hotels 
ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{
    "shift_management": false,
    "employee_debt": false,
    "advanced_reports": false,
    "saas_admin_access": false,
    "admin_command_center": false
}'::jsonb;

-- 2. Cập nhật dữ liệu cho khách sạn 'default' (Bật full tính năng để Bệ Hạ dùng thử)
UPDATE public.hotels 
SET features = '{
    "shift_management": true,
    "employee_debt": true,
    "advanced_reports": true,
    "saas_admin_access": true,
    "admin_command_center": true
}'::jsonb
WHERE slug = 'default';

-- 3. Đảm bảo các khách sạn mới tạo cũng có bộ features mặc định
-- (Hàm fn_onboard_new_hotel sẽ tự động kế thừa giá trị DEFAULT của cột)
