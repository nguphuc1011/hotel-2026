-- FIX: COMPLETE REMOVAL OF CREDIT CARD (QUẸT THẺ)
-- This script redefines all financial functions to ensure no trace of 'credit_card' remains.
-- It overrides previous versions (v3, v4, v5).

-- 1. Redefine process_checkout (Booking Service)
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

    -- Validate Payment Method (Strict check)
    IF p_payment_method NOT IN ('cash', 'transfer') THEN
         RETURN jsonb_build_object('success', false, 'message', 'Phương thức thanh toán không hợp lệ (Chỉ chấp nhận Tiền mặt hoặc Chuyển khoản)');
    END IF;

    UPDATE public.bookings SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, '')
    WHERE id = p_booking_id;

    -- Recalculate Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- Create Cash Flow Entries
    -- 1. Deposit Transfer (if any)
    IF v_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, 
            created_by, ref_id, is_auto, occurred_at,
            payment_method_code
        )
        VALUES (
            'IN', 'Chuyển cọc', v_deposit, 
            'Kết chuyển cọc khi trả phòng',
            v_staff_id, p_booking_id, true, now(),
            'deposit_transfer'
        );
    END IF;

    -- 2. Payment (Thanh toán)
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, 
            created_by, ref_id, is_auto, occurred_at,
            payment_method_code,
            verified_by_staff_id
        )
        VALUES (
            'IN', 'Thanh toán', p_amount_paid, 
            'Thanh toán trả phòng',
            v_staff_id, p_booking_id, true, now(),
            p_payment_method, -- 'cash' or 'transfer'
            p_staff_id
        );
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$function$;

-- 2. Redefine trg_update_wallets (Wallet Logic)
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
        ELSIF NEW.payment_method_code IN ('transfer', 'bank', 'qr') THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
        END IF;
        -- Logical: Escrow
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

    -- 4. REALIZED PAYMENTS (Thanh toán)
    IF NEW.category IN ('Thanh toán', 'Thu nợ cũ') THEN
        -- A. Physical
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
        ELSIF NEW.payment_method_code IN ('transfer', 'bank', 'qr') THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
        END IF;

        -- B. Revenue
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';
        
        -- C. Receivable Reduction
        IF NEW.flow_type = 'IN' THEN
            UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
        END IF;
        
        RETURN NEW;
    END IF;

    -- 5. EXPENSES (Chi vận hành)
    IF NEW.flow_type = 'OUT' AND NEW.category NOT IN ('Điều chỉnh') THEN
        -- Physical
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'CASH';
        ELSIF NEW.payment_method_code IN ('transfer', 'bank', 'qr') THEN
            UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'BANK';
        END IF;
        
        -- Revenue (P&L Reduction)
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'REVENUE';
        RETURN NEW;
    END IF;

    -- 6. ADJUSTMENTS (Điều chỉnh - Giảm nợ)
    IF NEW.category = 'Điều chỉnh' AND NEW.payment_method_code = 'credit' THEN
         UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';
         RETURN NEW;
    END IF;

    -- Fallback for other incomes
    IF NEW.flow_type = 'IN' THEN
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'CASH';
        ELSE
            UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'BANK';
        END IF;
        UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'REVENUE';
    END IF;

    RETURN NEW;
END;
$function$;
