-- FIX: process_checkout with Customer Transaction Logging
-- Updates customer balance in two steps (Charge & Payment) to generate clear history.

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
    v_payable numeric;
    v_old_balance numeric;
    v_new_balance numeric;
    v_pm_code text;
    v_audit_trail jsonb;
BEGIN
    -- Identify Staff
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    -- Try to get staff name if not provided
    IF p_verified_by_staff_name IS NULL THEN
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    ELSE
        v_staff_name := p_verified_by_staff_name;
    END IF;
    
    v_pm_code := lower(COALESCE(p_payment_method, 'cash'));

    -- Get Booking Info
    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- Get Room Name
    SELECT room_number INTO v_room_name FROM public.rooms WHERE id = v_room_id;

    -- 1. Update Booking
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

    -- 2. Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := COALESCE((v_bill->>'total_amount')::numeric, 0);
    v_deposit := COALESCE((v_bill->>'deposit_amount')::numeric, 0);
    v_payable := v_total_amount - v_deposit;
    v_audit_trail := v_bill->'explanation';

    -- 3. Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 4. CASH FLOW (Actual Payment)
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, created_by, verified_by_staff_id, 
            verified_by_staff_name, ref_id, is_auto, payment_method_code, occurred_at
        ) VALUES (
            'IN', 'Tiền phòng', p_amount_paid, 
            'Thanh toán phòng ' || COALESCE(v_room_name, '') || ' (Checkout)', 
            auth.uid(), v_staff_id, v_staff_name, p_booking_id, true, v_pm_code, now()
        );
    END IF;

    -- 5. DEPOSIT TRANSFER (Record for Cash Flow Stats if needed)
    -- Optional: Record deposit usage as "Revenue Realized" but without Cash Movement?
    -- Currently skipping to avoid double counting if Cash Flow is strictly Cash.

    -- 6. CUSTOMER BALANCE & TRANSACTION LOGGING
    IF v_customer_id IS NOT NULL THEN
        -- Lock Customer Row
        SELECT balance INTO v_old_balance FROM public.customers WHERE id = v_customer_id FOR UPDATE;
        v_old_balance := COALESCE(v_old_balance, 0);
        v_new_balance := v_old_balance;

        -- Step A: CHARGE (Apply Bill Amount)
        IF v_payable > 0 THEN
            v_new_balance := v_new_balance - v_payable;
            
            INSERT INTO customer_transactions (
                customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by, verified_by_staff_id, verified_by_staff_name
            ) VALUES (
                v_customer_id, 'charge', v_payable, v_old_balance, v_new_balance, 
                'Phí phòng ' || COALESCE(v_room_name, '') || ' (Tổng: ' || v_total_amount || ', Cọc: ' || v_deposit || ')', 
                p_booking_id, v_staff_id, v_staff_id, v_staff_name
            );
            v_old_balance := v_new_balance; -- Update reference
        ELSIF v_payable < 0 THEN
            -- Negative Payable means Deposit > Total. Excess Deposit returned to Wallet.
            v_new_balance := v_new_balance + ABS(v_payable);
            
            INSERT INTO customer_transactions (
                customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by, verified_by_staff_id, verified_by_staff_name
            ) VALUES (
                v_customer_id, 'adjustment', ABS(v_payable), v_old_balance, v_new_balance, 
                'Hoàn cọc thừa phòng ' || COALESCE(v_room_name, ''), 
                p_booking_id, v_staff_id, v_staff_id, v_staff_name
            );
            v_old_balance := v_new_balance;
        END IF;

        -- Step B: PAYMENT (Apply Amount Paid)
        IF p_amount_paid > 0 THEN
            v_new_balance := v_new_balance + p_amount_paid;
            
            INSERT INTO customer_transactions (
                customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by, verified_by_staff_id, verified_by_staff_name
            ) VALUES (
                v_customer_id, 'payment', p_amount_paid, v_old_balance, v_new_balance, 
                'Thanh toán checkout phòng ' || COALESCE(v_room_name, ''), 
                p_booking_id, v_staff_id, v_staff_id, v_staff_name
            );
        END IF;

        -- Final Update
        UPDATE public.customers 
        SET balance = v_new_balance, updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- 7. Audit Log
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_audit_trail);

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Check-out thành công', 
        'bill', v_bill
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;
