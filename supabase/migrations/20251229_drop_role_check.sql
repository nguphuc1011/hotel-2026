-- HÀNH ĐỘNG: Gỡ bỏ ràng buộc cũ để chấp nhận các Role mới (Fix 400 Bad Request)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- TÙY CHỌN: Thêm lại ràng buộc mới nếu cần (nhưng linh hoạt hơn)
-- ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'manager', 'staff', 'receptionist', 'housekeeping'));
