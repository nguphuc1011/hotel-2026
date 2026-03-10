CREATE OR REPLACE FUNCTION public.get_booking_bill_for_frontend(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_bill jsonb;
BEGIN
    v_bill := public.calculate_booking_bill(p_booking_id);
    RETURN v_bill;
END;
$$;