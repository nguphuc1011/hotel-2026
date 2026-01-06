-- 1. DROP old tables
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.cashflow CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.debt_transactions CASCADE;

-- 2. DROP columns from bookings
ALTER TABLE public.bookings 
DROP COLUMN IF EXISTS include_debt,
DROP COLUMN IF EXISTS merged_debt_amount,
DROP COLUMN IF EXISTS amount_paid;

-- 3. UPDATE handle_check_in RPC
CREATE OR REPLACE FUNCTION public.handle_check_in(
    p_room_id bigint,
    p_customer_id bigint,
    p_check_in_at timestamp with time zone,
    p_rental_type text,
    p_deposit_amount numeric DEFAULT 0,
    p_notes text DEFAULT NULL,
    p_services_used jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_booking_id bigint;
    v_customer_balance numeric;
BEGIN
    -- 1. Create Booking
    INSERT INTO public.bookings (
        room_id, customer_id, check_in_at, rental_type, 
        deposit_amount, notes, services_used, status
    ) VALUES (
        p_room_id, p_customer_id, p_check_in_at, p_rental_type,
        p_deposit_amount, p_notes, p_services_used, 'checked_in'
    ) RETURNING id INTO v_booking_id;

    -- 2. Update Room Status
    UPDATE public.rooms
    SET status = 'occupied',
        current_booking_id = v_booking_id
    WHERE id = p_room_id;

    -- 3. Handle Deposit (if any) -> Ledger
    IF p_deposit_amount > 0 THEN
        INSERT INTO public.ledger (
            customer_id, booking_id, type, amount, description
        ) VALUES (
            p_customer_id, v_booking_id, 'DEPOSIT', p_deposit_amount, 'Tiền cọc khi Check-in'
        );
        
        -- Update customer balance (Deposit increases balance/reduces debt)
        UPDATE public.customers
        SET balance = COALESCE(balance, 0) + p_deposit_amount
        WHERE id = p_customer_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$function$;

-- 4. UPDATE handle_checkout RPC
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id bigint,
    p_check_out_at timestamp with time zone,
    p_total_amount numeric,     -- Tổng bill (đã gồm phòng + dịch vụ + phụ thu + nợ gộp nếu có)
    p_actual_paid numeric,      -- Khách thực trả
    p_payment_method text,
    p_note text DEFAULT NULL,
    p_debt_carry_amount numeric DEFAULT 0 -- Số tiền "Nợ cũ mang sang" nằm trong p_total_amount
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_customer_id bigint;
    v_deposit numeric;
    v_real_revenue numeric;
    v_balance_change numeric;
BEGIN
    -- Get booking info
    SELECT customer_id, deposit_amount 
    INTO v_customer_id, v_deposit
    FROM public.bookings 
    WHERE id = p_booking_id;

    -- Calculate Real Revenue (Exclude Debt Carry)
    -- Revenue = Total Bill - Debt Carry
    -- Note: Deposit is already handled separately (it was a +balance event). 
    -- When checking out, we charge the Revenue (negative balance).
    v_real_revenue := p_total_amount - p_debt_carry_amount;

    -- 1. Update Booking
    UPDATE public.bookings
    SET status = 'checked_out',
        check_out_at = p_check_out_at,
        total_amount = p_total_amount,
        notes = COALESCE(notes, '') || CASE WHEN p_note IS NOT NULL THEN E'\nCheckout Note: ' || p_note ELSE '' END
    WHERE id = p_booking_id;

    -- 2. Update Room
    UPDATE public.rooms
    SET status = 'dirty',
        current_booking_id = NULL
    WHERE current_booking_id = p_booking_id;

    -- 3. Ledger: REVENUE (Charge the customer)
    -- This decreases balance.
    IF v_real_revenue > 0 THEN
        INSERT INTO public.ledger (
            customer_id, booking_id, type, amount, description
        ) VALUES (
            v_customer_id, p_booking_id, 'REVENUE', -v_real_revenue, 'Doanh thu phòng & dịch vụ'
        );
    END IF;

    -- 4. Ledger: PAYMENT (Customer pays)
    -- This increases balance.
    IF p_actual_paid > 0 THEN
        INSERT INTO public.ledger (
            customer_id, booking_id, type, amount, description
        ) VALUES (
            v_customer_id, p_booking_id, 'PAYMENT', p_actual_paid, 'Thanh toán trả phòng (' || p_payment_method || ')'
        );
    END IF;

    -- 5. Update Customer Balance
    -- Balance Change = Payment - Revenue
    v_balance_change := p_actual_paid - v_real_revenue;
    
    UPDATE public.customers
    SET balance = COALESCE(balance, 0) + v_balance_change
    WHERE id = v_customer_id;

    RETURN jsonb_build_object('success', true, 'new_balance', (SELECT balance FROM customers WHERE id = v_customer_id));
END;
$function$;
