-- MIGRATION: FIX DEBT CARRY ID IN CHECKOUT
-- Date: 2026-01-05
-- Mục tiêu: Cập nhật handle_checkout để nhận diện đúng service ID 'debt-carry' và xử lý logic đẩy nợ ngược

CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_notes text DEFAULT NULL,
    p_payment_method text DEFAULT 'cash',
    p_surcharge numeric DEFAULT 0,
    p_total_amount numeric DEFAULT NULL,
    p_amount_paid numeric DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL,
    p_debt_carry_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_room_id uuid;
    v_total_amount numeric;
    v_final_total_amount numeric;
    v_amount_paid numeric;
    v_underpayment numeric;
    v_room_charge numeric;
    v_service_charge numeric;
    v_already_charged numeric;
    v_old_debt_included numeric;
    v_new_charges numeric;
    v_new_balance numeric;
    v_debt_amount numeric;
    v_result jsonb;
    v_staff_id uuid;
BEGIN
    -- 1. Get Booking Info
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Booking not found');
    END IF;

    -- Get Staff ID (from param or auth context)
    v_staff_id := COALESCE(p_staff_id, auth.uid());

    -- 2. Validate & Finalize Total Amount
    v_total_amount := COALESCE(p_total_amount, v_booking.total_amount, 0);
    v_final_total_amount := v_total_amount; 

    -- Sanity check: If passed amount differs significantly from calculated, trust the passed one (from FE)
    -- but ensure we don't accidentally zero it out if FE sends null
    IF p_total_amount IS NOT NULL THEN
        v_final_total_amount := p_total_amount;
    END IF;

    -- 3. Determine Amount Paid & Debt Display
    v_amount_paid := COALESCE(p_amount_paid, v_final_total_amount);
    v_underpayment := GREATEST(v_final_total_amount - v_amount_paid, 0);

    -- 4. Calculate components
    v_room_charge := COALESCE(v_booking.initial_price, 0);
    v_service_charge := v_final_total_amount - v_room_charge - COALESCE(p_surcharge, 0);

    -- 5. Update Booking
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

    -- 6. Update Room Status
    UPDATE public.rooms
    SET 
        status = 'dirty',
        current_booking_id = NULL,
        last_status_change = now()
    WHERE id = v_booking.room_id;

    -- 7. Create Invoice
    INSERT INTO public.invoices (
        booking_id, customer_id, room_id, total_amount, payment_method, created_at
    )
    VALUES (
        p_booking_id, v_booking.customer_id, v_booking.room_id, v_final_total_amount, p_payment_method, now()
    );

    -- 8. Update Customer Metrics & Balance (Robust Reconciliation)
    IF v_booking.customer_id IS NOT NULL THEN
        -- A. Check what was already charged to balance (e.g. by Night Audit - future feature)
        -- Since 'transactions' table is being dropped and Night Audit is not yet active, assume 0.
        v_already_charged := 0;

        -- B. Check for Old Debt included in this bill (to avoid double charging)
        -- ADDED 'debt-carry' to the check list
        SELECT COALESCE(SUM((item->>'total')::numeric), 0)
        INTO v_old_debt_included
        FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) item
        WHERE item->>'id' = '11111111-1111-1111-1111-111111111111' 
           OR item->>'id' = 'old_debt'
           OR item->>'id' = 'debt-carry';

        -- Use passed parameter if services array check fails (fallback)
        IF v_old_debt_included = 0 AND p_debt_carry_amount > 0 THEN
            v_old_debt_included := p_debt_carry_amount;
        END IF;

        -- C. Calculate New Charges to apply now
        -- Total Bill - Already Charged - Old Debt (which is already in balance)
        v_new_charges := v_final_total_amount - v_already_charged - v_old_debt_included;

        -- D. Update Balance
        -- New Balance = Old Balance + Payment - New Charges
        UPDATE public.customers
        SET 
            total_spent = COALESCE(total_spent, 0) + v_final_total_amount,
            visit_count = COALESCE(visit_count, 0) + 1,
            last_visit = NOW(),
            balance = COALESCE(balance, 0) + v_amount_paid - v_new_charges
        WHERE id = v_booking.customer_id
        RETURNING balance INTO v_new_balance;

        -- E. Log Payment Transaction
        IF v_amount_paid > 0 THEN
            INSERT INTO public.ledger(customer_id, booking_id, amount, type, category, description, payment_method_code, staff_id)
            VALUES (v_booking.customer_id, p_booking_id, v_amount_paid, 'PAYMENT', 'ROOM_BILL', 'Thanh toán trả phòng ' || p_booking_id, p_payment_method, v_staff_id);
        END IF;
        
        -- F. Log Revenue (Revenue is the New Charges)
        IF v_new_charges > 0 THEN
             INSERT INTO public.ledger(customer_id, booking_id, amount, type, category, description, staff_id)
             VALUES (v_booking.customer_id, p_booking_id, v_new_charges, 'REVENUE', 'ROOM', 'Doanh thu phòng ' || p_booking_id, v_staff_id);
        END IF;

    END IF;

    -- 9. Return Result
    v_result := jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'total_amount', v_final_total_amount,
        'amount_paid', v_amount_paid,
        'new_balance', v_new_balance
    );

    RETURN v_result;
END;
$$;
