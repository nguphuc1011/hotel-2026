-- First, ensure you have an 'invoices' table.
-- You can create it with this command:
/*
CREATE TABLE public.invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES public.bookings(id),
    customer_id uuid REFERENCES public.customers(id),
    room_id uuid NOT NULL REFERENCES public.rooms(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    total_amount numeric NOT NULL,
    room_charge numeric NOT NULL,
    service_charge numeric NOT NULL,
    payment_method text,
    details jsonb
);
-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
-- Create policies (adjust as needed)
CREATE POLICY "Allow full access to service role" ON public.invoices FOR ALL USING (true) WITH CHECK (true);
*/

-- Updated handle_checkout function
CREATE OR REPLACE FUNCTION handle_checkout(p_booking_id uuid, p_payment_method text DEFAULT 'cash')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_room record;
    v_checkout_details json;
    v_total_amount numeric;
    v_room_charge numeric;
    v_service_charge numeric;
BEGIN
    -- 1. Get the booking and room details
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    SELECT * INTO v_room FROM public.rooms WHERE id = v_booking.room_id;

    -- Check if booking is already completed
    IF v_booking.status = 'completed' THEN
        RAISE EXCEPTION 'Booking has already been completed.';
    END IF;

    -- 2. Get calculated details from the new function
    v_checkout_details := get_checkout_details(p_booking_id);
    v_total_amount := (v_checkout_details->>'total_amount')::numeric;
    v_room_charge := (v_checkout_details->>'room_charge')::numeric;
    v_service_charge := v_total_amount - v_room_charge;

    -- 3. Update the booking status and check-out time
    UPDATE public.bookings
    SET 
        status = 'completed',
        check_out_at = now(),
        total_charge = v_total_amount,
        room_charge_locked = v_room_charge,
        service_charge_locked = v_service_charge
    WHERE id = p_booking_id;

    -- 4. Update the room status to 'dirty' and clear booking id
    UPDATE public.rooms
    SET 
        status = 'dirty',
        current_booking_id = NULL
    WHERE id = v_booking.room_id;

    -- 5. Create an invoice for record-keeping
    INSERT INTO public.invoices (booking_id, customer_id, room_id, total_amount, room_charge, service_charge, payment_method, details)
    VALUES (
        p_booking_id,
        v_booking.customer_id,
        v_booking.room_id,
        v_total_amount,
        v_room_charge,
        v_service_charge,
        p_payment_method,
        v_checkout_details
    );

    -- Optional: Update customer's total spent
    IF v_booking.customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET total_spent = total_spent + v_total_amount
        WHERE id = v_booking.customer_id;
    END IF;

END;
$$;
