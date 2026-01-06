-- ==========================================
-- COMPREHENSIVE FINANCIAL LOGIC UPGRADE
-- Date: 2026-01-04
-- Author: Thao AI (Senior Partner)
-- Description: Unify payment, debt, and deposit logic across the system.
-- ==========================================

-- 1. CLEANUP OLD FUNCTIONS
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, text, text, numeric, numeric, numeric);
DROP FUNCTION IF EXISTS public.handle_debt_payment(uuid, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.handle_deposit(uuid, numeric, text, text);

-- 2. HANDLE CHECKOUT (PAYMENT & DEBT)
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_notes text DEFAULT NULL,
    p_payment_method text DEFAULT 'cash',
    p_surcharge numeric DEFAULT 0,
    p_total_amount numeric DEFAULT NULL,
    p_amount_paid numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking record;
    v_room_number text;
    v_final_total_amount numeric;
    v_amount_paid numeric;
    v_underpayment numeric;
    v_room_charge numeric;
    v_service_charge numeric;
    v_staff_name text;
    v_already_charged numeric;
    v_old_debt_included numeric;
    v_new_charges numeric;
    v_tx_id uuid;
BEGIN
    -- A. Get booking and room info
    SELECT b.*, r.room_number INTO v_booking 
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy thông tin đặt phòng');
    END IF;

    IF v_booking.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Phòng này đã được thanh toán trước đó');
    END IF;

    v_room_number := v_booking.room_number;
    SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = auth.uid();
    v_staff_name := COALESCE(v_staff_name, 'Hệ thống');

    -- B. Calculate final amounts
    v_final_total_amount := COALESCE(p_total_amount, 0);
    v_amount_paid := COALESCE(p_amount_paid, v_final_total_amount);
    v_underpayment := GREATEST(v_final_total_amount - v_amount_paid, 0);

    -- C. Update Booking
    UPDATE public.bookings
    SET 
        status = 'completed',
        check_out_at = now(),
        total_amount = v_final_total_amount,
        final_amount = v_final_total_amount,
        surcharge = COALESCE(p_surcharge, 0),
        payment_method = p_payment_method,
        notes = COALESCE(p_notes, notes)
    WHERE id = p_booking_id;

    -- D. Update Room
    UPDATE public.rooms
    SET status = 'dirty', current_booking_id = NULL, last_status_change = now()
    WHERE id = v_booking.room_id;

    -- E. Create Invoice
    INSERT INTO public.invoices (booking_id, customer_id, room_id, total_amount, payment_method, created_at)
    VALUES (p_booking_id, v_booking.customer_id, v_booking.room_id, v_final_total_amount, p_payment_method, now());

    -- F. Customer Balance & Financial Logs
    IF v_booking.customer_id IS NOT NULL THEN
        -- 1. Calculate what was already charged to balance (e.g. Night Audit)
        SELECT COALESCE(SUM(amount), 0) INTO v_already_charged
        FROM public.transactions
        WHERE booking_id = p_booking_id 
          AND type IN ('room_charge', 'service_charge')
          AND customer_id = v_booking.customer_id;

        -- 2. Calculate old debt included in this bill
        SELECT COALESCE(SUM((item->>'total')::numeric), 0) INTO v_old_debt_included
        FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) item
        WHERE item->>'id' = '11111111-1111-1111-1111-111111111111' OR item->>'id' = 'old_debt';

        -- 3. New charges = Total bill - (already charged) - (old debt gộp)
        v_new_charges := v_final_total_amount - v_already_charged - v_old_debt_included;

        -- 4. Update Balance: Balance = Old Balance + Amount Paid - New Charges
        UPDATE public.customers
        SET 
            total_spent = COALESCE(total_spent, 0) + v_final_total_amount,
            visit_count = COALESCE(visit_count, 0) + 1,
            last_visit = NOW(),
            balance = COALESCE(balance, 0) + v_amount_paid - v_new_charges
        WHERE id = v_booking.customer_id;

        -- 5. Log Payment
        IF v_amount_paid > 0 THEN
            INSERT INTO public.transactions(customer_id, booking_id, type, amount, method, cashier, notes, created_at, meta)
            VALUES (v_booking.customer_id, p_booking_id, 'payment', v_amount_paid, p_payment_method, v_staff_name, 'Thanh toán checkout phòng ' || v_room_number, now(), jsonb_build_object('source', 'checkout'))
            RETURNING id INTO v_tx_id;

            INSERT INTO public.financial_transactions(transaction_id, customer_id, type, transaction_type, method, amount, cashier, notes, created_at, booking_id)
            VALUES (v_tx_id, v_booking.customer_id, 'income', 'PAYMENT', p_payment_method, v_amount_paid, v_staff_name, 'Thu tiền checkout phòng ' || v_room_number, now(), p_booking_id);
        END IF;

        -- 6. Log Service Charges (to keep transaction history complete)
        IF v_new_charges > 0 THEN
            INSERT INTO public.transactions(customer_id, booking_id, type, amount, notes, created_at, meta)
            VALUES (v_booking.customer_id, p_booking_id, 'service_charge', v_new_charges, 'Phát sinh checkout phòng ' || v_room_number, now(), jsonb_build_object('source', 'checkout'));
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Thanh toán hoàn tất', 
        'total_amount', v_final_total_amount, 
        'paid', v_amount_paid,
        'debt', v_underpayment
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi checkout: ' || SQLERRM);
END;
$$;

-- 3. HANDLE DEBT PAYMENT (TRẢ NỢ)
CREATE OR REPLACE FUNCTION public.handle_debt_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_method text,
  p_cashier text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx_id uuid;
  v_new_balance numeric;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Số tiền trả phải lớn hơn 0';
  END IF;

  -- 1. Log Transaction
  INSERT INTO public.transactions(customer_id, type, amount, method, cashier, notes, created_at)
  VALUES (p_customer_id, 'debt_recovery', p_amount, p_method, p_cashier, COALESCE(p_note, 'Khách trả nợ'), NOW())
  RETURNING id INTO v_tx_id;

  -- 2. Log Financial Transaction
  INSERT INTO public.financial_transactions(transaction_id, customer_id, type, transaction_type, method, amount, cashier, notes, created_at)
  VALUES (v_tx_id, p_customer_id, 'income', 'DEBT_REPAYMENT', p_method, p_amount, p_cashier, p_note, NOW());

  -- 3. Update Balance
  UPDATE public.customers
  SET balance = COALESCE(balance, 0) + p_amount
  WHERE id = p_customer_id
  RETURNING balance INTO v_new_balance;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', 'Lỗi trả nợ: ' || SQLERRM);
END;
$$;

-- 4. HANDLE DEPOSIT (THU CỌC THÊM)
CREATE OR REPLACE FUNCTION public.handle_deposit(
    p_booking_id uuid,
    p_amount numeric,
    p_method text DEFAULT 'cash',
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_staff_name text;
    v_tx_id uuid;
BEGIN
    SELECT b.*, r.room_number INTO v_booking 
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy đặt phòng');
    END IF;

    SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = auth.uid();
    v_staff_name := COALESCE(v_staff_name, 'Hệ thống');

    -- 1. Update Booking Deposit
    UPDATE public.bookings
    SET deposit_amount = COALESCE(deposit_amount, 0) + p_amount
    WHERE id = p_booking_id;

    -- 2. Update Customer Balance
    UPDATE public.customers
    SET balance = COALESCE(balance, 0) + p_amount
    WHERE id = v_booking.customer_id;

    -- 3. Log Transaction
    INSERT INTO public.transactions(customer_id, booking_id, type, amount, method, cashier, notes, created_at)
    VALUES (v_booking.customer_id, p_booking_id, 'deposit', p_amount, p_method, v_staff_name, COALESCE(p_notes, 'Thu thêm tiền cọc phòng ' || v_booking.room_number), NOW())
    RETURNING id INTO v_tx_id;

    -- 4. Log Financial Transaction
    INSERT INTO public.financial_transactions(transaction_id, customer_id, type, transaction_type, method, amount, cashier, notes, created_at, booking_id)
    VALUES (v_tx_id, v_booking.customer_id, 'income', 'DEPOSIT', p_method, p_amount, v_staff_name, 'Thu tiền cọc phòng ' || v_booking.room_number, NOW(), p_booking_id);

    RETURN jsonb_build_object('success', true, 'message', 'Đã thu cọc thành công');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi thu cọc: ' || SQLERRM);
END;
$$;

-- 5. UPDATE HANDLE_CHECK_IN TO LOG DEPOSIT
CREATE OR REPLACE FUNCTION public.handle_check_in(
    p_room_id uuid,
    p_rental_type text,
    p_customer_id uuid DEFAULT NULL,
    p_customer_name text DEFAULT 'Khách vãng lai',
    p_customer_phone text DEFAULT NULL,
    p_customer_id_card text DEFAULT NULL,
    p_customer_address text DEFAULT NULL,
    p_check_in_at timestamptz DEFAULT now(),
    p_initial_price numeric DEFAULT 0,
    p_deposit_amount numeric DEFAULT 0,
    p_deposit_method text DEFAULT 'cash',
    p_notes text DEFAULT NULL,
    p_services_used jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room record;
    v_customer_id uuid := p_customer_id;
    v_booking_id uuid;
    v_new_booking record;
    v_staff_name text;
    v_tx_id uuid;
BEGIN
    -- 1. Validate room
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy phòng'); END IF;
    IF v_room.status NOT IN ('available', 'reserved') THEN RETURN jsonb_build_object('success', false, 'message', 'Phòng đang bận'); END IF;

    -- 2. Customer logic
    IF v_customer_id IS NULL THEN
        IF p_customer_phone IS NOT NULL OR p_customer_id_card IS NOT NULL THEN
            SELECT id INTO v_customer_id FROM public.customers 
            WHERE (p_customer_phone IS NOT NULL AND phone = p_customer_phone)
               OR (p_customer_id_card IS NOT NULL AND id_card = p_customer_id_card)
            LIMIT 1;
        END IF;
        IF v_customer_id IS NULL AND p_customer_name = 'Khách vãng lai' THEN
            SELECT id INTO v_customer_id FROM public.customers WHERE full_name = 'Khách vãng lai' LIMIT 1;
        END IF;
        IF v_customer_id IS NULL THEN
            INSERT INTO public.customers (full_name, phone, id_card, address, visit_count)
            VALUES (COALESCE(p_customer_name, 'Khách vãng lai'), p_customer_phone, p_customer_id_card, p_customer_address, 1)
            RETURNING id INTO v_customer_id;
        END IF;
    END IF;

    -- 3. Create Booking
    INSERT INTO public.bookings (room_id, customer_id, check_in_at, rental_type, initial_price, deposit_amount, notes, status, services_used)
    VALUES (p_room_id, v_customer_id, p_check_in_at, p_rental_type, p_initial_price, p_deposit_amount, p_notes, 'active', p_services_used)
    RETURNING * INTO v_new_booking;

    v_booking_id := v_new_booking.id;

    -- 4. Update Room
    UPDATE public.rooms SET status = p_rental_type, current_booking_id = v_booking_id, last_status_change = now() WHERE id = p_room_id;

    -- 5. Log Deposit & Update Balance if exists
    IF p_deposit_amount > 0 THEN
        SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = auth.uid();
        v_staff_name := COALESCE(v_staff_name, 'Hệ thống');

        -- Update customer balance
        UPDATE public.customers
        SET balance = COALESCE(balance, 0) + p_deposit_amount
        WHERE id = v_customer_id;

        -- Log Transaction
        INSERT INTO public.transactions(customer_id, booking_id, type, amount, method, cashier, notes, created_at)
        VALUES (v_customer_id, v_booking_id, 'deposit', p_deposit_amount, p_deposit_method, v_staff_name, 'Tiền cọc khi check-in phòng ' || v_room.room_number, now())
        RETURNING id INTO v_tx_id;

        -- Log Financial Transaction
        INSERT INTO public.financial_transactions(transaction_id, customer_id, type, transaction_type, method, amount, cashier, notes, created_at, booking_id)
        VALUES (v_tx_id, v_customer_id, 'income', 'DEPOSIT', p_deposit_method, p_deposit_amount, v_staff_name, 'Tiền cọc check-in phòng ' || v_room.room_number, now(), v_booking_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Check-in thành công', 'booking', to_jsonb(v_new_booking));
END;
$$;

-- 6. PERMISSIONS
GRANT EXECUTE ON FUNCTION public.handle_checkout TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_debt_payment TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_deposit TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_check_in TO authenticated, service_role;

-- RELOAD CACHE
NOTIFY pgrst, 'reload schema';
