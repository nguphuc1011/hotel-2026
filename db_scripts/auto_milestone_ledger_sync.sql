-- REFACTOR & ENHANCE: Time-based Ledger Auto-Update
-- This script separates the sync logic and adds a "Refresh" capability for active bookings.

-- 1. Create a reusable function for syncing a booking to the ledger
CREATE OR REPLACE FUNCTION public.fn_sync_booking_to_ledger(p_booking_id uuid) 
RETURNS void AS $$
DECLARE
    v_bill jsonb;
    v_total_amount numeric;
    v_room_name text;
    v_status text;
BEGIN
    -- Only sync if checked in or completed
    SELECT status INTO v_status FROM public.bookings WHERE id = p_booking_id;
    IF v_status NOT IN ('checked_in', 'completed') THEN
        RETURN;
    END IF;

    -- Calculate the latest bill (Uses now() for active bookings)
    v_bill := public.calculate_booking_bill(p_booking_id);
    IF (v_bill->>'success')::boolean = false THEN
        RETURN;
    END IF;
    
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_room_name := v_bill->>'room_name';

    -- Update the auto-generated credit record in cash_flow
    UPDATE public.cash_flow 
    SET 
        amount = v_total_amount,
        description = 'Tổng phí phòng ' || COALESCE(v_room_name, '') || ' (Cập nhật tự động)',
        updated_at = now()
    WHERE 
        ref_id = p_booking_id 
        AND category = 'Tiền phòng' 
        AND payment_method_code = 'credit'
        AND is_auto = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update the Bookings Trigger to use the reusable function
CREATE OR REPLACE FUNCTION public.trg_sync_booking_to_cash_flow() RETURNS trigger AS $$
BEGIN
    PERFORM public.fn_sync_booking_to_ledger(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update the Services Trigger to use the reusable function
CREATE OR REPLACE FUNCTION public.trg_sync_service_to_cash_flow() RETURNS trigger AS $$
DECLARE
    v_booking_id uuid;
BEGIN
    v_booking_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.booking_id ELSE NEW.booking_id END;
    PERFORM public.fn_sync_booking_to_ledger(v_booking_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. NEW: Global Refresh Function (The "Automatic" Engine)
-- This can be called by a Cron job or manually from UI to "Tick" the clock.
CREATE OR REPLACE FUNCTION public.refresh_active_ledgers() 
RETURNS jsonb AS $$
DECLARE
    v_count int := 0;
    v_rec record;
BEGIN
    FOR v_rec IN 
        SELECT id FROM public.bookings 
        WHERE status = 'checked_in'
    LOOP
        PERFORM public.fn_sync_booking_to_ledger(v_rec.id);
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'refreshed_count', v_count,
        'timestamp', now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
