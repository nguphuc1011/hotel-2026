
-- FIX CHECKOUT LOGIC & WALLET TRIGGERS
-- 1. Update process_checkout to auto-create 'deposit_transfer'
-- 2. Update fn_apply_wallet_logic to handle 'deposit_transfer' (Escrow -> Revenue)
-- 3. Revert Accrual Revenue at Check-in (Keep Revenue as Cash Basis per Charter)

-- PART 1: UPDATE PROCESS_CHECKOUT
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
AS $$
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
        -- A. Payment (Tiền khách trả thêm)
        IF p_amount_paid > 0 THEN
            INSERT INTO public.cash_flow (
                flow_type, category, amount, description, created_by, ref_id, is_auto, occurred_at, payment_method_code
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

        -- B. Deposit Transfer (Chuyển cọc sang Doanh thu)
        IF v_deposit > 0 THEN
             INSERT INTO public.cash_flow (
                flow_type, category, amount, description, created_by, ref_id, is_auto, occurred_at, payment_method_code
            )
            VALUES (
                'IN', 
                'Chuyển cọc', 
                v_deposit, 
                'Chuyển tiền cọc sang Doanh thu phòng ' || COALESCE(v_bill->>'room_name', '???'), 
                v_staff_id, 
                p_booking_id, 
                true, 
                now(),
                'deposit_transfer'
            );
        END IF;

    EXCEPTION WHEN OTHERS THEN 
        INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
        VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, 0, to_jsonb(ARRAY['Lỗi ghi nhận dòng tiền: ' || SQLERRM]));
    END;

    -- 5. Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- 6. Record Audit Log
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');

    -- 7. Audit Trail
    UPDATE public.bookings 
    SET billing_audit_trail = v_bill->'explanation'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$$;

-- PART 2: UPDATE WALLET LOGIC
CREATE OR REPLACE FUNCTION public.fn_apply_wallet_logic(
    p_rec record,
    p_sign_multiplier integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_amount numeric := COALESCE(p_rec.amount, 0);
    v_flow_sign integer := CASE WHEN p_rec.flow_type = 'IN' THEN 1 ELSE -1 END;
    v_final_sign integer := v_flow_sign * p_sign_multiplier;      
    v_method text := lower(COALESCE(p_rec.payment_method_code, 'cash'));
BEGIN
    -- 1. CREDIT (Ghi nợ - Check-in): Chỉ Tăng Nợ (Receivable), KHÔNG Tăng Doanh thu (Cash Basis)
    IF v_method = 'credit' THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'RECEIVABLE';
        -- UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE'; -- DISABLE for Cash Basis
        RETURN;
    END IF;

    -- 2. DEPOSIT TRANSFER (Checkout): Escrow -> Revenue, và Giảm Nợ
    IF v_method = 'deposit_transfer' THEN
        -- Giảm Escrow
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'ESCROW';
        -- Tăng Revenue
        UPDATE public.wallets SET balance = balance + (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'REVENUE';
        -- Giảm Nợ (Receivable)
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN;
    END IF;

    -- 3. DEPOSIT (Tiền cọc - Check-in): Tăng Cash, Tăng Escrow (Giữ tiền, chưa tính Doanh thu)
    IF p_rec.category = 'Tiền cọc' THEN
        IF v_method = 'cash' THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'CASH';
        ELSE
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'BANK';
        END IF;
        
        -- Tăng Escrow (Thay vì giảm nợ ngay)
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'ESCROW';
        RETURN;
    END IF;

    -- 4. OWNER EQUITY
    IF v_method = 'owner_equity' THEN
         IF p_rec.category NOT IN ('Trả nợ') THEN
             UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE';
         END IF;
         RETURN;
    END IF;

    -- 5. STANDARD PAYMENT (Thanh toán): Tăng Cash + Tăng Revenue + Giảm Nợ
    -- A. Update Physical Wallet
    IF v_method = 'cash' THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'CASH';
    ELSE
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'BANK';
    END IF;

    -- B. Revenue & Debt
    IF p_rec.flow_type = 'IN' THEN
        -- Khách trả tiền -> Giảm nợ & Tăng Doanh thu
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'RECEIVABLE';
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE';
    ELSE
        -- Chi phí (OUT) -> Giảm Doanh thu
        IF p_rec.category NOT IN ('Trả nợ') THEN
             UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE';
        END IF;
    END IF;

END;
$$;
