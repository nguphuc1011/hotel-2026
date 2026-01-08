-- Migration: Tuyệt đoạn hậu - Xóa sổ bóng ma V1
-- Description: Xóa bỏ hoàn toàn hàm calculate_booking_bill cũ để đảm bảo chỉ còn v2 (logic V3)

-- 1. Xóa hàm calculate_booking_bill cũ
DROP FUNCTION IF EXISTS public.calculate_booking_bill(uuid);

-- 2. Đảm bảo quyền thực thi cho hàm v2 mới nhất
GRANT EXECUTE ON FUNCTION public.calculate_booking_bill_v2(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.calculate_booking_bill_v2(p_booking_id uuid) TO authenticated, anon;

-- Ghi chú: Từ nay về sau, toàn bộ hệ thống chỉ được phép gọi calculate_booking_bill_v2.
