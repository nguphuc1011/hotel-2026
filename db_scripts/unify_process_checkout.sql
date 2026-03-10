DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid, text);
DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid, text, uuid[]);

DROP FUNCTION IF EXISTS public.get_group_details(uuid);
DROP FUNCTION IF EXISTS public.get_group_details(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.get_group_details(
    p_booking_id uuid,
    p_selected_child_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_master_id uuid;
    v_children jsonb := '[]'::jsonb;
    v_members jsonb := '[]'::jsonb;
    v_child_total_payable numeric := 0;
    v_selected_total_payable numeric := 0;
    v_rec record;
    v_bill jsonb;
    v_total numeric;
    v_deposit numeric;
    v_payable numeric;
BEGIN
    SELECT COALESCE(parent_booking_id, id) INTO v_master_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_master_id IS NULL THEN
        RETURN jsonb_build_object('is_group', false);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE parent_booking_id = v_master_id)
       AND (SELECT parent_booking_id FROM public.bookings WHERE id = p_booking_id) IS NULL THEN
        RETURN jsonb_build_object('is_group', false);
    END IF;

    FOR v_rec IN (
        SELECT
            b.id AS booking_id,
            r.room_number AS room_name,
            b.status,
            (b.id = v_master_id) AS is_master
        FROM public.bookings b
        JOIN public.rooms r ON r.id = b.room_id
        WHERE b.id = v_master_id OR b.parent_booking_id = v_master_id
        ORDER BY b.check_in_actual ASC NULLS LAST
    ) LOOP
        v_bill := public.calculate_booking_bill(v_rec.booking_id, NULL);
        v_total := COALESCE((v_bill->>'total_amount')::numeric, 0);
        v_deposit := COALESCE((v_bill->>'deposit_amount')::numeric, 0);
        v_payable := v_total - v_deposit;

        v_members := v_members || jsonb_build_object(
            'booking_id', v_rec.booking_id,
            'room_name', v_rec.room_name,
            'is_master', v_rec.is_master,
            'status', v_rec.status,
            'total_amount', v_total,
            'deposit_amount', v_deposit,
            'payable_amount', v_payable
        );

        IF NOT v_rec.is_master AND v_rec.status NOT IN ('cancelled', 'completed', 'checked_out') THEN
            v_children := v_children || jsonb_build_object(
                'booking_id', v_rec.booking_id,
                'room_name', v_rec.room_name,
                'is_master', false,
                'status', v_rec.status,
                'total_amount', v_total,
                'deposit_amount', v_deposit,
                'payable_amount', v_payable
            );
            v_child_total_payable := v_child_total_payable + v_payable;

            IF p_selected_child_ids IS NULL OR v_rec.booking_id = ANY(p_selected_child_ids) THEN
                v_selected_total_payable := v_selected_total_payable + v_payable;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'is_group', true,
        'master_id', v_master_id,
        'members', v_members,
        'children', v_children,
        'group_payable_total', v_child_total_payable,
        'selected_payable_total', v_selected_total_payable,
        'selected_child_ids', COALESCE(p_selected_child_ids, '[]'::uuid[])
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid,
    p_payment_method text,
    p_amount_paid numeric,
    p_discount numeric,
    p_surcharge numeric,
    p_notes text,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text,
    p_selected_child_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_staff_id uuid;
    v_staff_name text;
    v_room_id uuid;
    v_room_name text;
    v_customer_id uuid;
    v_parent_id uuid;
    v_master_bill jsonb;
    v_master_total numeric;
    v_master_deposit numeric;
    v_total_payable numeric := 0;
    v_settled_child_ids uuid[] := ARRAY[]::uuid[];
    v_detached_child_ids uuid[] := ARRAY[]::uuid[];
    v_child record;
    v_child_bill jsonb;
    v_child_total numeric;
    v_child_deposit numeric;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());

    IF p_verified_by_staff_name IS NULL THEN
        SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_staff_id;
    ELSE
        v_staff_name := p_verified_by_staff_name;
    END IF;

    SELECT room_id, customer_id, parent_booking_id INTO v_room_id, v_customer_id, v_parent_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    SELECT room_number INTO v_room_name FROM public.rooms WHERE id = v_room_id;

    IF v_parent_id IS NOT NULL THEN
        UPDATE public.bookings
        SET parent_booking_id = NULL,
            updated_at = now()
        WHERE id = p_booking_id;
    END IF;

    UPDATE public.bookings
    SET
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, ''),
        verified_by_staff_id = v_staff_id,
        verified_by_staff_name = v_staff_name,
        updated_at = now()
    WHERE id = p_booking_id;

    UPDATE public.rooms
    SET status = 'dirty', updated_at = now()
    WHERE id = v_room_id;

    v_master_bill := public.calculate_booking_bill(p_booking_id, NULL);
    v_master_total := COALESCE((v_master_bill->>'total_amount')::numeric, 0);
    v_master_deposit := COALESCE((v_master_bill->>'deposit_amount')::numeric, 0);
    v_total_payable := v_master_total - v_master_deposit;

    IF p_selected_child_ids IS NOT NULL THEN
        SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_detached_child_ids
        FROM public.bookings
        WHERE parent_booking_id = p_booking_id
          AND NOT (id = ANY(p_selected_child_ids))
          AND status NOT IN ('cancelled', 'completed', 'checked_out');

        UPDATE public.bookings
        SET parent_booking_id = NULL,
            updated_at = now()
        WHERE parent_booking_id = p_booking_id
          AND NOT (id = ANY(p_selected_child_ids))
          AND status NOT IN ('cancelled', 'completed', 'checked_out');

        FOR v_child IN (
            SELECT id, room_id
            FROM public.bookings
            WHERE parent_booking_id = p_booking_id
              AND id = ANY(p_selected_child_ids)
              AND status NOT IN ('cancelled', 'completed', 'checked_out')
        ) LOOP
            UPDATE public.bookings
            SET
                status = 'completed',
                check_out_actual = now(),
                payment_method = 'group_settlement',
                notes = COALESCE(notes, '') || E'\n[Group Checkout] Settled by ' || COALESCE(v_room_name, ''),
                verified_by_staff_id = v_staff_id,
                verified_by_staff_name = v_staff_name,
                updated_at = now()
            WHERE id = v_child.id;

            UPDATE public.rooms
            SET status = 'dirty', updated_at = now()
            WHERE id = v_child.room_id;

            v_child_bill := public.calculate_booking_bill(v_child.id, NULL);
            v_child_total := COALESCE((v_child_bill->>'total_amount')::numeric, 0);
            v_child_deposit := COALESCE((v_child_bill->>'deposit_amount')::numeric, 0);
            v_total_payable := v_total_payable + (v_child_total - v_child_deposit);

            v_settled_child_ids := array_append(v_settled_child_ids, v_child.id);

            INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
            VALUES (v_child.id, v_customer_id, v_child.room_id, v_staff_id, v_child_total, v_child_bill->'explanation');

            UPDATE public.bookings
            SET billing_audit_trail = v_child_bill->'explanation',
                updated_at = now()
            WHERE id = v_child.id;
        END LOOP;
    ELSE
        FOR v_child IN (
            SELECT id, room_id
            FROM public.bookings
            WHERE parent_booking_id = p_booking_id
              AND status NOT IN ('cancelled', 'completed', 'checked_out')
        ) LOOP
            UPDATE public.bookings
            SET
                status = 'completed',
                check_out_actual = now(),
                payment_method = 'group_settlement',
                notes = COALESCE(notes, '') || E'\n[Group Checkout] Settled by ' || COALESCE(v_room_name, ''),
                verified_by_staff_id = v_staff_id,
                verified_by_staff_name = v_staff_name,
                updated_at = now()
            WHERE id = v_child.id;

            UPDATE public.rooms
            SET status = 'dirty', updated_at = now()
            WHERE id = v_child.room_id;

            v_child_bill := public.calculate_booking_bill(v_child.id, NULL);
            v_child_total := COALESCE((v_child_bill->>'total_amount')::numeric, 0);
            v_child_deposit := COALESCE((v_child_bill->>'deposit_amount')::numeric, 0);
            v_total_payable := v_total_payable + (v_child_total - v_child_deposit);

            v_settled_child_ids := array_append(v_settled_child_ids, v_child.id);

            INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
            VALUES (v_child.id, v_customer_id, v_child.room_id, v_staff_id, v_child_total, v_child_bill->'explanation');

            UPDATE public.bookings
            SET billing_audit_trail = v_child_bill->'explanation',
                updated_at = now()
            WHERE id = v_child.id;
        END LOOP;
    END IF;

    IF p_amount_paid > 0 THEN
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
            payment_method_code,
            occurred_at,
            customer_id
        ) VALUES (
            'IN',
            'Tiền phòng',
            p_amount_paid,
            'Thanh toán phòng ' || COALESCE(v_room_name, '') || ' (Checkout)',
            auth.uid(),
            v_staff_id,
            v_staff_name,
            p_booking_id,
            true,
            lower(COALESCE(p_payment_method, 'cash')),
            now(),
            v_customer_id
        );
    END IF;

    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET balance = COALESCE(balance, 0) + p_amount_paid - v_total_payable,
            updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_master_total, v_master_bill->'explanation');

    UPDATE public.bookings
    SET billing_audit_trail = v_master_bill->'explanation',
        updated_at = now()
    WHERE id = p_booking_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Check-out thành công',
        'bill', v_master_bill,
        'settled_child_ids', v_settled_child_ids,
        'detached_child_ids', v_detached_child_ids,
        'total_payable', v_total_payable
    );
END;
$function$;
