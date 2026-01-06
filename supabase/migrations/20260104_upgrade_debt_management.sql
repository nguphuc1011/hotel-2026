-- MIGRATION: FIX LỖI VÀ NÂNG CẤP QUẢN LÝ CÔNG NỢ (PARTIAL PAYMENT)
-- Ngày tạo: 2026-01-04
-- Đã sửa lại column name cho đúng với schema thực tế (last_visit, method)

-- 1. Sửa lỗi cấu trúc bảng (Fix missing column)
ALTER TABLE public.financial_transactions 
ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

-- 2. Sửa lỗi dữ liệu rác gây lỗi UUID (Fix invalid UUID 'old_debt')
UPDATE public.bookings
SET services_used = (
  SELECT jsonb_agg(elem)
  FROM jsonb_array_elements(services_used) elem
  WHERE elem->>'id' != 'old_debt'
)
WHERE services_used @> '[{"id": "old_debt"}]';

-- 3. Tạo VIEW quản lý danh sách khách nợ (Để hiển thị ở trang Quản lý công nợ)
-- Sửa: last_stay_date -> last_visit
CREATE OR REPLACE VIEW public.debtor_overview AS
SELECT 
    id,
    full_name,
    phone,
    balance, -- Số dư (Âm là đang nợ)
    last_visit as last_stay_date, -- Alias để FE không bị lỗi nếu đang dùng tên này
    total_spent,
    created_at
FROM public.customers
WHERE balance < 0
ORDER BY balance ASC; -- Nợ nhiều nhất lên đầu

-- 4. Nâng cấp hàm handle_checkout để hỗ trợ THANH TOÁN 1 PHẦN (Partial Payment)
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_notes text DEFAULT NULL,
    p_payment_method text DEFAULT 'cash',
    p_surcharge numeric DEFAULT 0,
    p_total_amount numeric DEFAULT NULL, -- Tổng bill phải trả
    p_amount_paid numeric DEFAULT NULL   -- Số tiền khách thực trả (Nếu NULL thì coi như trả đủ)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking record;
    v_customer_id uuid;
    v_total_bill numeric;
    v_actual_paid numeric;
    v_debt_amount numeric; -- Số tiền nợ thêm (hoặc trả dư)
    v_transaction_id uuid;
    v_new_balance numeric;
    v_result jsonb;
BEGIN
    -- Lấy thông tin booking
    SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
    END IF;

    v_customer_id := v_booking.customer_id;

    -- 1. Xác định các con số tài chính
    -- Tổng bill: Ưu tiên giá trị truyền vào, nếu không có thì lấy từ booking
    v_total_bill := COALESCE(p_total_amount, v_booking.total_price);
    
    -- Thực trả: Nếu p_amount_paid là NULL -> Khách trả đủ (v_total_bill). 
    -- Nếu có truyền vào -> Lấy giá trị đó.
    v_actual_paid := COALESCE(p_amount_paid, v_total_bill);

    -- Tính phần chênh lệch (Dương: Trả dư/Tip, Âm: Nợ, 0: Đủ)
    -- Ví dụ: Bill 1tr, Trả 800k -> Chênh lệch = 800k - 1tr = -200k (Nợ thêm vào balance)
    v_debt_amount := v_actual_paid - v_total_bill;

    -- 2. Tạo Transaction (Chỉ ghi nhận số tiền THỰC TẾ thu được - Cash Flow)
    -- Sửa: payment_method -> method, bỏ status (không có cột status)
    INSERT INTO transactions (
        booking_id,
        customer_id,
        amount,
        type,
        method,
        notes
    ) VALUES (
        p_booking_id,
        v_customer_id,
        v_actual_paid, -- Ghi nhận dòng tiền thực tế
        'payment',
        p_payment_method,
        COALESCE(p_notes, 'Thanh toán check-out' || CASE WHEN v_debt_amount < 0 THEN ' (Có nợ)' ELSE '' END)
    ) RETURNING id INTO v_transaction_id;

    -- 3. Cập nhật Booking
    UPDATE bookings 
    SET status = 'checked_out',
        payment_status = CASE 
            WHEN v_debt_amount >= 0 THEN 'paid' -- Trả đủ hoặc dư
            ELSE 'partial' -- Trả thiếu (nợ)
        END,
        checkout_time = NOW(),
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- 4. Cập nhật Balance Khách hàng (QUAN TRỌNG NHẤT)
    -- Sửa: last_stay_date -> last_visit
    UPDATE customers
    SET balance = COALESCE(balance, 0) + v_debt_amount,
        total_spent = COALESCE(total_spent, 0) + v_actual_paid, -- Chỉ cộng doanh thu thực thu vào tổng chi tiêu
        last_visit = NOW()
    WHERE id = v_customer_id
    RETURNING balance INTO v_new_balance;

    v_result := jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'new_balance', v_new_balance,
        'debt_incurred', v_debt_amount -- Trả về số nợ phát sinh trong giao dịch này
    );

    RETURN v_result;
END;
$$;
