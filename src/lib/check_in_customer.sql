-- CHECK-IN CUSTOMER RPC
-- Created: 2026-01-12
-- Updated: 2026-01-15 (Resolved ambiguity, fixed room status logic)

-- Drop any ambiguous versions first
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, text, text, text, text, timestamp with time zone, numeric, text, jsonb, integer, integer, text, numeric, text, text, uuid);

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
SECURITY DEFINER
AS $$
DECLARE
    v_booking_id uuid;
    v_customer_id uuid;
    v_room_status text;
    v_check_in_at timestamptz := now();
BEGIN
    SELECT status INTO v_room_status FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi: Phòng không tồn tại.');
    END IF;
    IF v_room_status NOT IN ('available', 'dirty') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách hoặc chưa sẵn sàng.');
    END IF;

    IF p_customer_id IS NOT NULL THEN
        v_customer_id := p_customer_id;
    ELSIF p_customer_name IS NOT NULL THEN
        INSERT INTO public.customers (full_name)
        VALUES (p_customer_name)
        RETURNING id INTO v_customer_id;
    ELSE
        v_customer_id := NULL;
    END IF;

    INSERT INTO public.bookings (
        room_id,
        customer_id,
        rental_type,
        check_in_actual,
        deposit_amount,
        status,
        notes,
        services_used,
        extra_adults,
        extra_children,
        custom_price,
        custom_price_reason,
        source
    ) VALUES (
        p_room_id,
        v_customer_id,
        p_rental_type,
        v_check_in_at,
        p_deposit,
        'checked_in',
        p_notes,
        p_services,
        p_extra_adults,
        p_extra_children,
        p_custom_price,
        p_custom_price_reason,
        p_source
    ) RETURNING id INTO v_booking_id;

    UPDATE public.rooms
    SET
        status = 'occupied',
        current_booking_id = v_booking_id,
        last_status_change = v_check_in_at
    WHERE id = p_room_id;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id
    );
END;
$$;
