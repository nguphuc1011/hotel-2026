-- Cập nhật handle_checkout V2.1: Bổ sung p_discount để quản lý giảm giá chuyên nghiệp hơn
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_amount_paid numeric, -- Số tiền thực trả lần này
    p_payment_method text DEFAULT 'CASH',
    p_surcharge numeric DEFAULT 0, -- Phụ phí thủ công lúc checkout
    p_discount numeric DEFAULT 0,  -- Giảm giá thủ công lúc checkout
    p_notes text DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL,
    p_total_amount numeric DEFAULT NULL, -- Tham số cũ (để tương thích)
    p_debt_carry_amount numeric DEFAULT 0 -- Tham số cũ (để tương thích)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_booking_revenue numeric;
    v_room_id uuid;
    v_customer_id uuid;
    v_result jsonb;
BEGIN
    -- 1. Cập nhật Discount/Surcharge vào Booking TRƯỚC khi tính hóa đơn
    UPDATE public.bookings
    SET discount_amount = COALESCE(discount_amount, 0) + p_discount,
        custom_surcharge = COALESCE(custom_surcharge, 0) + p_surcharge
    WHERE id = p_booking_id;

    -- 2. Lấy hóa đơn từ Database (Bây giờ đã bao gồm discount/surcharge mới)
    v_bill := public.calculate_booking_bill_v2(p_booking_id);
    IF NOT (v_bill->>'success')::boolean THEN
        RETURN v_bill;
    END IF;

    -- 3. Lấy thông tin booking
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    v_room_id := v_booking.room_id;
    v_customer_id := v_booking.customer_id;
    v_booking_revenue := (v_bill->>'booking_revenue')::numeric;

    -- 4. Chốt trạng thái Booking
    UPDATE public.bookings
    SET status = 'completed',
        check_out_at = now(),
        total_amount = v_booking_revenue,
        notes = COALESCE(notes, '') || E'\n' || COALESCE(p_notes, ''),
        payment_method = p_payment_method
    WHERE id = p_booking_id;

    -- 5. Cập nhật trạng thái Phòng
    UPDATE public.rooms
    SET status = 'available',
        current_booking_id = NULL,
        last_status_change = now()
    WHERE id = v_room_id;

    -- 6. Ghi Ledger (Doanh thu & Thanh toán)
    -- Tiền phòng
    INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
    VALUES (p_booking_id, v_customer_id, 'REVENUE', 'ROOM', (v_bill->>'room_charge')::numeric, 'Doanh thu tiền phòng', p_staff_id, p_payment_method);

    -- Tiền dịch vụ
    IF (v_bill->>'service_charge')::numeric > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'REVENUE', 'SERVICE', (v_bill->>'service_charge')::numeric, 'Doanh thu dịch vụ', p_staff_id, p_payment_method);
    END IF;

    -- Phụ phí (Đã bao gồm p_surcharge vừa cập nhật)
    IF (v_bill->>'surcharge')::numeric > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'REVENUE', 'SURCHARGE', (v_bill->>'surcharge')::numeric, 'Doanh thu phụ phí', p_staff_id, p_payment_method);
    END IF;

    -- Thuế
    DECLARE
        v_tax_total numeric := (v_bill->'tax_details'->>'room_tax')::numeric + (v_bill->'tax_details'->>'service_tax')::numeric;
    BEGIN
        IF v_tax_total > 0 THEN
            INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
            VALUES (p_booking_id, v_customer_id, 'REVENUE', 'TAX', v_tax_total, 'Thuế GTGT', p_staff_id, p_payment_method);
        END IF;
    END;

    -- Ghi nhận số tiền thực thu lần này
    IF p_amount_paid > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'PAYMENT', 'ROOM', p_amount_paid, 'Khách thanh toán checkout', p_staff_id, p_payment_method);
    END IF;

    -- 7. Cập nhật Balance Khách hàng
    -- Balance mới = Balance cũ - Doanh thu mới + Thanh toán mới
    -- Lưu ý: v_booking_revenue đã TRỪ discount trong calculate_booking_bill_v2
    UPDATE public.customers
    SET balance = COALESCE(balance, 0) - v_booking_revenue + p_amount_paid,
        total_spent = COALESCE(total_spent, 0) + v_booking_revenue,
        last_visit = now()
    WHERE id = v_customer_id;

    -- 8. Tạo Invoice
    INSERT INTO public.invoices (booking_id, customer_id, room_id, total_amount, payment_method, created_at)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_booking_revenue, p_payment_method, now());

    -- 9. Trả về kết quả
    v_result := jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'total_to_pay', (v_bill->>'total_amount')::numeric, -- Số tiền khách cần trả (đã trừ cọc, cộng nợ)
        'booking_revenue', v_booking_revenue,
        'bill_details', v_bill
    );

    RETURN v_result;
END;
$$;
