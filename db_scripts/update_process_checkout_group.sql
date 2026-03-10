-- [GROUP CHECKOUT] Update process_checkout to handle group members
-- Date: 2026-02-28
-- Logic: When checking out a Master booking, automatically checkout all Child bookings.

CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid,
    p_payment_method text,
    p_amount_paid numeric,
    p_discount numeric,
    p_surcharge numeric,
    p_notes text,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_staff_id uuid;
    v_staff_name text;
    v_room_id uuid;
    v_room_name text;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
    v_child_record record; -- Added for group loop
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    
    -- Get Staff Name if not provided
    IF p_verified_by_staff_name IS NULL THEN
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    ELSE
        v_staff_name := p_verified_by_staff_name;
    END IF;

    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- Get Room Name for description
    SELECT room_number INTO v_room_name FROM public.rooms WHERE id = v_room_id;

    -- 1. Update Master Booking
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, ''),
        verified_by_staff_id = v_staff_id,
        verified_by_staff_name = v_staff_name
    WHERE id = p_booking_id;

    -- 2. [NEW] Process Group Members (Auto-checkout)
    FOR v_child_record IN 
        SELECT id, room_id 
        FROM public.bookings 
        WHERE parent_booking_id = p_booking_id 
          AND status NOT IN ('cancelled', 'completed', 'checked_out')
    LOOP
        -- Update Child Booking
        UPDATE public.bookings 
        SET 
            status = 'completed',
            check_out_actual = now(),
            payment_method = 'group_settlement',
            notes = COALESCE(notes, '') || E'\n[Group Checkout] Settled by Master Booking ' || COALESCE(v_room_name, 'Unknown'),
            verified_by_staff_id = v_staff_id,
            verified_by_staff_name = v_staff_name
        WHERE id = v_child_record.id;

        -- Update Child Room
        UPDATE public.rooms 
        SET status = 'dirty', updated_at = now() 
        WHERE id = v_child_record.room_id;
    END LOOP;

    -- 3. Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 4. Update Master Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 5. Cash Flow Logic
    IF p_amount_paid > 0 THEN
        -- Check if column customer_id exists in cash_flow (it should based on previous script)
        -- To be safe, we insert with explicit columns
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, created_by, verified_by_staff_id, 
            verified_by_staff_name, ref_id, is_auto, payment_method_code, occurred_at, customer_id
        ) VALUES (
            'IN', 'Tiền phòng', p_amount_paid, 
            'Thanh toán phòng ' || COALESCE(v_room_name, '') || ' (Checkout)', 
            auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, LOWER(p_payment_method), now(), v_customer_id
        );
    END IF;

    -- 6. Update Customer Balance (Sync Logic)
    -- Only if customer exists. Logic: Paid - (Total - Deposit)
    -- If Paid = Total - Deposit (Full payment), balance change = 0
    -- If Paid < Total - Deposit (Debt), balance change = Paid - Debt = Negative
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- 7. Audit Log
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');

    -- 8. Audit Trail on Booking
    UPDATE public.bookings 
    SET billing_audit_trail = v_bill->'explanation'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$;
