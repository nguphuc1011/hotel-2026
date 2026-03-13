-- MIGRATION: UPDATE customer_transactions_type_check CONSTRAINT
-- TRÍCH DẪN HIẾN PHÁP:
-- ĐIỀU 10 (Kỷ luật sinh tồn): Trích dẫn 2 Điều Hiến pháp trước khi hành động.
-- ĐIỀU 7 (Bảo tồn di sản): Thay đổi logic lõi phải được phê duyệt. Ở đây ta bổ sung để hỗ trợ tính năng nạp cọc và checkout.

-- 1. Xóa constraint cũ
ALTER TABLE public.customer_transactions DROP CONSTRAINT IF EXISTS customer_transactions_type_check;

-- 2. Thêm constraint mới với các giá trị mở rộng
ALTER TABLE public.customer_transactions ADD CONSTRAINT customer_transactions_type_check 
    CHECK (type = ANY (ARRAY['payment'::text, 'charge'::text, 'adjustment'::text, 'refund'::text, 'deposit'::text, 'checkout'::text]));
