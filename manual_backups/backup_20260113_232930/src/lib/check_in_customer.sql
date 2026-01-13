-- CHECK-IN CUSTOMER RPC
-- Created: 2026-01-12
-- Updated: 2026-01-12 (Added source, fixed check_in_at)
-- Supports Manual Extra Person Input

CREATE OR REPLACE FUNCTION public.check_in_customer(
    p_room_id uuid,
    p_rental_type text,
    p_customer_id uuid DEFAULT NULL,
    p_deposit numeric DEFAULT 0,
    p_services jsonb DEFAULT '[]'::jsonb,
    p_customer_name text DEFAULT NULL,
    p_extra_adults int DEFAULT 0,
    p_extra_children int DEFAULT 0,
    p_notes text DEFAULT NULL,
    p_custom_price numeric DEFAULT NULL,
    p_custom_price_reason text DEFAULT NULL,
    p_source text DEFAULT 'direct'
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_booking_id uuid;
    v_room_price numeric;
    v_check_in_time timestamptz := now();
    v_service jsonb;
BEGIN
    -- 1. Validate Room Status
    IF EXISTS (SELECT 1 FROM public.rooms WHERE id = p_room_id AND status = 'occupied') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách!');
    END IF;

    -- 2. Create Booking
    INSERT INTO public.bookings (
        room_id,
        customer_id,
        rental_type,
        check_in_at,
        deposit_amount,
        status,
        extra_adults,
        extra_children,
        notes,
        custom_price,
        custom_price_reason,
        source
    ) VALUES (
        p_room_id,
        p_customer_id,
        p_rental_type,
        v_check_in_time,
        p_deposit,
        'checked_in',
        p_extra_adults,
        p_extra_children,
        p_notes,
        p_custom_price,
        p_custom_price_reason,
        p_source
    ) RETURNING id INTO v_booking_id;

    -- 3. Update Room Status
    UPDATE public.rooms
    SET status = 'occupied'
    WHERE id = p_room_id;

    -- 4. Add Services (if any)
    -- Assuming p_services is array of {id, quantity, price}
    IF jsonb_array_length(p_services) > 0 THEN
        FOR v_service IN SELECT * FROM jsonb_array_elements(p_services)
        LOOP
            INSERT INTO public.service_usage (
                booking_id,
                service_id,
                quantity,
                price_at_booking
            ) VALUES (
                v_booking_id,
                (v_service->>'id')::uuid,
                (v_service->>'quantity')::int,
                (v_service->>'price')::numeric
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id,
        'message', 'Check-in thành công!'
    );
END;
$$;
