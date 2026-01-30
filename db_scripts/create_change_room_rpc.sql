
-- Change Room RPC
-- Logic: Move booking to new room, update old room to dirty, new room to occupied.
-- Constraint: New room must be available.

CREATE OR REPLACE FUNCTION public.change_room(
    p_booking_id uuid,
    p_new_room_id uuid,
    p_reason text DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_old_room_id uuid;
    v_new_room_status text;
    v_new_room_name text;
    v_old_room_name text;
    v_customer_id uuid;
    v_staff_id uuid;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());

    -- 1. Get Booking & Old Room Info
    SELECT room_id, customer_id INTO v_old_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_old_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- 2. Validate New Room
    SELECT status, room_number INTO v_new_room_status, v_new_room_name
    FROM public.rooms
    WHERE id = p_new_room_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng mới không tồn tại');
    END IF;

    IF v_new_room_status != 'available' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng mới không sẵn sàng (Trạng thái: ' || v_new_room_status || ')');
    END IF;

    SELECT room_number INTO v_old_room_name FROM public.rooms WHERE id = v_old_room_id;

    -- 3. Update Booking
    UPDATE public.bookings
    SET room_id = p_new_room_id,
        notes = COALESCE(notes, '') || E'\n[' || now() || '] Đổi phòng từ ' || COALESCE(v_old_room_name, '???') || ' sang ' || v_new_room_name || '. Lý do: ' || COALESCE(p_reason, 'N/A')
    WHERE id = p_booking_id;

    -- 4. Update Old Room (Dirty)
    UPDATE public.rooms
    SET status = 'dirty',
        current_booking_id = NULL,
        updated_at = now()
    WHERE id = v_old_room_id;

    -- 5. Update New Room (Occupied)
    UPDATE public.rooms
    SET status = 'occupied',
        current_booking_id = p_booking_id,
        updated_at = now()
    WHERE id = p_new_room_id;

    -- 6. Log Audit
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, explanation)
    VALUES (
        p_booking_id, 
        v_customer_id, 
        p_new_room_id, 
        v_staff_id, 
        jsonb_build_object(
            'action', 'change_room',
            'old_room', v_old_room_name,
            'new_room', v_new_room_name,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object('success', true, 'message', 'Đổi phòng thành công từ ' || v_old_room_name || ' sang ' || v_new_room_name);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$function$;
