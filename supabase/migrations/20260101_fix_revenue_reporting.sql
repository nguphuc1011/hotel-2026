-- UPDATE 'process_checkout_transaction' RPC to handle revenue correctly
DROP FUNCTION IF EXISTS public.process_checkout_transaction(uuid, text, numeric, numeric);

CREATE OR REPLACE FUNCTION public.process_checkout_transaction(
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
    v_services_total NUMERIC := 0;
    v_room_charge NUMERIC := 0;
    v_service_item JSONB;
    v_room_number TEXT;
    v_category_id UUID;
    v_category_name TEXT := 'Tiền phòng (Room)';
    v_staff_name TEXT;
BEGIN
    -- 1. Lấy thông tin booking và phòng
    SELECT b.room_id, b.customer_id, b.status, r.room_number 
    INTO v_room_id, v_customer_id, v_current_status, v_room_number
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    WHERE b.id = p_booking_id;

    -- Lấy tên nhân viên thực hiện (nếu có)
    SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = auth.uid();
    IF v_staff_name IS NULL THEN
        v_staff_name := 'Hệ thống (Checkout)';
    END IF;

    IF v_current_status IS NULL THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy thông tin đặt phòng');
    END IF;

    -- Nếu đã completed rồi thì trả về success luôn
    IF v_current_status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Phòng này đã được thanh toán trước đó');
    END IF;

    -- 2. Tính toán room_charge_actual (Tổng - Dịch vụ - Phụ thu)
    -- Lấy tổng tiền dịch vụ từ bookings.services_used
    SELECT COALESCE(SUM((s->>'total')::numeric), 0) INTO v_services_total
    FROM public.bookings, jsonb_array_elements(services_used) s
    WHERE id = p_booking_id;

    v_room_charge := p_total_amount - v_services_total - p_surcharge;

    -- 3. Cập nhật trạng thái Booking
    UPDATE public.bookings
    SET 
        status = 'completed',
        check_out_at = NOW(),
        surcharge = p_surcharge,
        total_amount = p_total_amount,
        final_amount = p_total_amount,
        room_charge_actual = v_room_charge,
        payment_method = p_payment_method
    WHERE id = p_booking_id;

    -- 4. Tạo Hóa đơn (Invoice)
    INSERT INTO public.invoices (booking_id, customer_id, room_id, total_amount, payment_method)
    VALUES (p_booking_id, v_customer_id, v_room_id, p_total_amount, p_payment_method);

    -- 5. Cập nhật trạng thái Phòng sang 'dirty'
    UPDATE public.rooms
    SET status = 'dirty', current_booking_id = NULL, last_status_change = NOW()
    WHERE id = v_room_id;

    -- 7. Cập nhật thống kê khách hàng
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET 
            total_spent = COALESCE(total_spent, 0) + p_total_amount,
            visit_count = COALESCE(visit_count, 0) + 1,
            last_visit = NOW()
        WHERE id = v_customer_id;
    END IF;

    -- 8. Ghi nhận vào bảng cashflow (Dòng tiền)
    -- Tìm category_id cho "Tiền phòng"
    SELECT id INTO v_category_id 
    FROM public.cashflow_categories 
    WHERE name = v_category_name AND type = 'income' 
    LIMIT 1;

    -- Nếu không tìm thấy thì lấy category đầu tiên có type = 'income'
    IF v_category_id IS NULL THEN
        SELECT id INTO v_category_id 
        FROM public.cashflow_categories 
        WHERE type = 'income' 
        LIMIT 1;
    END IF;

    -- Thực hiện ghi nhận dòng tiền
    IF v_category_id IS NOT NULL THEN
        INSERT INTO public.cashflow (
            type,
            category,
            category_id,
            category_name,
            content,
            amount,
            payment_method,
            created_by,
            created_by_id,
            created_at
        ) VALUES (
            'income',
            v_category_name,
            v_category_id,
            v_category_name,
            'Thanh toán tiền phòng ' || v_room_number,
            p_total_amount,
            p_payment_method,
            v_staff_name,
            auth.uid(),
            NOW()
        );
    END IF;

    -- 9. Tự động trừ kho và ghi lịch sử (Stock Deduction)
    FOR v_service_item IN SELECT * FROM jsonb_array_elements(
        (SELECT services_used FROM public.bookings WHERE id = p_booking_id)
    )
    LOOP
        -- Trừ kho trong bảng services
        UPDATE public.services
        SET stock = COALESCE(stock, 0) - (v_service_item->>'quantity')::numeric
        WHERE id = (v_service_item->>'id')::uuid;

        -- Ghi vết vào bảng stock_history
        INSERT INTO public.stock_history (
            service_id,
            action_type,
            quantity,
            details
        ) VALUES (
            (v_service_item->>'id')::uuid,
            'EXPORT',
            (v_service_item->>'quantity')::numeric,
            jsonb_build_object(
                'reason', 'Xuất kho bán cho phòng ' || v_room_number,
                'booking_id', p_booking_id,
                'room_number', v_room_number,
                'service_name', v_service_item->>'name',
                'action', 'Checkout'
            )
        );
    END LOOP;

    RETURN jsonb_build_object('success', true, 'message', 'Thanh toán, ghi nhận doanh thu và trừ kho thành công');

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$$;

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload config';
