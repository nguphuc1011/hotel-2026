
-- Function to handle the entire checkout process atomically.
CREATE OR REPLACE FUNCTION handle_checkout(
    p_booking_id UUID,
    p_total_amount NUMERIC,
    p_services_used JSONB, -- e.g. '[{"service_id": "...", "quantity": 2}, ...] '
    p_payment_method TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Important for RLS
AS $$
DECLARE
    v_room_id UUID;
    v_customer_id UUID;
    v_final_total NUMERIC;
    v_service_record JSONB;
    v_stock_change INT;
BEGIN
    -- 1. Get booking details
    SELECT room_id, customer_id, total_amount 
    INTO v_room_id, v_customer_id, v_final_total
    FROM bookings
    WHERE id = p_booking_id AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found or not active';
    END IF;

    -- Use provided total amount if it's valid, otherwise use the one from booking
    v_final_total := COALESCE(p_total_amount, v_final_total);

    -- 2. Update booking status
    UPDATE bookings
    SET 
        status = 'completed',
        check_out_at = NOW(),
        total_amount = v_final_total,
        services_used = p_services_used,
        payment_method = p_payment_method
    WHERE id = p_booking_id;

    -- 3. Update room status to 'dirty'
    UPDATE rooms
    SET 
        status = 'dirty',
        current_booking_id = NULL
    WHERE id = v_room_id;

    -- 4. Update customer total spent
    IF v_customer_id IS NOT NULL THEN
        UPDATE customers
        SET total_spent = total_spent + v_final_total
        WHERE id = v_customer_id;
    END IF;

    -- 5. Update stock for each service used
    FOR v_service_record IN SELECT * FROM jsonb_array_elements(p_services_used)
    LOOP
        v_stock_change := (v_service_record->>'quantity')::INT;

        -- Insert into stock history
        INSERT INTO stock_history (service_id, change, reason, booking_id)
        VALUES ((v_service_record->>'service_id')::UUID, -v_stock_change, 'sale', p_booking_id);

        -- Update current stock in services table
        UPDATE services
        SET stock = stock - v_stock_change
        WHERE id = (v_service_record->>'service_id')::UUID;
    END LOOP;

    -- 6. Return a confirmation
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Checkout successful',
        'booking_id', p_booking_id,
        'room_id', v_room_id
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and return a failure message
        RAISE NOTICE 'Error in handle_checkout: %', SQLERRM;
        RETURN jsonb_build_object(
            'success', false,
            'message', SQLERRM
        );
END;
$$;
