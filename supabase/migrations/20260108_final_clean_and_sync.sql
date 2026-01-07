-- 1. Xóa bỏ các hàm 'phân thân' để tránh nhầm lẫn (Vi phạm DRY)
DROP FUNCTION IF EXISTS public.process_checkout_v2;
DROP FUNCTION IF EXISTS public.resolve_checkout;
DROP FUNCTION IF EXISTS public.checkout_folio;

-- 2. Đại tu hàm calculate_booking_bill (Nguồn sự thật duy nhất)
CREATE OR REPLACE FUNCTION public.calculate_booking_bill(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_room_charge numeric := 0;
    v_service_charge numeric := 0;
    v_early_surcharge numeric := 0;
    v_late_surcharge numeric := 0;
    v_total_amount numeric := 0; -- Doanh thu đơn này
    v_customer_balance numeric := 0;
    v_total_final numeric := 0;  -- Tổng tiền cần thu (Hóa đơn + Nợ cũ)
    v_services_list jsonb;
    v_duration_text text;
BEGIN
    -- Lấy thông tin booking và nợ khách hàng
    SELECT b.*, c.balance as customer_balance, r.room_number
    INTO v_booking
    FROM bookings b
    JOIN rooms r ON b.room_id = r.id
    LEFT JOIN customers c ON b.customer_id = c.id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy đơn đặt phòng');
    END IF;

    -- 1. Tính tiền phòng (Giả sử đã có logic tính tiền phòng trong hệ thống)
    -- Ở đây thần lấy từ trường room_charge hoặc tính toán nếu cần
    v_room_charge := COALESCE(v_booking.room_charge, 0);
    
    -- 2. Tính tiền dịch vụ
    SELECT COALESCE(SUM(quantity * price), 0), 
           jsonb_agg(jsonb_build_object('name', name, 'quantity', quantity, 'price', price, 'total', quantity * price))
    INTO v_service_charge, v_services_list
    FROM (
        SELECT (value->>'name')::text as name, 
               (value->>'quantity')::numeric as quantity, 
               (value->>'price')::numeric as price
        FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb))
    ) s;

    -- 3. Tính phụ phí
    v_early_surcharge := COALESCE(v_booking.early_surcharge, 0);
    v_late_surcharge := COALESCE(v_booking.late_surcharge, 0);

    -- 4. Tổng doanh thu đơn này (Phòng + Dịch vụ + Phụ phí - Giảm giá)
    v_total_amount := v_room_charge + v_service_charge + v_early_surcharge + v_late_surcharge - COALESCE(v_booking.discount_amount, 0);

    -- 5. Tổng tiền thực tế cần thu (Doanh thu - Cọc + Nợ cũ)
    -- Chú ý: customer_balance âm là khách nợ, dương là khách dư tiền
    v_customer_balance := COALESCE(v_booking.customer_balance, 0);
    v_total_final := v_total_amount - COALESCE(v_booking.deposit_amount, 0) - v_customer_balance;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'room_number', v_booking.room_number,
        'check_in_at', v_booking.check_in_at,
        'room_charge', v_room_charge,
        'service_charge', v_service_charge,
        'early_surcharge', v_early_surcharge,
        'late_surcharge', v_late_surcharge,
        'discount_amount', COALESCE(v_booking.discount_amount, 0),
        'deposit', COALESCE(v_booking.deposit_amount, 0),
        'booking_revenue', v_total_amount,
        'customer_balance', v_customer_balance,
        'total_final', v_total_final,
        'services_list', COALESCE(v_services_list, '[]'::jsonb),
        'duration_text', 'Tính toán từ DB' -- Có thể thêm logic tính text ở đây
    );
END;
$$;

-- 3. Định nghĩa lại handle_checkout (Quy trình thanh toán duy nhất)
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_amount_paid numeric,
    p_payment_method text DEFAULT 'CASH',
    p_surcharge numeric DEFAULT 0,
    p_discount numeric DEFAULT 0,
    p_notes text DEFAULT '',
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bill jsonb;
    v_booking record;
    v_new_balance numeric;
BEGIN
    -- 1. Tính toán lại hóa đơn chuẩn từ hàm calculate_booking_bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    
    IF NOT (v_bill->>'success')::boolean THEN
        RETURN v_bill;
    END IF;

    -- 2. Cập nhật thông tin giảm giá/phụ phí bổ sung nếu có từ UI
    UPDATE bookings 
    SET discount_amount = COALESCE(discount_amount, 0) + p_discount,
        room_charge = COALESCE(room_charge, 0) + p_surcharge, -- Hoặc tạo trường surcharge riêng
        status = 'checked_out',
        check_out_at = now(),
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n' || p_notes
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;

    -- 3. Tính toán số dư mới của khách hàng
    -- nợ mới = (tổng tiền cần thu sau khi cập nhật) - số tiền thực trả
    -- Vì calculate_booking_bill đã bao gồm nợ cũ, nên balance mới sẽ là:
    -- balance_moi = total_final_moi - p_amount_paid
    -- Nhưng chúng ta lưu balance theo kiểu: nợ là số âm.
    -- Nên: v_new_balance = p_amount_paid - total_final_moi
    
    v_new_balance := p_amount_paid - (v_bill->>'total_final')::numeric - p_surcharge + p_discount;

    UPDATE customers 
    SET balance = v_new_balance
    WHERE id = v_booking.customer_id;

    -- 4. Ghi log sổ cái (Ledger) - Doanh thu thực tế là booking_revenue
    INSERT INTO ledger (booking_id, customer_id, staff_id, amount, type, payment_method_code, description)
    VALUES (p_booking_id, v_booking.customer_id, p_staff_id, p_amount_paid, 'INCOME', p_payment_method, 'Thanh toán trả phòng: ' || v_booking.room_id);

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Trả phòng thành công',
        'new_balance', v_new_balance
    );
END;
$$;

-- Cấp quyền thực thi
GRANT EXECUTE ON FUNCTION public.calculate_booking_bill(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.handle_checkout(uuid, numeric, text, numeric, numeric, text, uuid) TO authenticated, anon;
