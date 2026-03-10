-- FIX: adjust_customer_balance Logic for Refund/Charge
-- Previous version incorrectly added amount for all types.
-- New Logic:
-- 'payment' (Customer pays us): Balance += Amount (IN) -> Cash Flow IN
-- 'refund' (We pay customer): Balance -= Amount (OUT) -> Cash Flow OUT
-- 'charge' (Service fee/Debt): Balance -= Amount (Credit -> Debt) -> NO Cash Flow (Accrual only)
-- 'deposit': Updates Booking Deposit (handled in v2, kept here)

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
    v_abs_amount numeric;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    v_abs_amount := ABS(p_amount); -- Always work with positive magnitude

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
        UPDATE bookings 
        SET deposit_amount = COALESCE(deposit_amount, 0) + v_abs_amount,
            updated_at = now()
        WHERE id = p_booking_id;
        
        v_new_balance := v_old_balance; -- Balance unchanged
        
        -- Transaction Log
        INSERT INTO customer_transactions (
            customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by
        ) VALUES (
            p_customer_id, p_type, v_abs_amount, v_old_balance, v_new_balance, 
            p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
            p_booking_id, v_staff_id
        );
        
        -- Cash Flow (IN)
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_name, payment_method_code
        ) VALUES (
            'IN', 'Tiền cọc', v_abs_amount,
            p_description || ' [Booking Deposit]',
            now(), v_staff_id, p_verified_by_staff_name, LOWER(p_payment_method)
        );

    ELSE
        -- Case 2: Direct Balance Adjustment
        IF p_type = 'payment' THEN
            -- Customer pays us -> Balance Increases (Less Debt / More Credit)
            v_new_balance := v_old_balance + v_abs_amount;
            v_flow_type := 'IN';
            v_category := 'Thu nợ';
            
        ELSIF p_type = 'refund' THEN
            -- We pay customer -> Balance Decreases (Less Credit)
            v_new_balance := v_old_balance - v_abs_amount;
            v_flow_type := 'OUT';
            v_category := 'Hoàn tiền';
            
        ELSIF p_type = 'charge' THEN
            -- Charge customer (Fee) -> Balance Decreases (More Debt)
            v_new_balance := v_old_balance - v_abs_amount;
            -- NO CASH FLOW for Charge (Debt Creation)
            v_flow_type := NULL; 
            
        ELSE -- 'adjustment'
            -- Manual adjustment: respect sign of p_amount if provided
            v_new_balance := v_old_balance + p_amount;
            
            IF p_amount >= 0 THEN
                 v_flow_type := 'IN';
                 v_category := 'Thu nợ';
            ELSE
                 v_flow_type := 'OUT';
                 v_category := 'Chi khác';
            END IF;
        END IF;

        -- Update Customer Balance
        UPDATE customers
        SET balance = v_new_balance,
            updated_at = now()
        WHERE id = p_customer_id;

        -- Transaction Log
        INSERT INTO customer_transactions (
            customer_id, type, amount, balance_before, balance_after, description, booking_id, created_by
        ) VALUES (
            p_customer_id, p_type, v_abs_amount, v_old_balance, v_new_balance, 
            p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
            p_booking_id, v_staff_id
        );

        -- Cash Flow (Only if flow type is set)
        IF v_flow_type IS NOT NULL THEN
            INSERT INTO public.cash_flow (
                flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_name, payment_method_code
            ) VALUES (
                v_flow_type, v_category, v_abs_amount,
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
