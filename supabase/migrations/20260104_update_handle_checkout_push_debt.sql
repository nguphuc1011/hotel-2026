CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_notes text DEFAULT NULL,
    p_payment_method text DEFAULT 'cash',
    p_surcharge numeric DEFAULT 0,
    p_total_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking record;
    v_room record;
    v_checkout_details json;
    v_final_total_amount numeric;
    v_due_amount numeric;
    v_underpayment numeric;
    v_room_charge numeric;
    v_service_charge numeric;
    v_staff_name text;
    v_service_item jsonb;
BEGIN
    SELECT b.*, r.room_number INTO v_booking 
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    WHERE b.id = p_booking_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy thông tin đặt phòng');
    END IF;
    IF v_booking.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Phòng này đã được thanh toán trước đó');
    END IF;
    IF p_total_amount IS NOT NULL THEN
        v_final_total_amount := p_total_amount;
    ELSE
        BEGIN
            v_checkout_details := get_checkout_details(p_booking_id);
            v_final_total_amount := (v_checkout_details->>'total_amount')::numeric;
        EXCEPTION WHEN OTHERS THEN
            v_final_total_amount := 0;
        END;
    END IF;
    BEGIN
        v_checkout_details := get_checkout_details(p_booking_id);
        v_due_amount := (v_checkout_details->>'total_amount')::numeric;
    EXCEPTION WHEN OTHERS THEN
        v_due_amount := v_final_total_amount;
    END;
    v_underpayment := GREATEST(v_due_amount - v_final_total_amount, 0);
    v_room_charge := COALESCE((v_checkout_details->>'room_charge')::numeric, v_final_total_amount);
    v_service_charge := v_final_total_amount - v_room_charge - COALESCE(p_surcharge, 0);
    UPDATE public.bookings
    SET 
        status = 'completed',
        check_out_at = now(),
        total_amount = v_final_total_amount,
        final_amount = v_final_total_amount,
        surcharge = COALESCE(p_surcharge, 0),
        room_charge_actual = v_room_charge,
        service_charge_actual = v_service_charge,
        payment_method = p_payment_method,
        notes = COALESCE(p_notes, notes)
    WHERE id = p_booking_id;
    UPDATE public.rooms
    SET 
        status = 'dirty',
        current_booking_id = NULL,
        last_status_change = now()
    WHERE id = v_booking.room_id;
    INSERT INTO public.invoices (
        booking_id, 
        customer_id, 
        room_id, 
        total_amount, 
        payment_method, 
        created_at
    )
    VALUES (
        p_booking_id,
        v_booking.customer_id,
        v_booking.room_id,
        v_final_total_amount,
        p_payment_method,
        now()
    );
    IF v_booking.customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET 
            total_spent = COALESCE(total_spent, 0) + v_final_total_amount,
            visit_count = COALESCE(visit_count, 0) + 1,
            last_visit = NOW()
        WHERE id = v_booking.customer_id;
        IF v_underpayment > 0 THEN
            UPDATE public.customers
            SET balance = COALESCE(balance, 0) - v_underpayment
            WHERE id = v_booking.customer_id;
            INSERT INTO public.transactions(customer_id, booking_id, type, amount, notes, created_at, meta)
            VALUES (v_booking.customer_id, p_booking_id, 'service_charge', v_underpayment, 'underpayment_transfer', now(), jsonb_build_object('source', 'checkout', 'booking_id', p_booking_id));
        END IF;
    END IF;
    SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = auth.uid();
    IF v_staff_name IS NULL THEN
        v_staff_name := 'Hệ thống (Checkout)';
    END IF;
    FOR v_service_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb))
    LOOP
        IF (v_service_item->>'id') IS NOT NULL AND (v_service_item->>'quantity') IS NOT NULL THEN
            UPDATE public.services
            SET stock = COALESCE(stock, 0) - (v_service_item->>'quantity')::numeric
            WHERE id = (v_service_item->>'id')::uuid;
            INSERT INTO public.stock_history (service_id, action_type, quantity, details)
            VALUES (
                (v_service_item->>'id')::uuid,
                'EXPORT',
                (v_service_item->>'quantity')::numeric,
                jsonb_build_object('reason', 'Bán cho phòng ' || v_booking.room_number, 'booking_id', p_booking_id, 'action', 'Checkout')
            );
        END IF;
    END LOOP;
    RETURN jsonb_build_object('success', true, 'message', 'Thanh toán hoàn tất', 'total_amount', v_final_total_amount, 'underpayment', v_underpayment);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.handle_checkout TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_checkout TO anon;
GRANT EXECUTE ON FUNCTION public.handle_checkout TO service_role;
NOTIFY pgrst, 'reload config';
