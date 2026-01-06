-- Migration: Fix Financial Transactions, Debt Handling, and Checkout Logic
-- Date: 2026-01-04

-- 1. FIX TABLE SCHEMA
-- Add missing columns to financial_transactions if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='type') THEN
        ALTER TABLE public.financial_transactions ADD COLUMN type TEXT CHECK (type IN ('income','expense'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='financial_transactions' AND column_name='transaction_id') THEN
        ALTER TABLE public.financial_transactions ADD COLUMN transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 2. CLEAN UP BAD DATA
-- Remove invalid 'old_debt' items from bookings.services_used to prevent UUID casting errors
UPDATE public.bookings
SET services_used = (
  SELECT jsonb_agg(elem)
  FROM jsonb_array_elements(services_used) elem
  WHERE elem->>'id' <> 'old_debt'
)
WHERE services_used::text LIKE '%old_debt%';

-- 3. UPGRADE HANDLE_CHECKOUT FOR PARTIAL PAYMENTS & ROBUST DEBT RECONCILIATION
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_notes text DEFAULT NULL,
    p_payment_method text DEFAULT 'cash',
    p_surcharge numeric DEFAULT 0,
    p_total_amount numeric DEFAULT NULL,
    p_amount_paid numeric DEFAULT NULL -- New parameter: Actual amount paid by customer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking record;
    v_room_number text;
    v_checkout_details json;
    v_final_total_amount numeric;
    v_amount_paid numeric;
    v_underpayment numeric;
    v_room_charge numeric;
    v_service_charge numeric;
    v_service_item jsonb;
    v_service_id uuid;
    v_staff_name text;
    v_already_charged numeric;
    v_old_debt_included numeric;
    v_new_charges numeric;
    v_tx_id uuid;
BEGIN
    -- 1. Get booking and room info
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
    v_staff_name := COALESCE(v_staff_name, 'System');

    -- 2. Calculate Final Total Amount
    IF p_total_amount IS NOT NULL THEN
        v_final_total_amount := p_total_amount;
    ELSE
        BEGIN
            v_checkout_details := get_checkout_details(p_booking_id);
            v_final_total_amount := (v_checkout_details->>'total_amount')::numeric;
        EXCEPTION WHEN OTHERS THEN
            v_final_total_amount := 0;
        END;
    END IF;

    -- 3. Determine Amount Paid & Debt Display
    v_amount_paid := COALESCE(p_amount_paid, v_final_total_amount);
    v_underpayment := GREATEST(v_final_total_amount - v_amount_paid, 0); -- For UI display only

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

    -- 8. Update Customer Metrics & Balance (Robust Reconciliation)
    IF v_booking.customer_id IS NOT NULL THEN
        -- A. Check what was already charged to balance (e.g. by Night Audit)
        SELECT COALESCE(SUM(amount), 0) INTO v_already_charged
        FROM public.transactions
        WHERE booking_id = p_booking_id 
          AND type IN ('room_charge', 'service_charge')
          AND customer_id = v_booking.customer_id;

        -- B. Check for Old Debt included in this bill (to avoid double charging)
        SELECT COALESCE(SUM((item->>'total')::numeric), 0)
        INTO v_old_debt_included
        FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) item
        WHERE item->>'id' = '11111111-1111-1111-1111-111111111111' 
           OR item->>'id' = 'old_debt';

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
        WHERE id = v_booking.customer_id;

        -- E. Log Payment Transaction
        IF v_amount_paid > 0 THEN
            INSERT INTO public.transactions(id, customer_id, booking_id, type, amount, notes, created_at, meta)
            VALUES (gen_random_uuid(), v_booking.customer_id, p_booking_id, 'payment', v_amount_paid, 'Thanh toán checkout', now(), jsonb_build_object('source', 'checkout'))
            RETURNING id INTO v_tx_id;
             
            -- Cashflow log
            INSERT INTO public.financial_transactions(id, transaction_id, customer_id, type, method, amount, cashier, notes, created_at)
            VALUES (gen_random_uuid(), v_tx_id, v_booking.customer_id, 'income', p_payment_method, v_amount_paid, v_staff_name, 'Thu tiền checkout phòng ' || v_room_number, now());
        END IF;

        -- F. Log Remaining Charges Transaction (if any)
        IF v_new_charges > 0 THEN
             INSERT INTO public.transactions(id, customer_id, booking_id, type, amount, notes, created_at, meta)
            VALUES (gen_random_uuid(), v_booking.customer_id, p_booking_id, 'service_charge', v_new_charges, 'Các khoản phí checkout', now(), jsonb_build_object('source', 'checkout', 'details', 'remaining_charges'));
        END IF;
    END IF;

    -- 9. Inventory Management (Safe UUID Check)
    FOR v_service_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb))
    LOOP
        BEGIN
            v_service_id := (v_service_item->>'id')::uuid;
            IF v_service_id IS NOT NULL AND v_service_id <> '11111111-1111-1111-1111-111111111111'::uuid THEN
                UPDATE public.services
                SET stock = COALESCE(stock, 0) - (v_service_item->>'quantity')::numeric
                WHERE id = v_service_id;

                INSERT INTO public.stock_history (service_id, action_type, quantity, details)
                VALUES (v_service_id, 'EXPORT', (v_service_item->>'quantity')::numeric, jsonb_build_object('reason', 'Bán cho phòng ' || v_room_number));
            END IF;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Thanh toán hoàn tất', 
        'total_amount', v_final_total_amount, 
        'paid', v_amount_paid,
        'debt', v_underpayment
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$$;

NOTIFY pgrst, 'reload config';
