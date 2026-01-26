-- SYNC: Booking Services -> Cash Flow
-- Whenever a service is added, removed, or updated, update the corresponding "Ghi nợ" record in Cash Flow.

CREATE OR REPLACE FUNCTION public.trg_sync_service_to_cash_flow() RETURNS trigger AS $$
DECLARE
    v_booking_id uuid;
    v_bill jsonb;
    v_total_amount numeric;
    v_room_name text;
    v_status text;
BEGIN
    -- 1. Get booking ID
    IF (TG_OP = 'DELETE') THEN
        v_booking_id := OLD.booking_id;
    ELSE
        v_booking_id := NEW.booking_id;
    END IF;

    -- 2. Check booking status
    SELECT status INTO v_status FROM public.bookings WHERE id = v_booking_id;
    IF v_status NOT IN ('checked_in', 'completed') THEN
        RETURN NULL;
    END IF;

    -- 3. Calculate the latest bill
    v_bill := public.calculate_booking_bill(v_booking_id);
    IF (v_bill->>'success')::boolean = false THEN
        RETURN NULL;
    END IF;
    
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_room_name := v_bill->>'room_name';

    -- 4. Update the "Ghi nợ" record in cash_flow
    UPDATE public.cash_flow 
    SET 
        amount = v_total_amount,
        description = 'Tổng phí phòng ' || COALESCE(v_room_name, '') || ' (Cập nhật tự động)',
        updated_at = now()
    WHERE 
        ref_id = v_booking_id 
        AND category = 'Tiền phòng' 
        AND payment_method_code = 'credit'
        AND is_auto = true;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach Trigger to Booking Services
DROP TRIGGER IF EXISTS tr_sync_service_to_cash_flow ON public.booking_services;
CREATE TRIGGER tr_sync_service_to_cash_flow
    AFTER INSERT OR UPDATE OR DELETE ON public.booking_services
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_sync_service_to_cash_flow();
