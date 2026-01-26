-- SYNC: Bookings -> Cash Flow (Reactivity)
-- Whenever a booking's price-related fields change, update the corresponding "Ghi nợ" record in Cash Flow.

CREATE OR REPLACE FUNCTION public.trg_sync_booking_to_cash_flow() RETURNS trigger AS $$
DECLARE
    v_bill jsonb;
    v_total_amount numeric;
    v_room_name text;
BEGIN
    -- Only sync if checked in and not yet completed (or just completed)
    IF NEW.status NOT IN ('checked_in', 'completed') THEN
        RETURN NEW;
    END IF;

    -- 1. Calculate the latest bill
    v_bill := public.calculate_booking_bill(NEW.id);
    IF (v_bill->>'success')::boolean = false THEN
        RETURN NEW;
    END IF;
    
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_room_name := v_bill->>'room_name';

    -- 2. Update the "Ghi nợ" record in cash_flow
    -- We look for the auto-generated credit record for this booking
    UPDATE public.cash_flow 
    SET 
        amount = v_total_amount,
        description = 'Tổng phí phòng ' || COALESCE(v_room_name, '') || ' (Cập nhật tự động)',
        updated_at = now()
    WHERE 
        ref_id = NEW.id 
        AND category = 'Tiền phòng' 
        AND payment_method_code = 'credit'
        AND is_auto = true;

    -- 3. If no record found but guest is checked_in, we SHOULD have one.
    -- (Optional: Create one if missing, but for now we assume it exists from check-in)

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach Trigger to Bookings
DROP TRIGGER IF EXISTS tr_sync_booking_to_cash_flow ON public.bookings;
CREATE TRIGGER tr_sync_booking_to_cash_flow
    AFTER UPDATE OF 
        rental_type, check_in_actual, check_out_actual, 
        discount_amount, custom_surcharge, extra_adults, extra_children,
        custom_price
    ON public.bookings
    FOR EACH ROW
    WHEN (OLD.* IS DISTINCT FROM NEW.*)
    EXECUTE FUNCTION public.trg_sync_booking_to_cash_flow();
