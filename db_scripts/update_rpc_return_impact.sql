-- FILE: c:\1hotel2\db_scripts\update_rpc_return_impact.sql
-- AUTHOR: AI Assistant
-- DATE: 2026-01-27
-- DESCRIPTION: Cập nhật RPC fn_create_cash_flow và process_checkout để trả về dữ liệu biến động ví (wallet_changes) trực tiếp.

-- =============================================
-- 1. CẬP NHẬT fn_create_cash_flow
-- =============================================
DROP FUNCTION IF EXISTS public.fn_create_cash_flow(text, text, numeric, text, timestamptz, uuid, text);
DROP FUNCTION IF EXISTS public.fn_create_cash_flow(text, text, numeric, text, timestamptz, uuid, text, text);

CREATE OR REPLACE FUNCTION public.fn_create_cash_flow(
    p_flow_type text, 
    p_category text, 
    p_amount numeric, 
    p_description text, 
    p_occurred_at timestamp with time zone DEFAULT now(),
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text,
    p_payment_method_code text DEFAULT 'cash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE 
    v_new_id uuid;
    v_wallet_changes jsonb := '[]'::jsonb;
    v_pm_code text;
BEGIN
    v_pm_code := lower(COALESCE(p_payment_method_code, 'cash'));

    -- 1. Insert Data (Trigger will handle actual update)
    INSERT INTO public.cash_flow (
        flow_type, category, amount, description, occurred_at, 
        created_by, verified_by_staff_id, verified_by_staff_name,
        payment_method_code
    )
    VALUES (
        p_flow_type, p_category, p_amount, 
        p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
        p_occurred_at, 
        COALESCE(p_verified_by_staff_id, auth.uid()),
        p_verified_by_staff_id,
        p_verified_by_staff_name,
        v_pm_code
    )
    RETURNING id INTO v_new_id;

    -- 2. Calculate Impact for Response (Simulation of Trigger Logic)
    -- A. Tiền cọc (Deposit)
    IF p_category = 'Tiền cọc' THEN
        -- Cash/Bank + Amount
        IF v_pm_code IN ('cash', 'tien mat', 'tiền mặt') THEN
            v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'CASH', 'diff', p_amount);
        ELSE
            v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'BANK', 'diff', p_amount);
        END IF;
        -- Escrow + Amount
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'ESCROW', 'diff', p_amount);
    
    -- B. Chuyển cọc (Deposit Transfer)
    ELSIF p_category = 'Chuyển cọc' OR v_pm_code = 'deposit_transfer' THEN
         v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'ESCROW', 'diff', -p_amount);
         v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'REVENUE', 'diff', p_amount);
         v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'RECEIVABLE', 'diff', -p_amount);
         
    -- C. Standard IN (Payment)
    ELSIF p_flow_type = 'IN' THEN
         -- Cash/Bank + Amount
        IF v_pm_code IN ('cash', 'tien mat', 'tiền mặt') THEN
            v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'CASH', 'diff', p_amount);
        ELSE
            v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'BANK', 'diff', p_amount);
        END IF;
         v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'REVENUE', 'diff', p_amount);
         v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'RECEIVABLE', 'diff', -p_amount);
         
    -- D. Standard OUT (Expense)
    ELSIF p_flow_type = 'OUT' THEN
         -- Cash/Bank - Amount
        IF v_pm_code IN ('cash', 'tien mat', 'tiền mặt') THEN
            v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'CASH', 'diff', -p_amount);
        ELSE
            v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'BANK', 'diff', -p_amount);
        END IF;
         v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'REVENUE', 'diff', -p_amount);
    END IF;
    
    RETURN jsonb_build_object('success', true, 'data', v_new_id, 'wallet_changes', v_wallet_changes);
END;
$function$;

-- =============================================
-- 2. CẬP NHẬT process_checkout
-- =============================================
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
    v_actual_payment_method text;
    v_wallet_changes jsonb := '[]'::jsonb;
    v_revenue_diff numeric := 0;
    v_receivable_diff numeric := 0;
    v_escrow_diff numeric := 0;
    v_cash_diff numeric := 0;
    v_bank_diff numeric := 0;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());
    v_actual_payment_method := lower(p_payment_method);
    
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
        payment_method = v_actual_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, '')
    WHERE id = p_booking_id;

    -- 2. Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- 3. Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 4. Record Cash Flow & Calculate Impact
    
    -- A. Kết chuyển cọc (Nếu có cọc)
    IF v_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, 
            created_by, ref_id, is_auto, occurred_at,
            payment_method_code
        )
        VALUES (
            'IN', 'Chuyển cọc', v_deposit, 
            'Kết chuyển cọc phòng ' || COALESCE(v_bill->>'room_name', '???'), 
            v_staff_id, p_booking_id, true, now(),
            'deposit_transfer'
        );
        -- Impact: Escrow -X, Revenue +X, Receivable -X
        v_escrow_diff := v_escrow_diff - v_deposit;
        v_revenue_diff := v_revenue_diff + v_deposit;
        v_receivable_diff := v_receivable_diff - v_deposit;
    END IF;

    -- B. Thanh toán phần còn lại (Nếu khách trả thêm)
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, 
            created_by, ref_id, is_auto, occurred_at,
            payment_method_code
        )
        VALUES (
            'IN', 'Thanh toán tiền phòng', p_amount_paid, 
            'Thanh toán Checkout phòng ' || COALESCE(v_bill->>'room_name', '???'), 
            v_staff_id, p_booking_id, true, now(),
            v_actual_payment_method
        );
        -- Impact: Cash/Bank +X, Revenue +X, Receivable -X
        IF v_actual_payment_method IN ('cash', 'tien mat', 'tiền mặt') THEN
            v_cash_diff := v_cash_diff + p_amount_paid;
        ELSE
            v_bank_diff := v_bank_diff + p_amount_paid;
        END IF;
        v_revenue_diff := v_revenue_diff + p_amount_paid;
        v_receivable_diff := v_receivable_diff - p_amount_paid;
    END IF;

    -- C. Build Response
    IF v_cash_diff <> 0 THEN
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'CASH', 'diff', v_cash_diff);
    END IF;
    IF v_bank_diff <> 0 THEN
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'BANK', 'diff', v_bank_diff);
    END IF;
    IF v_escrow_diff <> 0 THEN
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'ESCROW', 'diff', v_escrow_diff);
    END IF;
    IF v_revenue_diff <> 0 THEN
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'REVENUE', 'diff', v_revenue_diff);
    END IF;
    IF v_receivable_diff <> 0 THEN
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'RECEIVABLE', 'diff', v_receivable_diff);
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Checkout thành công', 
        'bill', v_bill,
        'wallet_changes', v_wallet_changes
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
