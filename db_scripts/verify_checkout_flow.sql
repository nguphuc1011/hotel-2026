-- FIX: CHECKOUT FLOW & DEPOSIT LIFECYCLE
-- Date: 2026-01-27
-- Author: Trae (AI Assistant)
-- Purpose: Ensure Deposit is moved from Escrow to Revenue upon Checkout.

-- ==========================================================
-- PART 1: UNIFY PROCESS_CHECKOUT
-- ==========================================================

-- Drop known overloads to avoid ambiguity
DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid, text);

CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid, 
    p_payment_method text, 
    p_amount_paid numeric, 
    p_discount numeric, 
    p_surcharge numeric, 
    p_notes text, 
    p_verified_by_staff_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_staff_id uuid;
    v_staff_name text;
    v_room_id uuid;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
    v_room_name text;
    v_customer_name text;
    v_creator_id uuid;
    v_already_charged numeric;
    v_diff numeric;
BEGIN
    v_creator_id := auth.uid();
    v_staff_id := COALESCE(p_verified_by_staff_id, v_creator_id);
    
    -- Get Staff Name
    SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;

    -- Get Booking Info
    SELECT room_id, customer_id INTO v_room_id, v_customer_id 
    FROM public.bookings 
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); 
    END IF;

    -- 1. Update Booking (Status, Discount, etc.)
    UPDATE public.bookings SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, ''),
        verified_by_staff_id = v_staff_id,
        verified_by_staff_name = COALESCE(v_staff_name, verified_by_staff_name)
    WHERE id = p_booking_id;

    -- 2. Calculate Final Bill (Source of Truth)
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;
    v_room_name := v_bill->>'room_name';
    v_customer_name := v_bill->>'customer_name';

    -- 3. Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- ==========================================================
    -- 4. ADJUST DEBT (Ensure Receivable matches Final Bill)
    -- ==========================================================
    SELECT COALESCE(SUM(amount), 0) INTO v_already_charged 
    FROM public.cash_flow 
    WHERE ref_id = p_booking_id 
      AND category IN ('Tiền phòng', 'Dịch vụ', 'Phụ thu')
      AND payment_method_code = 'credit';

    v_diff := v_total_amount - v_already_charged;

    IF v_diff <> 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, payment_method_code
        ) VALUES (
            CASE WHEN v_diff > 0 THEN 'IN' ELSE 'OUT' END, -- Adjust Debt Direction
            'Điều chỉnh', 
            ABS(v_diff), 
            'Điều chỉnh công nợ cuối cùng (Chênh lệch: ' || v_diff || ')', 
            now(), v_creator_id, v_staff_id, v_staff_name, p_booking_id, true, 'credit'
        );
    END IF;

    -- ==========================================================
    -- 5. RECORD DEPOSIT TRANSFER (Escrow -> Revenue)
    -- ==========================================================
    IF v_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 
            'Tiền cọc', -- Category
            v_deposit, 
            'Chuyển cọc tất toán phòng ' || COALESCE(v_room_name, ''), 
            now(), v_creator_id, v_staff_id, v_staff_name, p_booking_id, true, 
            'deposit_transfer' -- Special code handled by Trigger
        );
    END IF;

    -- ==========================================================
    -- 6. RECORD PAYMENT (Remaining Balance -> Revenue)
    -- ==========================================================
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, verified_by_staff_name, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 
            'Thanh toán', 
            p_amount_paid, 
            'Thanh toán phòng ' || COALESCE(v_room_name, '') || ' (' || COALESCE(p_payment_method, 'cash') || ')', 
            now(), v_creator_id, v_staff_id, v_staff_name, p_booking_id, true, 
            LOWER(p_payment_method) -- cash, bank, transfer...
        );
    END IF;

    -- 7. Update Customer Balance (Legacy)
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- 8. Audit Logs
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');
    
    UPDATE public.bookings SET billing_audit_trail = v_bill->'explanation' WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$;
