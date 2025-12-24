-- Function to get all details for a checkout invoice.
-- Calculates room charge, service charges, and total amount securely on the server.

CREATE OR REPLACE FUNCTION get_checkout_details(p_booking_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_room record;
    v_room_charge numeric := 0;
    v_service_charges jsonb;
    v_total_amount numeric := 0;
    v_check_in_at timestamptz;
    v_now timestamptz := now();
    v_duration_interval interval;
    v_duration_string text;
    v_total_hours integer;
    v_time_rules jsonb;
BEGIN
    -- 1. Fetch the booking and the associated room
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    SELECT * INTO v_room FROM public.rooms WHERE id = v_booking.room_id;

    -- Get time rules from settings
    SELECT value INTO v_time_rules FROM public.settings WHERE key = 'time_rules';

    v_check_in_at := v_booking.check_in_at;
    v_duration_interval := v_now - v_check_in_at;

    -- 2. Calculate Room Charge based on rental_type
    IF v_booking.rental_type = 'hourly' THEN
        -- Hourly calculation
        v_total_hours := ceil(extract(epoch from v_duration_interval) / 3600);
        IF v_total_hours <= 1 THEN
            v_room_charge := (v_room.prices->>'hourly')::numeric;
        ELSE
            v_room_charge := (v_room.prices->>'hourly')::numeric + ((v_total_hours - 1) * (v_room.prices->>'next_hour')::numeric);
        END IF;

    ELSIF v_booking.rental_type = 'overnight' THEN
        -- Overnight calculation
        v_room_charge := (v_room.prices->>'overnight')::numeric;

    ELSIF v_booking.rental_type = 'daily' THEN
        -- Daily calculation
        DECLARE
            v_total_days integer;
        BEGIN
            v_total_days := ceil(extract(epoch from v_duration_interval) / 86400);
            v_room_charge := v_total_days * (v_room.prices->>'daily')::numeric;
        END;
    END IF;

    -- 3. Calculate Service Charges
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', s.name,
        'quantity', bs.quantity,
        'price', s.price,
        'total', bs.quantity * s.price
    )), '[]'::jsonb)
    INTO v_service_charges
    FROM public.booking_services bs
    JOIN public.services s ON bs.service_id = s.id
    WHERE bs.booking_id = p_booking_id;

    -- 4. Calculate Total Amount
    v_total_amount := v_room_charge + (
        SELECT COALESCE(SUM((item->>'total')::numeric), 0)
        FROM jsonb_array_elements(v_service_charges) as item
    );

    -- 5. Format duration string
    DECLARE
        total_minutes integer;
        days integer;
        hours integer;
        minutes integer;
    BEGIN
        total_minutes := extract(epoch from v_duration_interval) / 60;
        days := floor(total_minutes / 1440);
        hours := floor((total_minutes % 1440) / 60);
        minutes := total_minutes % 60;

        v_duration_string := '';
        IF days > 0 THEN
            v_duration_string := v_duration_string || days || ' ngày ';
        END IF;
        IF hours > 0 THEN
            v_duration_string := v_duration_string || hours || ' giờ ';
        END IF;
        v_duration_string := v_duration_string || minutes || ' phút';
    END;


    -- 6. Return the final JSON object
    RETURN json_build_object(
        'check_in_at', v_check_in_at,
        'duration_string', v_duration_string,
        'room_charge', v_room_charge,
        'service_charges', v_service_charges,
        'total_amount', v_total_amount
    );
END;
$$;