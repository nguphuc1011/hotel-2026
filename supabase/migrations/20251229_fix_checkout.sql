-- 1. Add missing columns to bookings
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='total_amount') THEN
        ALTER TABLE bookings ADD COLUMN total_amount NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='final_amount') THEN
        ALTER TABLE bookings ADD COLUMN final_amount NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='surcharge') THEN
        ALTER TABLE bookings ADD COLUMN surcharge NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='payment_method') THEN
        ALTER TABLE bookings ADD COLUMN payment_method TEXT;
    END IF;
END $$;

-- 2. Define or Update resolve_checkout RPC
-- Xóa function cũ nếu tồn tại để tránh lỗi thay đổi tham số mặc định
DROP FUNCTION IF EXISTS resolve_checkout(uuid, text, numeric, numeric, numeric, text, uuid, boolean);
DROP FUNCTION IF EXISTS resolve_checkout(uuid, text, numeric, numeric, numeric, text, uuid);

CREATE OR REPLACE FUNCTION resolve_checkout(
    p_booking_id UUID,
    p_payment_method TEXT,
    p_total_amount NUMERIC,
    p_final_amount NUMERIC,
    p_surcharge NUMERIC,
    p_notes TEXT,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room_id UUID;
    v_customer_id UUID;
    v_current_status TEXT;
BEGIN
    -- Get booking info
    SELECT room_id, customer_id, status INTO v_room_id, v_customer_id, v_current_status
    FROM bookings WHERE id = p_booking_id;

    IF v_current_status IS NULL THEN
         RETURN jsonb_build_object('success', false, 'message', 'Booking not found');
    END IF;

    IF v_current_status = 'completed' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Booking already completed');
    END IF;

    -- Update booking
    UPDATE bookings
    SET 
        status = 'completed',
        check_out_at = NOW(),
        total_amount = p_total_amount,
        final_amount = p_final_amount,
        surcharge = p_surcharge,
        payment_method = p_payment_method,
        notes = p_notes
    WHERE id = p_booking_id;

    -- Update room: Luôn chuyển sang 'dirty' sau khi thanh toán (Khách đi -> Phòng dơ)
    UPDATE rooms
    SET status = 'dirty', current_booking_id = NULL
    WHERE id = v_room_id;

    -- Update customer stats
    IF v_customer_id IS NOT NULL THEN
        UPDATE customers
        SET total_spent = COALESCE(total_spent, 0) + p_final_amount
        WHERE id = v_customer_id;
    END IF;

    RETURN jsonb_build_object('success', true);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
