-- FIX: FINANCIAL FLOW (Check-in & Checkout)
-- Ensures Cash Flow records are created for all financial events.

-- 1. FIX CHECK-IN: Record Deposit to Cash Flow
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text, uuid, text);

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
    v_staff_id uuid;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());

    SELECT status INTO v_room_status FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi: Phòng không tồn tại.');
    END IF;
    IF v_room_status NOT IN ('available', 'dirty') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách hoặc chưa sẵn sàng.');
    END IF;

    -- Create/Get Customer
    IF p_customer_id IS NOT NULL THEN
        v_customer_id := p_customer_id;
    ELSIF p_customer_name IS NOT NULL THEN
        INSERT INTO public.customers (full_name)
        VALUES (p_customer_name)
        RETURNING id INTO v_customer_id;
    ELSE
        v_customer_id := NULL;
    END IF;

    -- Create Booking
    INSERT INTO public.bookings (
        room_id, customer_id, rental_type, check_in_actual, deposit_amount, status,
        notes, services_used, extra_adults, extra_children, custom_price,
        custom_price_reason, source, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_room_id, v_customer_id, p_rental_type, v_check_in_at, p_deposit, 'checked_in',
        p_notes, p_services, p_extra_adults, p_extra_children, p_custom_price,
        p_custom_price_reason, p_source, v_staff_id, p_verified_by_staff_name
    ) RETURNING id INTO v_booking_id;

    -- Update Room
    UPDATE public.rooms
    SET status = 'occupied', current_booking_id = v_booking_id, last_status_change = v_check_in_at
    WHERE id = p_room_id;

    -- INSERT CASH FLOW FOR DEPOSIT
    IF p_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 
            'Tiền cọc', 
            p_deposit, 
            'Thu tiền cọc phòng ' || (SELECT name FROM rooms WHERE id = p_room_id), 
            now(), 
            auth.uid(), 
            v_staff_id, 
            v_booking_id, 
            true, 
            'cash' -- Default to Cash for now
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$function$;

-- 2. FIX CHECKOUT: Record Charge (Credit) AND Payment
DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid);

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
    v_current_user_id uuid;
BEGIN
    v_current_user_id := auth.uid();
    v_staff_id := COALESCE(p_staff_id, v_current_user_id);
    
    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- Update Booking
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, '')
    WHERE id = p_booking_id;

    -- Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;
    v_room_name := v_bill->>'room_name';
    v_customer_name := v_bill->>'customer_name';

    -- Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- RECORD CHARGE (Ghi nợ - Total Bill)
    -- This ensures Receivable increases by the Total Amount Owed
    INSERT INTO public.cash_flow (
        flow_type, category, amount, description, occurred_at, 
        created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
    ) VALUES (
        'IN', 
        'Tiền phòng', -- Or 'Ghi nợ'
        v_total_amount, 
        'Tổng phí phòng ' || COALESCE(v_room_name, '') || ' (Ghi nợ)', 
        now(), 
        v_current_user_id, 
        v_staff_id, 
        p_booking_id, 
        true, 
        'credit' -- Marks this as a Debt Record
    );

    -- RECORD PAYMENT (Thanh toán - Amount Paid)
    -- This ensures Cash/Revenue increases and Receivable decreases
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 
            'Thanh toán', 
            p_amount_paid, 
            'Thanh toán phòng ' || COALESCE(v_room_name, ''), 
            now(), 
            v_current_user_id, 
            v_staff_id, 
            p_booking_id, 
            true, 
            p_payment_method -- Actual Payment Method
        );
    END IF;

    -- Update Customer Balance (Legacy/Redundant but kept for safety)
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- Audit Logs
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');

    UPDATE public.bookings 
    SET billing_audit_trail = v_bill->'explanation'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$;
