-- Fix 1: Handle Check-in (Remove ON CONFLICT, Remove Manual Balance Update)
CREATE OR REPLACE FUNCTION public.handle_check_in(
    p_room_id uuid,
    p_rental_type text,
    p_customer_id uuid,
    p_customer_name text,
    p_customer_phone text,
    p_customer_id_card text,
    p_customer_address text,
    p_check_in_at timestamp with time zone,
    p_initial_price numeric,
    p_deposit_amount numeric,
    p_deposit_method text,
    p_notes text,
    p_services_used jsonb,
    p_staff_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_customer_id UUID;
  v_booking_id UUID;
  v_staff_id UUID := p_staff_id;
BEGIN
  -- Lấy staff_id nếu không truyền vào
  IF v_staff_id IS NULL THEN
    v_staff_id := auth.uid();
  END IF;

  -- 1. Xử lý khách hàng (Tìm hoặc Tạo mới - KHÔNG dùng ON CONFLICT để tránh lỗi)
  IF p_customer_id IS NOT NULL THEN
    v_customer_id := p_customer_id;
  ELSE
    -- Tìm khách hàng theo số điện thoại
    SELECT id INTO v_customer_id FROM customers WHERE phone = p_customer_phone LIMIT 1;

    IF v_customer_id IS NOT NULL THEN
      -- Cập nhật thông tin khách hàng hiện có
      UPDATE customers SET
        full_name = p_customer_name,
        id_card = COALESCE(customers.id_card, p_customer_id_card),
        address = COALESCE(customers.address, p_customer_address)
      WHERE id = v_customer_id;
    ELSE
      -- Tạo khách hàng mới
      INSERT INTO customers (full_name, phone, id_card, address)
      VALUES (p_customer_name, p_customer_phone, p_customer_id_card, p_customer_address)
      RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  -- 2. Tạo Booking mới
  INSERT INTO bookings (
    room_id, customer_id, rental_type, check_in_at, 
    initial_price, deposit_amount, payment_method, 
    notes, services_used, status
  ) VALUES (
    p_room_id, v_customer_id, p_rental_type, p_check_in_at,
    p_initial_price, p_deposit_amount, p_deposit_method,
    p_notes, p_services_used, 'active'
  ) RETURNING id INTO v_booking_id;

  -- 3. Cập nhật visit_count và last_visit cho khách
  -- LƯU Ý: Đã XÓA cập nhật balance tại đây để tránh nhân đôi nợ (Trigger sẽ xử lý)
  UPDATE customers 
  SET 
    visit_count = COALESCE(visit_count, 0) + 1,
    last_visit = p_check_in_at
  WHERE id = v_customer_id;

  -- 4. Ghi nhận Tiền cọc vào Ledger (nếu có)
  -- Trigger trg_ledger_sync_customer_balance sẽ tự động cập nhật balance
  IF p_deposit_amount > 0 THEN
    INSERT INTO ledger (
      booking_id, customer_id, staff_id, type, category, amount, payment_method_code, description, created_at
    ) VALUES (
      v_booking_id, v_customer_id, v_staff_id, 'DEPOSIT', 'ROOM', p_deposit_amount, p_deposit_method, 'Tiền cọc nhận phòng', NOW()
    );
  END IF;

  -- 5. Cập nhật trạng thái phòng
  UPDATE rooms 
  SET 
    status = CASE 
      WHEN p_rental_type = 'daily' THEN 'daily'
      WHEN p_rental_type = 'overnight' THEN 'overnight'
      ELSE 'hourly'
    END,
    current_booking_id = v_booking_id,
    last_status_change = NOW()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'customer_id', v_customer_id
  );
END;
$function$;

-- Fix 2: Handle Checkout (Remove Manual Balance Update)
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_total_amount numeric,
    p_amount_paid numeric,
    p_surcharge numeric,
    p_payment_method text,
    p_notes text DEFAULT NULL::text,
    p_debt_carry_amount numeric DEFAULT 0,
    p_staff_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
    v_payment_code text;
BEGIN
    -- 1. Get Booking Info
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Booking not found');
    END IF;

    -- Get Staff ID
    v_staff_id := COALESCE(p_staff_id, auth.uid());

    -- Map payment method
    v_payment_code := CASE 
        WHEN UPPER(p_payment_method) IN ('TRANSFER', 'CK', 'BANK_TRANSFER') THEN 'BANK_TRANSFER'
        WHEN UPPER(p_payment_method) IN ('CASH', 'TIEN_MAT') THEN 'CASH'
        WHEN UPPER(p_payment_method) IN ('CARD', 'THE') THEN 'CARD'
        ELSE 'CASH'
    END;

    -- 2. Validate & Finalize Total Amount
    v_total_amount := COALESCE(p_total_amount, v_booking.total_amount, 0);
    v_final_total_amount := v_total_amount; 

    IF p_total_amount IS NOT NULL THEN
        v_final_total_amount := p_total_amount;
    END IF;

    -- 3. Determine Amount Paid
    v_amount_paid := COALESCE(p_amount_paid, v_final_total_amount);

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

    -- 8. Update Customer Metrics & Balance
    IF v_booking.customer_id IS NOT NULL THEN
        v_already_charged := 0;

        SELECT COALESCE(SUM((item->>'total')::numeric), 0)
        INTO v_old_debt_included
        FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) item
        WHERE item->>'id' = '11111111-1111-1111-1111-111111111111' 
           OR item->>'id' = 'old_debt'
           OR item->>'id' = 'debt-carry';

        IF v_old_debt_included = 0 AND p_debt_carry_amount > 0 THEN
            v_old_debt_included := p_debt_carry_amount;
        END IF;

        v_new_charges := v_final_total_amount - v_already_charged - v_old_debt_included;

        -- Update Metrics only (Balance handled by Trigger)
        UPDATE public.customers
        SET 
            total_spent = COALESCE(total_spent, 0) + v_final_total_amount,
            visit_count = COALESCE(visit_count, 0) + 1,
            last_visit = NOW()
            -- REMOVED manual balance update
        WHERE id = v_booking.customer_id;
        
        -- Lấy balance hiện tại để trả về (chưa tính giao dịch mới nhất nếu Trigger chưa chạy, nhưng chấp nhận được hoặc query lại)
        SELECT balance INTO v_new_balance FROM customers WHERE id = v_booking.customer_id;

        -- E. Log Payment Transaction to Ledger
        IF v_amount_paid > 0 THEN
            INSERT INTO public.ledger(customer_id, booking_id, amount, type, category, description, payment_method_code, staff_id)
            VALUES (v_booking.customer_id, p_booking_id, v_amount_paid, 'PAYMENT', 'ROOM_BILL', 'Thanh toán trả phòng ' || p_booking_id, v_payment_code, v_staff_id);
        END IF;
        
        -- F. Log Revenue to Ledger
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
        'new_balance', v_new_balance -- Note: This might be pre-trigger balance, frontend should refresh
    );

    RETURN v_result;
END;
$function$;

-- Fix 3: Handle Deposit (Remove Manual Balance Update)
CREATE OR REPLACE FUNCTION public.handle_deposit(
    p_booking_id uuid, 
    p_amount numeric, 
    p_method text, 
    p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_booking record;
    v_room_number text;
    v_staff_id uuid;
    v_payment_code text;
BEGIN
    SELECT b.*, r.room_number INTO v_booking 
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy đặt phòng');
    END IF;

    v_staff_id := auth.uid();
    v_room_number := v_booking.room_number;

    -- Map payment method
    v_payment_code := CASE 
        WHEN UPPER(p_method) IN ('TRANSFER', 'CK', 'BANK_TRANSFER') THEN 'BANK_TRANSFER'
        WHEN UPPER(p_method) IN ('CASH', 'TIEN_MAT') THEN 'CASH'
        WHEN UPPER(p_method) IN ('CARD', 'THE') THEN 'CARD'
        ELSE 'CASH'
    END;

    -- 1. Update Booking Deposit
    UPDATE public.bookings
    SET deposit_amount = COALESCE(deposit_amount, 0) + p_amount
    WHERE id = p_booking_id;

    -- 2. Update Customer Balance
    -- REMOVED Manual Update. Trigger on Ledger will handle it.
    /*
    IF v_booking.customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET balance = COALESCE(balance, 0) + p_amount
        WHERE id = v_booking.customer_id;
    END IF;
    */

    -- 3. Log to Ledger (PAYMENT / BOOKING_DEPOSIT)
    INSERT INTO public.ledger(
        customer_id, 
        booking_id, 
        staff_id,
        amount, 
        type, 
        category, 
        description, 
        payment_method_code
    )
    VALUES (
        v_booking.customer_id, 
        p_booking_id, 
        v_staff_id,
        p_amount, 
        'PAYMENT', 
        'BOOKING_DEPOSIT', 
        COALESCE(p_notes, 'Thu thêm tiền cọc phòng ' || v_room_number), 
        v_payment_code
    );

    RETURN jsonb_build_object('success', true, 'message', 'Đã thu cọc thành công');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi thu cọc: ' || SQLERRM);
END;
$function$;
