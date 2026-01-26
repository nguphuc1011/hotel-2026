-- FIX: COMPLETE FINANCIAL SYSTEM REBOOT (V3.1 - FIX COLUMN NAME ERROR)
-- Run this entire script in Supabase SQL Editor.
-- It fixes:
-- 1. The Trigger Logic (5-Fund)
-- 2. The Check-in Logic (Deposit -> Cash Flow) - FIXED 'room_number'
-- 3. The Checkout Logic (Charge -> Receivable -> Payment -> Revenue)

-- ==========================================================
-- PART 1: RESET TRIGGERS & FUNCTIONS
-- ==========================================================

-- Drop Trigger first
DROP TRIGGER IF EXISTS tr_update_wallets ON public.cash_flow;

-- Drop Function (and all overloads to avoid ambiguity)
DROP FUNCTION IF EXISTS public.trg_update_wallets();

-- ==========================================================
-- PART 2: THE 5-FUND TRIGGER (LOGIC CORE)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.trg_update_wallets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_amount numeric;
    v_sign integer;
BEGIN
    v_amount := COALESCE(NEW.amount, 0);
    
    -- Determine Sign based on Flow Type
    IF NEW.flow_type = 'IN' THEN
        v_sign := 1;
    ELSE
        v_sign := -1;
    END IF;

    -- 1. DEPOSIT (Tiền cọc)
    IF NEW.category = 'Tiền cọc' THEN
        -- Physical
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
        ELSIF NEW.payment_method_code IN ('transfer', 'credit_card', 'bank', 'qr') THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
        END IF;
        -- Logical
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'ESCROW';
        RETURN NEW;
    END IF;

    -- 2. CREDIT CHARGE (Ghi nợ - Increases Receivable)
    IF NEW.payment_method_code = 'credit' THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN NEW;
    END IF;

    -- 3. DEPOSIT TRANSFER (Cọc -> Doanh thu)
    IF NEW.payment_method_code = 'deposit_transfer' THEN
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'ESCROW';
        UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'REVENUE';
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN NEW;
    END IF;

    -- 4. REALIZED PAYMENTS & EXPENSES
    -- A. Physical
    IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
    ELSIF NEW.payment_method_code IN ('transfer', 'credit_card', 'bank', 'qr') THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
    END IF;

    -- B. Revenue (P&L)
    UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';

    -- C. Receivable Reduction (Only for Income)
    IF NEW.flow_type = 'IN' THEN
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
    END IF;

    RETURN NEW;
END;
$function$;

-- Re-attach Trigger
CREATE TRIGGER tr_update_wallets
    AFTER INSERT ON public.cash_flow
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_update_wallets();

-- ==========================================================
-- PART 3: CHECK-IN FUNCTION (Generates Deposit Record)
-- ==========================================================

-- Drop known overloads
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text);

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
    v_creator_id uuid;
    v_room_name text;
BEGIN
    v_creator_id := auth.uid();
    v_staff_id := COALESCE(p_verified_by_staff_id, v_creator_id);

    SELECT status, room_number INTO v_room_status, v_room_name FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Lỗi: Phòng không tồn tại.'); END IF;
    IF v_room_status NOT IN ('available', 'dirty') THEN RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách hoặc chưa sẵn sàng.'); END IF;

    IF p_customer_id IS NOT NULL THEN
        v_customer_id := p_customer_id;
    ELSIF p_customer_name IS NOT NULL THEN
        INSERT INTO public.customers (full_name) VALUES (p_customer_name) RETURNING id INTO v_customer_id;
    ELSE
        v_customer_id := NULL;
    END IF;

    INSERT INTO public.bookings (
        room_id, customer_id, rental_type, check_in_actual, deposit_amount, status,
        notes, services_used, extra_adults, extra_children, custom_price,
        custom_price_reason, source, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_room_id, v_customer_id, p_rental_type, v_check_in_at, p_deposit, 'checked_in',
        p_notes, p_services, p_extra_adults, p_extra_children, p_custom_price,
        p_custom_price_reason, p_source, v_staff_id, p_verified_by_staff_name
    ) RETURNING id INTO v_booking_id;

    UPDATE public.rooms SET status = 'occupied', current_booking_id = v_booking_id, last_status_change = v_check_in_at WHERE id = p_room_id;

    -- INSERT CASH FLOW FOR DEPOSIT
    IF p_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 'Tiền cọc', p_deposit, 
            'Thu tiền cọc phòng ' || COALESCE(v_room_name, '???'), 
            now(), 
            v_staff_id, -- Use Staff ID if auth.uid() is null
            v_staff_id, 
            v_booking_id, 
            true, 
            'cash'
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$function$;

-- ==========================================================
-- PART 4: CHECKOUT FUNCTION (Generates Charge + Payment)
-- ==========================================================

-- Drop known overloads
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
    v_creator_id uuid;
BEGIN
    v_creator_id := auth.uid();
    v_staff_id := COALESCE(p_staff_id, v_creator_id);
    
    SELECT room_id, customer_id INTO v_room_id, v_customer_id FROM public.bookings WHERE id = p_booking_id;
    IF v_room_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); END IF;

    UPDATE public.bookings SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, '')
    WHERE id = p_booking_id;

    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;
    v_room_name := v_bill->>'room_name';
    v_customer_name := v_bill->>'customer_name';

    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 1. RECORD CHARGE (Ghi nợ - Total Bill)
    INSERT INTO public.cash_flow (
        flow_type, category, amount, description, occurred_at, 
        created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
    ) VALUES (
        'IN', 'Tiền phòng', v_total_amount, 
        'Tổng phí phòng ' || COALESCE(v_room_name, '') || ' (Ghi nợ)', 
        now(), v_staff_id, v_staff_id, p_booking_id, true, 'credit'
    );

    -- 2. RECORD DEPOSIT TRANSFER (If Deposit Exists)
    IF v_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 'Chuyển cọc', v_deposit, 
            'Chuyển cọc tất toán ' || COALESCE(v_room_name, ''), 
            now(), v_staff_id, v_staff_id, p_booking_id, true, 'deposit_transfer'
        );
    END IF;

    -- 3. RECORD PAYMENT (Remaining Balance)
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 'Thanh toán', p_amount_paid, 
            'Thanh toán phòng ' || COALESCE(v_room_name, ''), 
            now(), v_staff_id, v_staff_id, p_booking_id, true, p_payment_method
        );
    END IF;

    -- Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now() WHERE id = v_customer_id;
    END IF;

    -- Audit Logs
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');
    UPDATE public.bookings SET billing_audit_trail = v_bill->'explanation' WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$;
