-- 1. XÓA SẠCH CÁC HÀM XUNG ĐỘT (Cleanup conflicting functions)
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, text, text, numeric, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, text, text, numeric, numeric, numeric, uuid, numeric);
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, numeric, numeric, numeric, text, text, numeric, uuid);
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, numeric, numeric, numeric, text, text, numeric);
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, numeric, numeric, numeric, text, text);

-- Clean up other potentially conflicting RPCs
DROP FUNCTION IF EXISTS public.handle_deposit(uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.handle_debt_payment(uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.handle_debt_payment(uuid, numeric, text, text, uuid);
DROP FUNCTION IF EXISTS public.handle_debt_payment(uuid, numeric, text, uuid, text);

-- 2. CÀI ĐẶT BẢN SQL CHUẨN NHẤT (Canonical implementation)

-- A. HANDLE CHECKOUT (Chuẩn hóa tham số và logic luồng nợ)
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_total_amount numeric,
    p_amount_paid numeric,
    p_surcharge numeric,
    p_payment_method text,
    p_notes text DEFAULT NULL,
    p_debt_carry_amount numeric DEFAULT 0,
    p_staff_id uuid DEFAULT NULL
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

    -- Get Staff ID (from param or auth context)
    v_staff_id := COALESCE(p_staff_id, auth.uid());

    -- Map payment method to code (Chuẩn hóa payment method)
    v_payment_code := CASE 
        WHEN UPPER(p_payment_method) IN ('TRANSFER', 'CK', 'BANK_TRANSFER') THEN 'BANK_TRANSFER'
        WHEN UPPER(p_payment_method) IN ('CASH', 'TIEN_MAT') THEN 'CASH'
        WHEN UPPER(p_payment_method) IN ('CARD', 'THE') THEN 'CARD'
        ELSE 'CASH' -- Default fallback
    END;

    -- 2. Validate & Finalize Total Amount
    v_total_amount := COALESCE(p_total_amount, v_booking.total_amount, 0);
    v_final_total_amount := v_total_amount; 

    -- Sanity check: If passed amount differs significantly from calculated, trust the passed one (from FE)
    IF p_total_amount IS NOT NULL THEN
        v_final_total_amount := p_total_amount;
    END IF;

    -- 3. Determine Amount Paid & Debt Display
    v_amount_paid := COALESCE(p_amount_paid, v_final_total_amount);
    v_underpayment := GREATEST(v_final_total_amount - v_amount_paid, 0);

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
        payment_method = p_payment_method, -- Store original text for display if needed
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

    -- 8. Update Customer Metrics & Balance (Robust Reconciliation)
    IF v_booking.customer_id IS NOT NULL THEN
        -- A. Check what was already charged to balance
        v_already_charged := 0;

        -- B. Check for Old Debt included in this bill (to avoid double charging)
        -- Logic: Sum up any service item with id 'old_debt' or 'debt-carry'
        SELECT COALESCE(SUM((item->>'total')::numeric), 0)
        INTO v_old_debt_included
        FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) item
        WHERE item->>'id' = '11111111-1111-1111-1111-111111111111' 
           OR item->>'id' = 'old_debt'
           OR item->>'id' = 'debt-carry';

        -- Use passed parameter if services array check fails (fallback)
        IF v_old_debt_included = 0 AND p_debt_carry_amount > 0 THEN
            v_old_debt_included := p_debt_carry_amount;
        END IF;

        -- C. Calculate New Charges to apply now
        -- Total Bill - Already Charged - Old Debt (which is already in balance)
        v_new_charges := v_final_total_amount - v_already_charged - v_old_debt_included;

        -- D. Update Balance
        -- New Balance = Old Balance + Payment - New Charges
        UPDATE public.customers
        SET 
            total_spent = COALESCE(total_spent, 0) + v_final_total_amount,
            visit_count = COALESCE(visit_count, 0) + 1,
            last_visit = NOW(),
            balance = COALESCE(balance, 0) + v_amount_paid - v_new_charges
        WHERE id = v_booking.customer_id
        RETURNING balance INTO v_new_balance;

        -- E. Log Payment Transaction
        IF v_amount_paid > 0 THEN
            INSERT INTO public.ledger(customer_id, booking_id, amount, type, category, description, payment_method_code, staff_id)
            VALUES (v_booking.customer_id, p_booking_id, v_amount_paid, 'PAYMENT', 'ROOM_BILL', 'Thanh toán trả phòng ' || p_booking_id, v_payment_code, v_staff_id);
        END IF;
        
        -- F. Log Revenue (Revenue is the New Charges)
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
        'new_balance', v_new_balance
    );

    RETURN v_result;
END;
$function$;

-- B. HANDLE DEPOSIT (Thu cọc)
CREATE OR REPLACE FUNCTION public.handle_deposit(
    p_booking_id uuid,
    p_amount numeric,
    p_method text,
    p_notes text DEFAULT NULL
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

    -- 2. Update Customer Balance (If customer exists)
    IF v_booking.customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET balance = COALESCE(balance, 0) + p_amount
        WHERE id = v_booking.customer_id;
    END IF;

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

-- C. HANDLE DEBT PAYMENT (Thu nợ cũ)
CREATE OR REPLACE FUNCTION public.handle_debt_payment(
    p_customer_id uuid,
    p_amount numeric,
    p_method text,
    p_cashier_id uuid,
    p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_new_balance numeric;
    v_payment_code text;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Số tiền trả phải lớn hơn 0';
    END IF;

    -- Map payment method
    v_payment_code := CASE 
        WHEN UPPER(p_method) IN ('TRANSFER', 'CK', 'BANK_TRANSFER') THEN 'BANK_TRANSFER'
        WHEN UPPER(p_method) IN ('CASH', 'TIEN_MAT') THEN 'CASH'
        WHEN UPPER(p_method) IN ('CARD', 'THE') THEN 'CARD'
        ELSE 'CASH'
    END;

    -- 1. Log to Ledger (PAYMENT / DEBT_COLLECTION)
    INSERT INTO public.ledger(
        customer_id, 
        staff_id,
        amount, 
        type, 
        category, 
        description, 
        payment_method_code
    )
    VALUES (
        p_customer_id, 
        p_cashier_id,
        p_amount, 
        'PAYMENT', 
        'DEBT_COLLECTION', 
        COALESCE(p_note, 'Khách trả nợ cũ'), 
        v_payment_code
    );

    -- 2. Update Customer Balance
    UPDATE public.customers
    SET balance = COALESCE(balance, 0) + p_amount
    WHERE id = p_customer_id
    RETURNING balance INTO v_new_balance;

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi trả nợ: ' || SQLERRM);
END;
$function$;
