-- 1. Drop old redundant function (Rule 4, 6)
DROP FUNCTION IF EXISTS public.fn_create_cash_flow(text, text, numeric, text, timestamptz);

-- 2. Create Transactional Cancel Booking RPC (Rule 5)
CREATE OR REPLACE FUNCTION public.cancel_booking(
    p_booking_id uuid,
    p_verified_by_staff_id uuid DEFAULT NULL,
    p_verified_by_staff_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room_id uuid;
    v_status text;
BEGIN
    -- Check if booking exists and get status
    SELECT room_id, status INTO v_room_id, v_status
    FROM public.bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Booking không tồn tại');
    END IF;

    IF v_status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Booking đã bị hủy trước đó');
    END IF;

    IF v_status = 'checked_out' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không thể hủy Booking đã trả phòng');
    END IF;

    -- Update Booking
    UPDATE public.bookings
    SET 
        status = 'cancelled',
        verified_by_staff_id = p_verified_by_staff_id,
        verified_by_staff_name = p_verified_by_staff_name
    WHERE id = p_booking_id;

    -- Update Room (Reset to available)
    IF v_room_id IS NOT NULL THEN
        UPDATE public.rooms
        SET 
            status = 'available',
            current_booking_id = NULL,
            last_status_change = now()
        WHERE id = v_room_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Hủy phòng thành công');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$$;
