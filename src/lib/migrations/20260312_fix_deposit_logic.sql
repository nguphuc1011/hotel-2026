-- Migration: 20260312_fix_deposit_logic.sql
-- Goal: Fix adjust_customer_balance to update booking deposit, include hotel_id, and return wallet_changes

CREATE OR REPLACE FUNCTION public.adjust_customer_balance(
    p_customer_id uuid, 
    p_amount numeric, 
    p_type text, 
    p_description text, 
    p_booking_id uuid DEFAULT NULL::uuid, 
    p_verified_by_staff_id uuid DEFAULT NULL::uuid, 
    p_verified_by_staff_name text DEFAULT NULL::text, 
    p_payment_method text DEFAULT 'cash'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_old_balance numeric;
    v_new_balance numeric;
    v_hotel_id uuid;
    v_flow_type text;
    v_category text;
    v_method_code text;
    v_cash_flow_amount numeric;
    v_wallet_changes jsonb := '[]'::jsonb;
BEGIN
    -- 1. Lock & Get Hotel ID + Old Balance
    SELECT hotel_id, balance INTO v_hotel_id, v_old_balance
    FROM public.customers WHERE id = p_customer_id FOR UPDATE;

    IF v_hotel_id IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'message', 'Customer not found or hotel_id missing'); 
    END IF;

    v_old_balance := COALESCE(v_old_balance, 0);
    
    -- Balance logic: 
    -- deposit: tăng balance (khách đưa tiền cho mình)
    -- refund: giảm balance
    -- payment: giảm balance (trừ tiền nợ)
    -- charge: tăng balance (khách nợ thêm tiền)
    IF p_type = 'deposit' OR p_type = 'charge' THEN
        v_new_balance := v_old_balance + p_amount;
    ELSE
        v_new_balance := v_old_balance - p_amount;
    END IF;

    -- 2. Update Customer Balance
    UPDATE public.customers 
    SET balance = v_new_balance, updated_at = now() 
    WHERE id = p_customer_id;

    -- 3. Update Booking Deposit if applicable
    IF p_type = 'deposit' AND p_booking_id IS NOT NULL THEN
        UPDATE public.bookings 
        SET deposit_amount = COALESCE(deposit_amount, 0) + p_amount,
            updated_at = now()
        WHERE id = p_booking_id;
    END IF;

    -- 4. Log Customer Transaction (with hotel_id)
    INSERT INTO public.customer_transactions (
        hotel_id, customer_id, type, amount, balance_before, balance_after, 
        description, booking_id, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        v_hotel_id, p_customer_id, p_type, p_amount, v_old_balance, v_new_balance, 
        p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
        p_booking_id, p_verified_by_staff_id, p_verified_by_staff_name
    );

    -- 5. Insert Cash Flow (with hotel_id)
    v_cash_flow_amount := ABS(p_amount);
    v_method_code := lower(p_payment_method);
    
    IF p_type = 'deposit' THEN 
        v_flow_type := 'IN'; 
        v_category := 'Tiền cọc';
    ELSIF p_type = 'payment' THEN 
        v_flow_type := 'IN'; 
        v_category := 'Thu nợ';
    ELSIF p_type = 'refund' THEN 
        v_flow_type := 'OUT'; 
        v_category := 'Hoàn tiền';
    ELSIF p_type = 'charge' THEN 
        v_flow_type := 'IN'; 
        v_category := 'Phụ phí'; 
        v_method_code := 'credit';
    ELSE 
        v_flow_type := 'IN'; 
        v_category := 'Khác';
    END IF;

    INSERT INTO public.cash_flow (
        hotel_id, flow_type, category, amount, description, 
        created_by, ref_id, payment_method_code, created_at, occurred_at
    ) VALUES (
        v_hotel_id, v_flow_type, v_category, v_cash_flow_amount, 
        p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''),
        p_verified_by_staff_id, COALESCE(p_booking_id, p_customer_id), v_method_code, now(), now()
    );

    -- 6. Prepare wallet_changes for Realtime UI (Rule 12)
    v_wallet_changes := jsonb_build_array(
        jsonb_build_object(
            'customer_id', p_customer_id,
            'amount', p_amount,
            'type', p_type,
            'new_balance', v_new_balance,
            'hotel_id', v_hotel_id
        )
    );

    RETURN jsonb_build_object(
        'success', true, 
        'new_balance', v_new_balance,
        'wallet_changes', v_wallet_changes
    );
END;
$function$;
