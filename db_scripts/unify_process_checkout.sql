-- FIX: UNIFY process_checkout AND REMOVE DUPLICATES
-- This script merges the best logic from all versions and aligns with Frontend parameters.

-- 1. DROP ALL OLD VERSIONS to eliminate redundancy
-- Version with p_staff_id (OID 31443)
DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid);
-- Version with p_verified_by_staff_id and p_verified_by_staff_name (OID 31366)
DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid, text);

-- 2. CREATE THE UNIFIED VERSION
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
    v_staff_role text;
    v_room_id uuid;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
    v_room_name text;
    v_creator_id uuid;
    v_already_charged numeric;
    v_diff numeric;
BEGIN
    v_creator_id := auth.uid();
    v_staff_id := COALESCE(p_verified_by_staff_id, v_creator_id);
    
    -- 0. Security Check: Validate Staff Role for Discount
    IF COALESCE(p_discount, 0) > 0 THEN
        SELECT role INTO v_staff_role FROM public.staff WHERE id = v_staff_id;
        IF v_staff_role IS NULL OR v_staff_role NOT IN ('admin', 'manager') THEN
             RETURN jsonb_build_object('success', false, 'message', 'Chỉ Quản lý mới có quyền giảm giá!');
        END IF;
    END IF;

    -- Get basic info
    SELECT room_id, customer_id INTO v_room_id, v_customer_id 
    FROM public.bookings 
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); 
    END IF;

    -- 1. Update Booking
    UPDATE public.bookings SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, ''),
        verified_by_staff_id = v_staff_id
    WHERE id = p_booking_id;

    -- 2. Calculate Final Bill (Source of Truth)
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;
    v_room_name := v_bill->>'room_name';

    -- 3. Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 4. ADJUST DEBT (Logic V5: Khai thác - Ghi nợ - Tất toán)
    -- So sánh tổng bill thực tế với những gì ĐÃ ghi nợ vào Quỹ Công Nợ (credit)
    SELECT COALESCE(SUM(amount), 0) INTO v_already_charged 
    FROM public.cash_flow 
    WHERE ref_id = p_booking_id 
      AND payment_method_code = 'credit'
      AND flow_type = 'IN';

    -- Tính chênh lệch (Phụ thu, giờ lố, dịch vụ phát sinh thêm...)
    v_diff := v_total_amount - v_already_charged;

    IF v_diff > 0 THEN
        -- Ghi nợ thêm
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 'Tiền phòng', v_diff, 
            'Phụ thu tất toán (Chênh lệch) ' || COALESCE(v_room_name, ''), 
            now(), v_creator_id, v_staff_id, p_booking_id, true, 'credit'
        );
    ELSIF v_diff < 0 THEN
        -- Giảm nợ (Nếu có giảm giá hoặc tính thừa)
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'OUT', 'Điều chỉnh', ABS(v_diff), 
            'Hoàn nợ thừa ' || COALESCE(v_room_name, ''), 
            now(), v_creator_id, v_staff_id, p_booking_id, true, 'credit'
        );
    END IF;

    -- 5. RECORD DEPOSIT TRANSFER (Nếu có tiền cọc)
    IF v_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 'Chuyển cọc', v_deposit, 
            'Chuyển cọc tất toán ' || COALESCE(v_room_name, ''), 
            now(), v_creator_id, v_staff_id, p_booking_id, true, 'deposit_transfer'
        );
    END IF;

    -- 6. RECORD PAYMENT (Thanh toán thực tế)
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 'Thanh toán', p_amount_paid, 
            'Thanh toán phòng ' || COALESCE(v_room_name, ''), 
            now(), v_creator_id, v_staff_id, p_booking_id, true, p_payment_method
        );
    END IF;

    -- 7. Update Customer Balance (Legacy support)
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now() WHERE id = v_customer_id;
    END IF;

    -- 8. Audit Logs
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');
    
    UPDATE public.bookings SET billing_audit_trail = v_bill->'explanation' WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$;
