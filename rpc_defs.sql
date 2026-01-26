-- RPC DEFINITIONS (Synchronized with audit_rpc.sql)
-- Last Updated: 2026-01-22

-- 1. process_checkout
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
BEGIN
    -- Identify Staff
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;

    -- Get Booking Info
    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- Get Room Name for description
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
        verified_by_staff_name = COALESCE(p_verified_by_staff_name, v_staff_name)
    WHERE id = p_booking_id;

    -- 2. Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 3. Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 4. Record Ledger Entries (Legacy support with exception handling)
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

    -- 5. INSERT CASH FLOW (Modern audit)
    -- A. Record the actual cash paid at checkout
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, created_by, verified_by_staff_id, 
            verified_by_staff_name, ref_id, is_auto, payment_method_code, occurred_at
        ) VALUES (
            'IN', 'Tiền phòng', p_amount_paid, 
            'Thanh toán phòng ' || COALESCE(v_room_name, '') || ' (Checkout)', 
            auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), p_booking_id, true, LOWER(p_payment_method), now()
        );
    END IF;

    -- B. Handle Deposit Transfer (Convert 'Tiền cọc' to 'Tiền phòng')
    -- This ensures 'Tiền phòng' category shows full revenue while 'Tiền cọc' is balanced to 0
    IF v_deposit > 0 THEN
        -- 1. Deduct from 'Tiền cọc'
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, created_by, verified_by_staff_id, 
            verified_by_staff_name, ref_id, is_auto, payment_method_code, occurred_at
        ) VALUES (
            'OUT', 'Tiền cọc', v_deposit, 
            'Khấu trừ tiền cọc vào tiền phòng (Phòng ' || COALESCE(v_room_name, '') || ')', 
            auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), p_booking_id, true, 'cash', now()
        );

        -- 2. Add to 'Tiền phòng'
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, created_by, verified_by_staff_id, 
            verified_by_staff_name, ref_id, is_auto, payment_method_code, occurred_at
        ) VALUES (
            'IN', 'Tiền phòng', v_deposit, 
            'Tiền cọc chuyển sang tiền phòng (Phòng ' || COALESCE(v_room_name, '') || ')', 
            auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), p_booking_id, true, 'cash', now()
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

    -- 8. Audit Trail
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
SECURITY DEFINER
AS $function$
DECLARE
    v_old_balance numeric;
    v_new_balance numeric;
    v_cust_exists boolean;
BEGIN
    SELECT true, balance INTO v_cust_exists, v_old_balance
    FROM customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF v_cust_exists IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Customer not found');
    END IF;

    v_old_balance := COALESCE(v_old_balance, 0);
    v_new_balance := v_old_balance + p_amount;

    UPDATE customers
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = p_customer_id;

    INSERT INTO customer_transactions (
        customer_id, type, amount, balance_before, balance_after, description, booking_id, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_customer_id, p_type, p_amount, v_old_balance, v_new_balance, 
        p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
        p_booking_id, p_verified_by_staff_id, p_verified_by_staff_name
    );

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'message', 'Balance updated successfully');
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
    v_room_name text;
    v_check_in_at timestamptz := now();
    v_staff_id uuid;
    v_staff_name text;
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
        INSERT INTO public.customers (full_name)
        VALUES (p_customer_name)
        RETURNING id INTO v_customer_id;
    ELSE
        v_customer_id := NULL;
    END IF;

    -- 1. Create Booking
    INSERT INTO public.bookings (
        room_id, customer_id, rental_type, check_in_actual, deposit_amount, status,
        notes, services_used, extra_adults, extra_children, custom_price,
        custom_price_reason, source, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_room_id, v_customer_id, p_rental_type, v_check_in_at, p_deposit, 'checked_in',
        p_notes, p_services, p_extra_adults, p_extra_children, p_custom_price,
        p_custom_price_reason, p_source, v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name)
    ) RETURNING id INTO v_booking_id;

    -- 2. Update Room Status
    UPDATE public.rooms
    SET status = 'occupied', current_booking_id = v_booking_id, last_status_change = v_check_in_at
    WHERE id = p_room_id;

    -- 3. Record Cash Flow for Deposit (Modern audit)
    IF p_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, created_by, verified_by_staff_id, 
            verified_by_staff_name, ref_id, is_auto, occurred_at
        )
        VALUES (
            'IN', 'Tiền cọc', p_deposit, 
            'Tiền cọc phòng ' || COALESCE(v_room_name, ''), 
            auth.uid(), v_staff_id, COALESCE(p_verified_by_staff_name, v_staff_name), v_booking_id, true, now()
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$function$;

-- 4. import_inventory
CREATE OR REPLACE FUNCTION public.import_inventory(
    p_service_id uuid, 
    p_qty_buy numeric, 
    p_total_amount numeric, 
    p_payment_method_code text DEFAULT 'cash'::text, 
    p_shift_id uuid DEFAULT NULL::uuid, 
    p_notes text DEFAULT NULL::text, 
    p_verified_by_staff_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_staff_id uuid;
  v_staff_name text;
  v_old_stock integer;
  v_old_cost numeric;
  v_new_stock integer;
  v_new_cost numeric;
  v_conversion_factor integer;
  v_qty_sell integer;
  v_unit_cost numeric;
  v_transaction_id uuid;
  v_service_name text;
BEGIN
  v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
  SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;

  SELECT name, COALESCE(stock_quantity, 0), COALESCE(cost_price, 0), COALESCE(conversion_factor, 1)
  INTO v_service_name, v_old_stock, v_old_cost, v_conversion_factor
  FROM public.services WHERE id = p_service_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Dịch vụ không tồn tại'; END IF;

  v_qty_sell := ROUND(p_qty_buy * v_conversion_factor);
  v_unit_cost := p_total_amount / v_qty_sell;
  v_new_stock := v_old_stock + v_qty_sell;
  v_new_cost := CASE WHEN v_new_stock > 0 THEN ((v_old_stock * v_old_cost) + p_total_amount) / v_new_stock ELSE v_unit_cost END;

  INSERT INTO public.transactions (type, staff_id, amount, reason, new_value)
  VALUES ('IMPORT_INVENTORY', v_staff_id, p_total_amount, COALESCE(p_notes, 'Nhập kho: ' || v_service_name), 
  jsonb_build_object('service_id', p_service_id, 'qty_buy', p_qty_buy, 'unit_cost', v_unit_cost, 'payment_method', LOWER(COALESCE(p_payment_method_code, 'cash'))))
  RETURNING id INTO v_transaction_id;

  IF p_total_amount > 0 THEN
    INSERT INTO public.cash_flow (flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_id, verified_by_staff_name, ref_id, payment_method_code)
    VALUES ('OUT', 'Nhập hàng', p_total_amount, 'Nhập kho: ' || v_service_name, now(), v_staff_id, v_staff_id, v_staff_name, v_transaction_id, LOWER(COALESCE(p_payment_method_code, 'cash')));
  END IF;

  UPDATE public.services SET stock_quantity = v_new_stock, stock = v_new_stock, cost_price = v_new_cost, track_inventory = true, updated_at = now() WHERE id = p_service_id;

  INSERT INTO public.inventory_logs (service_id, type, quantity, balance_before, balance_after, reference_id, notes, created_by)
  VALUES (p_service_id, 'IMPORT', v_qty_sell, v_old_stock, v_new_stock, v_transaction_id, p_notes, v_staff_id);

  RETURN json_build_object('status', 'success', 'service_id', p_service_id, 'transaction_id', v_transaction_id);
END;
$function$;

-- 5. fn_create_cash_flow
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
