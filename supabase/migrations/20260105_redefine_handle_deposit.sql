-- MIGRATION: REDEFINE FINANCIAL FUNCTIONS TO USE LEDGER
-- Date: 2026-01-05
-- Description: Redefine handle_deposit and handle_debt_payment to write to 'ledger' table instead of legacy 'transactions' table.
--              This is part of the "CỨU HỘ VÀ TÁI CẤU TRÚC" plan.

-- 1. DROP OLD FUNCTIONS (To ensure clean slate and avoid ambiguity)
DROP FUNCTION IF EXISTS public.handle_deposit(uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.handle_debt_payment(uuid, numeric, text, text, text);
DROP FUNCTION IF EXISTS public.handle_debt_payment(uuid, numeric, text, uuid, text); -- Drop potential signature mismatch

-- 2. HANDLE DEPOSIT (Thu cọc) - Uses Ledger
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
    v_room_number text;
    v_staff_id uuid;
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
        UPPER(p_method)
    );

    RETURN jsonb_build_object('success', true, 'message', 'Đã thu cọc thành công');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi thu cọc: ' || SQLERRM);
END;
$$;

-- 3. HANDLE DEBT PAYMENT (Thu nợ) - Uses Ledger
-- Note: Matches HotelService.payDebt signature (p_cashier_id)
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
AS $$
DECLARE
    v_new_balance numeric;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Số tiền trả phải lớn hơn 0';
    END IF;

    -- 1. Log to Ledger (PAYMENT / DEBT_COLLECTION)
    INSERT INTO public.ledger(
        customer_id, 
        staff_id,
        amount, 
        type, 
        category, 
        description, 
        payment_method
    )
    VALUES (
        p_customer_id, 
        p_cashier_id,
        p_amount, 
        'PAYMENT', 
        'DEBT_COLLECTION', 
        COALESCE(p_note, 'Khách trả nợ cũ'), 
        UPPER(p_method)
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
$$;

-- 4. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION public.handle_deposit TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_debt_payment TO authenticated, service_role;

-- 5. NOTIFY
NOTIFY pgrst, 'reload schema';
