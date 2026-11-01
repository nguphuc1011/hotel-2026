CREATE OR REPLACE FUNCTION public.fn_get_available_floors(p_hotel_id uuid DEFAULT NULL)
RETURNS TABLE(floor integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
    v_hotel_id uuid := COALESCE(p_hotel_id, public.fn_get_tenant_id());
BEGIN
    RETURN QUERY 
    SELECT DISTINCT r.floor 
    FROM public.rooms r 
    WHERE r.floor IS NOT NULL 
      AND (v_hotel_id IS NULL OR r.hotel_id = v_hotel_id)
    ORDER BY r.floor;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_get_all_user_floors_map(p_hotel_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, floors integer[])
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
    v_hotel_id uuid := COALESCE(p_hotel_id, public.fn_get_tenant_id());
BEGIN
    RETURN QUERY 
    SELECT uf.user_id, array_agg(uf.floor ORDER BY uf.floor)
    FROM public.user_floors uf
    WHERE (v_hotel_id IS NULL OR uf.hotel_id = v_hotel_id)
    GROUP BY uf.user_id;
END;
$$;
