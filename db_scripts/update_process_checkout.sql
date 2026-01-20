CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid, 
    p_payment_method text, 
    p_amount_paid numeric, 
    p_discount numeric, 
    p_surcharge numeric, 
    p_notes text, 
    p_staff_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_staff_id uuid;
    v_room_id uuid;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
    v_room_name text;
    v_customer_name text;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());
    
    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- 1. Update Booking
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, '')
    WHERE id = p_booking_id;

    -- 2. Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;
    v_room_name := v_bill->>'room_name';
    v_customer_name := v_bill->>'customer_name';

    -- 3. Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 4. Record Ledger Entries (Old System - Keep for backward compatibility)
    BEGIN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'REVENUE', 'ROOM', (v_bill->>'room_charge')::numeric, 'Tiền phòng', v_staff_id, p_payment_method);
        
        IF p_amount_paid > 0 THEN
            INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
            VALUES (p_booking_id, v_customer_id, 'PAYMENT', 'ROOM', p_amount_paid, 'Khách thanh toán checkout', v_staff_id, p_payment_method);
        END IF;
    EXCEPTION WHEN OTHERS THEN 
        -- Ignore ledger errors
    END;

    -- 5. INSERT INTO CASH FLOW (New System)
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, 
            category, 
            amount, 
            description, 
            occurred_at, 
            created_by, 
            ref_id, 
            is_auto
        )
        VALUES (
            'IN', 
            'Tiền phòng', 
            p_amount_paid, 
            'Thanh toán phòng ' || COALESCE(v_room_name, '???') || ' - ' || COALESCE(v_customer_name, 'Khách lẻ'), 
            now(), 
            v_staff_id, 
            p_booking_id, 
            true
        );
    END IF;

    -- 6. Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- 7. Record Audit Log
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');

    -- 8. Audit Trail in Booking
    UPDATE public.bookings 
    SET billing_audit_trail = v_bill->'explanation'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$;
