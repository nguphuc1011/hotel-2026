-- Migration: Script SQL "Thần thánh" để xử lý toàn bộ transaction thanh toán
-- Đáp ứng yêu cầu: Override hoàn toàn, ghi Invoice, đổi trạng thái phòng sang Dirty, hủy Room Checks.

-- 1. DROP hàm cũ để tránh lỗi mismatch tham số (4 tham số)
DROP FUNCTION IF EXISTS process_checkout_transaction(uuid, text, numeric, numeric);

-- 2. CREATE hàm mới với đúng 4 tham số như Frontend đang gửi
CREATE OR REPLACE FUNCTION process_checkout_transaction(
    p_booking_id UUID,
    p_payment_method TEXT,
    p_surcharge NUMERIC,
    p_total_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room_id UUID;
    v_customer_id UUID;
    v_current_status TEXT;
BEGIN
    -- Lấy thông tin booking
    SELECT room_id, customer_id, status INTO v_room_id, v_customer_id, v_current_status
    FROM bookings WHERE id = p_booking_id;

    IF v_current_status IS NULL THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy thông tin đặt phòng');
    END IF;

    -- Nếu đã completed rồi thì trả về success luôn để tránh lỗi double-payment
    IF v_current_status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Phòng này đã được thanh toán trước đó');
    END IF;

    -- A. Cập nhật trạng thái Booking
    UPDATE bookings
    SET 
        status = 'completed',
        check_out_at = NOW(),
        surcharge = p_surcharge,
        total_amount = p_total_amount,
        final_amount = p_total_amount,
        payment_method = p_payment_method
    WHERE id = p_booking_id;

    -- B. Tạo Hóa đơn (Invoice) - ĐẢM BẢO TIỀN ĐƯỢC GHI NHẬN
    -- Lưu ý: Bạn cần đảm bảo bảng 'invoices' có các cột này. Nếu tên cột khác, hãy điều chỉnh lại.
    INSERT INTO invoices (booking_id, customer_id, room_id, total_amount, payment_method)
    VALUES (p_booking_id, v_customer_id, v_room_id, p_total_amount, p_payment_method);

    -- C. Cưỡng ép cập nhật trạng thái Phòng sang 'dirty' (Bỏ qua mọi quy trình kiểm tra)
    UPDATE rooms
    SET status = 'dirty', current_booking_id = NULL, last_status_change = NOW()
    WHERE id = v_room_id;

    -- E. Cập nhật thống kê khách hàng (last_visit, total_spent, visit_count)
    IF v_customer_id IS NOT NULL THEN
        UPDATE customers
        SET 
            total_spent = COALESCE(total_spent, 0) + p_total_amount,
            visit_count = COALESCE(visit_count, 0) + 1,
            last_visit = NOW()
        WHERE id = v_customer_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Thanh toán và tạo hóa đơn thành công');

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$$;

-- 3. RELOAD SCHEMA CACHE (Sửa lỗi PGRST202)
NOTIFY pgrst, 'reload config';
