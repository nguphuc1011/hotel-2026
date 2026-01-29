
--- process_checkout ---
CREATE OR REPLACE FUNCTION public.process_checkout(p_booking_id uuid, p_payment_method text, p_amount_paid numeric, p_discount numeric, p_surcharge numeric, p_notes text, p_staff_id uuid DEFAULT NULL::uuid)
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

    -- 3. Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 4. Record Cash Flow (Dòng tiền)
    BEGIN
        IF p_amount_paid > 0 THEN
            INSERT INTO public.cash_flow (
                flow_type, 
                category, 
                amount, 
                description, 
                created_by, 
                ref_id, 
                is_auto, 
                occurred_at,
                payment_method_code
            )
            VALUES (
                'IN', 
                'Tiền phòng', 
                p_amount_paid, 
                'Thanh toán checkout phòng ' || COALESCE(v_bill->>'room_name', '???') || ' - ' || COALESCE(v_bill->>'customer_name', 'Khách lẻ'), 
                v_staff_id, 
                p_booking_id, 
                true, 
                now(),
                lower(p_payment_method)
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN 
        -- Log error to audit_logs instead of silent fail
        INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
        VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, 0, to_jsonb(ARRAY['Lỗi ghi nhận dòng tiền: ' || SQLERRM]));
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
$function$
;

--- adjust_customer_balance ---
CREATE OR REPLACE FUNCTION public.adjust_customer_balance(p_customer_id uuid, p_amount numeric, p_type text, p_description text, p_booking_id uuid DEFAULT NULL::uuid, p_verified_by_staff_id uuid DEFAULT NULL::uuid, p_verified_by_staff_name text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash'::text)
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
    v_method_code text;
    v_cash_flow_amount numeric;
BEGIN
    -- 1. Lock & Check
    SELECT true, balance INTO v_cust_exists, v_old_balance
    FROM customers WHERE id = p_customer_id FOR UPDATE;

    IF v_cust_exists IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Customer not found'); END IF;

    v_old_balance := COALESCE(v_old_balance, 0);
    v_new_balance := v_old_balance + p_amount;

    -- 2. Update Balance
    UPDATE customers SET balance = v_new_balance, updated_at = now() WHERE id = p_customer_id;

    -- 3. Log Transaction
    INSERT INTO customer_transactions (
        customer_id, type, amount, balance_before, balance_after, description, booking_id, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_customer_id, p_type, p_amount, v_old_balance, v_new_balance, 
        p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
        p_booking_id, p_verified_by_staff_id, p_verified_by_staff_name
    );

    -- 4. INSERT CASH FLOW (The Upgrade)
    v_cash_flow_amount := ABS(p_amount);
    v_method_code := lower(p_payment_method);
    
    IF p_type = 'payment' THEN v_flow_type := 'IN'; v_category := 'Thu nợ';
    ELSIF p_type = 'refund' THEN v_flow_type := 'OUT'; v_category := 'Hoàn tiền';
    ELSIF p_type = 'charge' THEN v_flow_type := 'IN'; v_category := 'Phụ phí'; v_method_code := 'credit';
    ELSE 
        IF p_amount > 0 THEN v_flow_type := 'IN'; v_category := 'Thu nợ';
        ELSE v_flow_type := 'IN'; v_category := 'Phụ phí'; v_method_code := 'credit'; END IF;
    END IF;

    INSERT INTO cash_flow (
        flow_type, category, amount, description, created_by, ref_id, payment_method_code, created_at, occurred_at
    ) VALUES (
        v_flow_type, v_category, v_cash_flow_amount, 
        p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''),
        p_verified_by_staff_id, COALESCE(p_booking_id, p_customer_id), v_method_code, now(), now()
    );

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$function$
;

--- check_in_customer ---
CREATE OR REPLACE FUNCTION public.check_in_customer(p_room_id uuid, p_rental_type text, p_customer_id uuid DEFAULT NULL::uuid, p_deposit numeric DEFAULT 0, p_services jsonb DEFAULT '[]'::jsonb, p_customer_name text DEFAULT NULL::text, p_extra_adults integer DEFAULT 0, p_extra_children integer DEFAULT 0, p_notes text DEFAULT NULL::text, p_custom_price numeric DEFAULT NULL::numeric, p_custom_price_reason text DEFAULT NULL::text, p_source text DEFAULT 'direct'::text, p_verified_by_staff_id uuid DEFAULT NULL::uuid, p_verified_by_staff_name text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_booking_id uuid;
    v_customer_id uuid;
    v_staff_id uuid;
    v_staff_name text;
    v_room_status text;
    v_room_name text;
    v_check_in_at timestamptz := now();
BEGIN
    -- Identify Staff
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;

    -- Get Room Info
    SELECT status, room_number INTO v_room_status, v_room_name FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi: Phòng không tồn tại.');
    END IF;
    IF v_room_status NOT IN ('available', 'dirty') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách hoặc chưa sẵn sàng.');
    END IF;

    -- Handle Customer
    IF p_customer_id IS NOT NULL THEN
        v_customer_id := p_customer_id;
    ELSIF p_customer_name IS NOT NULL THEN
        INSERT INTO public.customers (full_name) VALUES (p_customer_name) RETURNING id INTO v_customer_id;
    ELSE
        v_customer_id := NULL;
    END IF;

    -- 1. Create Booking
    INSERT INTO public.bookings (
        room_id, customer_id, rental_type, check_in_actual, deposit_amount, payment_method, 
        status, notes, services_used, extra_adults, extra_children, 
        custom_price, custom_price_reason, source, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_room_id, v_customer_id, p_rental_type, v_check_in_at, p_deposit, p_payment_method, 
        'checked_in', p_notes, p_services, p_extra_adults, p_extra_children, 
        p_custom_price, p_custom_price_reason, p_source, v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name)
    ) RETURNING id INTO v_booking_id;

    -- 2. Update Room Status
    UPDATE public.rooms SET status = 'occupied', current_booking_id = v_booking_id, last_status_change = v_check_in_at WHERE id = p_room_id;

    -- 3. INITIAL ROOM CHARGE (Snapshot Principle)
    DECLARE
        v_room_cat_id uuid;
        v_initial_bill jsonb;
        v_initial_amount numeric;
    BEGIN
        SELECT category_id INTO v_room_cat_id FROM public.rooms WHERE id = p_room_id;
        
        v_initial_bill := public.fn_calculate_room_charge(
            v_booking_id, v_check_in_at, v_check_in_at, p_rental_type, v_room_cat_id
        );
        v_initial_amount := (v_initial_bill->>'amount')::numeric;

        -- FIX: Hourly Room starts with 0 Debt (Snapshot Principle)
        IF p_rental_type = 'hourly' THEN
            v_initial_amount := 0;
        END IF;

        IF v_initial_amount > 0 THEN
            INSERT INTO public.cash_flow (
                flow_type, category, amount, description, payment_method_code, 
                created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at
            )
            VALUES (
                'IN', 'Tiền phòng', v_initial_amount, 
                format('Ghi nhận nợ tiền phòng (%s) lúc nhận phòng', p_rental_type), 
                'credit', -- Increases Receivable & Revenue
                auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), v_booking_id, true, now()
            );
        END IF;
    END;

    -- 4. RECORD DEPOSIT
    IF p_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, payment_method_code, 
            created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, occurred_at
        )
        VALUES (
            'IN', 'Tiền cọc', p_deposit, 
            'Tiền cọc phòng ' || COALESCE(v_room_name, ''), 
            p_payment_method, -- cash/bank
            auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), v_booking_id, true, now()
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$function$
;

--- fn_create_cash_flow ---
CREATE OR REPLACE FUNCTION public.fn_create_cash_flow(p_flow_type text, p_category text, p_amount numeric, p_description text, p_occurred_at timestamp with time zone DEFAULT now(), p_verified_by_staff_id uuid DEFAULT NULL::uuid, p_verified_by_staff_name text DEFAULT NULL::text)
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
$function$
;
