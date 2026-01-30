-- Add penalty columns to bookings table
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS penalty_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS penalty_payment_method text DEFAULT 'cash';

-- Update the cancel_booking function again to be sure
CREATE OR REPLACE FUNCTION public.cancel_booking(
    p_booking_id uuid,
    p_verified_by_staff_id uuid DEFAULT NULL,
    p_verified_by_staff_name text DEFAULT NULL,
    p_penalty_amount numeric DEFAULT 0,
    p_penalty_payment_method text DEFAULT 'cash',
    p_reason text DEFAULT ''
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
        verified_by_staff_name = p_verified_by_staff_name,
        penalty_amount = p_penalty_amount,
        penalty_payment_method = p_penalty_payment_method,
        notes = COALESCE(notes, '') || E'\n[Cancelled] Reason: ' || p_reason
    WHERE id = p_booking_id;

    -- Update Room (Set to dirty instead of available)
    IF v_room_id IS NOT NULL THEN
        UPDATE public.rooms
        SET 
            status = 'dirty',
            current_booking_id = NULL,
            last_status_change = now(),
            updated_at = now() -- Update timestamp for dirty timer
        WHERE id = v_room_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Hủy phòng thành công');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$$;
