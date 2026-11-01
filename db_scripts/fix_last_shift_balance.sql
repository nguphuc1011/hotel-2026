CREATE OR REPLACE FUNCTION public.get_last_shift_balance(p_hotel_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
    SELECT COALESCE(s.actual_cash, s.expected_cash, s.initial_cash, 0)
    FROM public.shifts s
    WHERE s.status = 'closed'
      AND s.hotel_id = COALESCE(p_hotel_id, public.fn_get_tenant_id())
    ORDER BY s.end_time DESC NULLS LAST
    LIMIT 1;
$$;
