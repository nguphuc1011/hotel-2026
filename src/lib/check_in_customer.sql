-- CHECK-IN CUSTOMER RPC
-- Created: 2026-01-12
-- Updated: 2026-01-15 (Resolved ambiguity, fixed room status logic)

-- Drop any ambiguous versions first
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text, uuid, text);

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
    p_source text DEFAULT 'direct',
    p_verified_by_staff_id uuid DEFAULT NULL,
    p_verified_by_staff_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking_id uuid;
    v_customer_id uuid;
    v_staff_id uuid;
    v_staff_name text;
    v_room_status text;
    v_room_name text;
    v_check_in_at timestamptz := now();
BEGIN
    -- Identify Staff
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;

    -- Get Room Info
    SELECT status, room_number INTO v_room_status, v_room_name FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi: Phòng không tồn tại.');
    END IF;
    IF v_room_status NOT IN ('available', 'dirty') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách hoặc chưa sẵn sàng.');
    END IF;

    -- Handle Customer
    IF p_customer_id IS NOT NULL THEN
        v_customer_id := p_customer_id;
    ELSIF p_customer_name IS NOT NULL THEN
        INSERT INTO public.customers (full_name)
        VALUES (p_customer_name)
        RETURNING id INTO v_customer_id;
    ELSE
        v_customer_id := NULL;
    END IF;

    -- 1. Create Booking
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
        source,
        verified_by_staff_id,
        verified_by_staff_name
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
        p_source,
        v_staff_id,
        COALESCE(p_verified_by_staff_name, v_staff_name)
    ) RETURNING id INTO v_booking_id;

    -- 2. Update Room Status
    UPDATE public.rooms
    SET
        status = 'occupied',
        current_booking_id = v_booking_id,
        last_status_change = v_check_in_at
    WHERE id = p_room_id;

    -- 3. INITIAL ROOM CHARGE (Ghi nhận nợ tức thời)
    -- Calculate initial charge based on check-in time
    DECLARE
        v_room_cat_id uuid;
        v_initial_bill jsonb;
        v_initial_amount numeric;
    BEGIN
        SELECT category_id INTO v_room_cat_id FROM public.rooms WHERE id = p_room_id;
        
        v_initial_bill := public.fn_calculate_room_charge(
            v_booking_id,
            v_check_in_at, 
            v_check_in_at, -- Initial charge is calculated at check-in point
            p_rental_type,
            v_room_cat_id
        );
        v_initial_amount := (v_initial_bill->>'amount')::numeric;

        IF v_initial_amount > 0 THEN
            INSERT INTO public.cash_flow (
                flow_type, 
                category, 
                amount, 
                description, 
                payment_method_code, -- Use 'credit' to increase RECEIVABLE
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
                v_initial_amount, 
                format('Ghi nhận nợ tiền phòng (%s) lúc nhận phòng: %s', p_rental_type, v_initial_bill->>'explanation'), 
                'credit',
                auth.uid(),
                v_staff_id,
                COALESCE(p_verified_by_staff_name, v_staff_name),
                v_booking_id, 
                true, 
                now()
            );
        END IF;
    END;

    -- 4. Record Cash Flow for Deposit (Modern audit)
    IF p_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, 
            category, 
            amount, 
            description, 
            created_by, 
            verified_by_staff_id,
            verified_by_staff_name,
            ref_id, 
            is_auto, 
            occurred_at
        )
        VALUES (
            'IN', 
            'Tiền cọc', 
            p_deposit, 
            'Tiền cọc phòng ' || COALESCE(v_room_name, ''), 
            auth.uid(),
            v_staff_id,
            COALESCE(p_verified_by_staff_name, v_staff_name),
            v_booking_id, 
            true, 
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', v_booking_id
    );
END;
$$;
