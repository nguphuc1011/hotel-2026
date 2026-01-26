-- NIGHT AUDIT LOGIC (Real-time Financial Sync)
-- Created: 2026-01-26
-- This script handles the automated daily charge jump at 04:00 AM.

CREATE OR REPLACE FUNCTION public.fn_perform_night_audit(p_staff_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking RECORD;
    v_current_bill jsonb;
    v_total_charged numeric;
    v_new_amount numeric;
    v_count int := 0;
    v_total_amount numeric := 0;
    v_staff_name text;
    v_tz text := 'Asia/Ho_Chi_Minh';
BEGIN
    -- 1. Identify Staff
    IF p_staff_id IS NOT NULL THEN
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = p_staff_id;
    ELSE
        v_staff_name := 'SYSTEM (Night Audit)';
    END IF;

    -- 2. Find all active bookings
    FOR v_booking IN 
        SELECT b.id, b.room_id, b.rental_type, r.category_id, r.room_number
        FROM public.bookings b
        JOIN public.rooms r ON b.room_id = r.id
        WHERE b.status = 'checked_in'
    LOOP
        -- 3. Calculate total bill as of NOW
        v_current_bill := public.fn_calculate_room_charge(
            v_booking.id,
            v_booking.check_in_actual, 
            now(), 
            v_booking.rental_type,
            v_booking.category_id
        );
        
        -- 4. Get total already recorded in cash_flow (Credit or Cash/Bank)
        -- We only care about 'Tiền phòng' category for this booking
        SELECT COALESCE(SUM(amount), 0) INTO v_total_charged
        FROM public.cash_flow
        WHERE ref_id = v_booking.id 
          AND category = 'Tiền phòng'
          AND flow_type = 'IN';

        -- 5. If current bill > total recorded, record the difference
        v_new_amount := (v_current_bill->>'amount')::numeric - v_total_charged;

        IF v_new_amount > 0 THEN
            INSERT INTO public.cash_flow (
                flow_type, 
                category, 
                amount, 
                description, 
                payment_method_code,
                created_by, 
                verified_by_staff_id,
                verified_by_staff_name,
                ref_id, 
                is_auto, 
                occurred_at
            )
            VALUES (
                'IN', 
                'Tiền phòng', 
                v_new_amount, 
                format('Night Audit: Tăng tiền phòng cho ngày mới. Giải trình: %s', v_current_bill->>'explanation'), 
                'credit', -- Charge to RECEIVABLE
                COALESCE(p_staff_id, auth.uid()),
                p_staff_id,
                v_staff_name,
                v_booking.id, 
                true, 
                now()
            );
            
            v_count := v_count + 1;
            v_total_amount := v_total_amount + v_new_amount;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'bookings_processed', v_count,
        'total_amount_added', v_total_amount,
        'timestamp', now()
    );
END;
$$;
