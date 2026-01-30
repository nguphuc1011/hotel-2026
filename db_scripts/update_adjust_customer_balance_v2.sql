-- FIX: adjust_customer_balance to support Booking Deposit
-- p_type = 'deposit' -> Updates bookings.deposit_amount, NOT customers.balance.
-- p_type = 'payment' -> Updates customers.balance.

DROP FUNCTION IF EXISTS public.adjust_customer_balance(uuid, numeric, text, text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.adjust_customer_balance(uuid, numeric, text, text, uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.adjust_customer_balance(
    p_customer_id uuid, 
    p_amount numeric, 
    p_type text, 
    p_description text, 
    p_booking_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text,
    p_payment_method text DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_old_balance numeric;
    v_new_balance numeric;
    v_cust_exists boolean;
    v_flow_type text;
    v_category text;
    v_staff_id uuid;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());

    SELECT true, balance INTO v_cust_exists, v_old_balance
    FROM customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF v_cust_exists IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Customer not found');
    END IF;

    v_old_balance := COALESCE(v_old_balance, 0);

    -- LOGIC BRANCHING
    IF p_type = 'deposit' AND p_booking_id IS NOT NULL THEN
        -- Case 1: Booking Deposit (Thanh toán trước cho Booking)
        -- Update Booking Deposit Amount
        UPDATE bookings 
        SET deposit_amount = COALESCE(deposit_amount, 0) + p_amount,
            updated_at = now()
        WHERE id = p_booking_id;
        
        -- Balance doesn't change
        v_new_balance := v_old_balance;
        
        -- Create Transaction Record (Log only)
        INSERT INTO customer_transactions (
            customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by
        ) VALUES (
            p_customer_id, p_type, p_amount, v_old_balance, v_new_balance, 
            p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
            p_booking_id,
            v_staff_id
        );
        
        -- Cash Flow for Deposit
        IF p_amount > 0 THEN
            INSERT INTO public.cash_flow (
                flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_name, payment_method
            ) VALUES (
                'IN', 'Tiền cọc', ABS(p_amount),
                p_description || ' [Booking Deposit]',
                now(), v_staff_id, p_verified_by_staff_name, LOWER(p_payment_method)
            );
        END IF;

    ELSE
        -- Case 2: Wallet Payment/Refund (Nạp/Rút ví)
        v_new_balance := v_old_balance + p_amount;

        -- Update Customer Balance
        UPDATE customers
        SET balance = v_new_balance,
            updated_at = now()
        WHERE id = p_customer_id;

        -- Create Transaction Record
        INSERT INTO customer_transactions (
            customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by
        ) VALUES (
            p_customer_id, p_type, p_amount, v_old_balance, v_new_balance, 
            p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
            p_booking_id,
            v_staff_id
        );

        -- Create Cash Flow Record
        IF p_amount <> 0 AND (p_type = 'payment' OR p_type = 'refund') THEN
            IF p_amount > 0 THEN
                v_flow_type := 'IN';
                v_category := 'Thu nợ'; 
            ELSE
                v_flow_type := 'OUT';
                v_category := 'Chi khác';
            END IF;

            INSERT INTO public.cash_flow (
                flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_name, payment_method
            ) VALUES (
                v_flow_type, v_category, ABS(p_amount),
                p_description || ' [Balance Adjustment]',
                now(), v_staff_id, p_verified_by_staff_name, LOWER(p_payment_method)
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'new_balance', v_new_balance, 
        'message', 'Transaction processed successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;
