-- Supabase RPC to handle the entire checkout process atomically.
-- This function ensures data integrity by using a transaction.

CREATE OR REPLACE FUNCTION handle_checkout(
    p_booking_id UUID,
    p_room_id UUID,
    p_total_amount NUMERIC,
    p_surcharge NUMERIC,
    p_services_total NUMERIC,
    p_room_total NUMERIC,
    p_payment_method TEXT,
    p_notes TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Important for RLS
AS $$
DECLARE
    v_customer_id UUID;
    v_invoice_id UUID;
    v_invoice_record RECORD;
BEGIN
    -- 1. Get the customer_id from the booking
    SELECT customer_id INTO v_customer_id FROM bookings WHERE id = p_booking_id;

    -- 2. Update the booking with checkout details
    UPDATE bookings
    SET
        status = 'completed',
        check_out_at = NOW(),
        total_amount = p_total_amount,
        surcharge = p_surcharge,
        services_total = p_services_total,
        room_total = p_room_total,
        payment_method = p_payment_method,
        notes = p_notes
    WHERE id = p_booking_id;

    -- 3. Update the room status to 'dirty' and clear current booking
    UPDATE rooms
    SET
        status = 'dirty',
        current_booking_id = NULL
    WHERE id = p_room_id;

    -- 4. Create a new invoice
    INSERT INTO invoices (booking_id, customer_id, total_amount, payment_method, status)
    VALUES (p_booking_id, v_customer_id, p_total_amount, p_payment_method, 'paid')
    RETURNING id INTO v_invoice_id;

    -- 5. (Optional) Update customer's total spent and visit count
    IF v_customer_id IS NOT NULL THEN
        UPDATE customers
        SET
            total_spent = total_spent + p_total_amount,
            last_visit_at = NOW()
            -- visit_count is handled on check-in to count new visits
        WHERE id = v_customer_id;
    END IF;

    -- 6. Return the newly created invoice details
    SELECT jsonb_build_object(
        'invoice_id', i.id,
        'created_at', i.created_at,
        'total_amount', i.total_amount
    ) INTO v_invoice_record
    FROM invoices i
    WHERE i.id = v_invoice_id;

    RETURN v_invoice_record;

EXCEPTION
    WHEN OTHERS THEN
        -- If any step fails, the transaction will be rolled back.
        RAISE WARNING 'Checkout failed, rolling back transaction. Error: %', SQLERRM;
        RETURN jsonb_build_object('error', SQLERRM);
END;
$$;
