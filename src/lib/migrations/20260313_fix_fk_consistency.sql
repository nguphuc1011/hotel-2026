-- MIGRATION: FIX FOREIGN KEY CONSISTENCY FOR verified_by_staff_id
-- TRÍCH DẪN HIẾN PHÁP:
-- ĐIỀU 10 (Kỷ luật sinh tồn): Trích dẫn 2 Điều Hiến pháp trước khi hành động.
-- ĐIỀU 7 (Bảo tồn di sản): Đảm bảo sự nhất quán trong cấu trúc dữ liệu tài chính.

-- 1. Xóa constraint cũ của customer_transactions (trỏ tới auth.users)
ALTER TABLE public.customer_transactions DROP CONSTRAINT IF EXISTS customer_transactions_verified_by_staff_id_fkey;

-- 2. Thêm constraint mới trỏ tới bảng public.staff (để đồng bộ với bookings và cash_flow)
-- Điều này đảm bảo khi ID được truyền từ Frontend (thường lấy từ public.staff) sẽ không bị lỗi FK.
ALTER TABLE public.customer_transactions 
    ADD CONSTRAINT customer_transactions_verified_by_staff_id_fkey 
    FOREIGN KEY (verified_by_staff_id) 
    REFERENCES public.staff(id);

-- 3. Đảm bảo các bảng khác cũng nhất quán (đã check là trỏ tới staff rồi, nhưng cứ re-check/re-apply cho chắc)
-- bookings_verified_by_staff_id_fkey -> staff (OK)
-- cash_flow_verified_by_staff_id_fkey -> staff (OK)
