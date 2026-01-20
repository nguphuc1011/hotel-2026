-- AUDIT RPC UPDATE
-- Created: 2026-01-20
-- Description: Update RPCs to handle verified staff info

-- 1. process_checkout
CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid, 
    p_payment_method text, 
    p_amount_paid numeric, 
    p_discount numeric, 
    p_surcharge numeric, 
    p_notes text, 
    p_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_staff_id uuid;
    v_room_id uuid;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
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
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, ''),
        verified_by_staff_id = p_verified_by_staff_id,
        verified_by_staff_name = p_verified_by_staff_name
    WHERE id = p_booking_id;

    -- 2. Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 3. Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 4. Record Ledger Entries
    BEGIN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'REVENUE', 'ROOM', (v_bill->>'room_charge')::numeric, 'Tiền phòng', v_staff_id, p_payment_method);
        
        IF p_amount_paid > 0 THEN
            INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
            VALUES (p_booking_id, v_customer_id, 'PAYMENT', 'ROOM', p_amount_paid, 'Khách thanh toán checkout', v_staff_id, p_payment_method);
        END IF;
    EXCEPTION WHEN OTHERS THEN 
        -- Ignore ledger errors for now
    END;

    -- 5. Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- 6. Record Audit Log (Lưu vết tính toán)
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');

    -- 7. Lưu giải trình vào Booking (Audit Trail)
    UPDATE public.bookings 
    SET billing_audit_trail = v_bill->'explanation'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$;

-- 2. adjust_customer_balance
CREATE OR REPLACE FUNCTION public.adjust_customer_balance(
    p_customer_id uuid, 
    p_amount numeric, 
    p_type text, 
    p_description text, 
    p_booking_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_old_balance numeric;
    v_new_balance numeric;
    v_cust_exists boolean;
BEGIN
    -- Check if customer exists and lock row
    SELECT true, balance INTO v_cust_exists, v_old_balance
    FROM customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF v_cust_exists IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Customer not found');
    END IF;

    v_old_balance := COALESCE(v_old_balance, 0);
    v_new_balance := v_old_balance + p_amount;

    -- Update Customer Balance
    UPDATE customers
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = p_customer_id;

    -- Log Transaction
    INSERT INTO customer_transactions (
        customer_id, type, amount, balance_before, balance_after, description, booking_id, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_customer_id, p_type, p_amount, v_old_balance, v_new_balance, p_description, p_booking_id, p_verified_by_staff_id, p_verified_by_staff_name
    );

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'message', 'Balance updated successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

-- 3. check_in_customer
CREATE OR REPLACE FUNCTION public.check_in_customer(
    p_room_id uuid, 
    p_rental_type text, 
    p_customer_id uuid DEFAULT NULL::uuid, 
    p_deposit numeric DEFAULT 0, 
    p_services jsonb DEFAULT '[]'::jsonb, 
    p_customer_name text DEFAULT NULL::text, 
    p_extra_adults integer DEFAULT 0, 
    p_extra_children integer DEFAULT 0, 
    p_notes text DEFAULT NULL::text, 
    p_custom_price numeric DEFAULT NULL::numeric, 
    p_custom_price_reason text DEFAULT NULL::text, 
    p_source text DEFAULT 'direct'::text,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_booking_id uuid;
    v_customer_id uuid;
    v_room_status text;
    v_check_in_at timestamptz := now();
BEGIN
    SELECT status INTO v_room_status FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi: Phòng không tồn tại.');
    END IF;
    IF v_room_status NOT IN ('available', 'dirty') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách hoặc chưa sẵn sàng.');
    END IF;

    IF p_customer_id IS NOT NULL THEN
        v_customer_id := p_customer_id;
    ELSIF p_customer_name IS NOT NULL THEN
        INSERT INTO public.customers (full_name)
        VALUES (p_customer_name)
        RETURNING id INTO v_customer_id;
    ELSE
        v_customer_id := NULL;
    END IF;

    INSERT INTO public.bookings (
        room_id,
        customer_id,
        rental_type,
        check_in_actual,
        deposit_amount,
        status,
        notes,
        services_used,
        extra_adults,
        extra_children,
        custom_price,
        custom_price_reason,
        source,
        verified_by_staff_id,
        verified_by_staff_name
    ) VALUES (
        p_room_id,
        v_customer_id,
        p_rental_type,
        v_check_in_at,
        p_deposit,
        'checked_in',
        p_notes,
        p_services,
        p_extra_adults,
        p_extra_children,
        p_custom_price,
        p_custom_price_reason,
        p_source,
        p_verified_by_staff_id,
        p_verified_by_staff_name
    ) RETURNING id INTO v_booking_id;

    UPDATE public.rooms
    SET
        status = 'occupied',
        current_booking_id = v_booking_id,
        last_status_change = v_check_in_at
    WHERE id = p_room_id;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id
    );
END;
$function$;

-- 4. fn_create_cash_flow
CREATE OR REPLACE FUNCTION public.fn_create_cash_flow(
    p_flow_type text, 
    p_category text, 
    p_amount numeric, 
    p_description text, 
    p_occurred_at timestamp with time zone DEFAULT now(),
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_new_id uuid;
BEGIN
    INSERT INTO public.cash_flow (flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_id, verified_by_staff_name)
    VALUES (p_flow_type, p_category, p_amount, p_description, p_occurred_at, auth.uid(), p_verified_by_staff_id, p_verified_by_staff_name)
    RETURNING id INTO v_new_id;
    RETURN jsonb_build_object('success', true, 'data', v_new_id);
END;
$function$;
