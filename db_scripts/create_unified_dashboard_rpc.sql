-- UNIFIED DASHBOARD DATA RPC
-- Tối ưu hóa: Lấy toàn bộ dữ liệu (Rooms, Bookings, Rates, Wallets) trong 1 lần gọi duy nhất
-- Giảm thiểu network overhead và frontend processing

CREATE OR REPLACE FUNCTION public.fn_get_dashboard_data(p_hotel_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
    v_hotel_id uuid;
    v_rooms jsonb;
    v_bookings jsonb;
    v_rates jsonb;
    v_wallets jsonb;
BEGIN
    -- Use provided hotel_id or fallback to current tenant (for SaaS isolation)
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());

    -- 1. Get Rooms with Categories
    SELECT jsonb_agg(r_data)
    INTO v_rooms
    FROM (
        SELECT 
            r.id, r.room_number, r.status, r.updated_at, r.notes, r.category_id, r.floor,
            jsonb_build_object(
                'id', rc.id,
                'name', rc.name,
                'price_hourly', rc.price_hourly,
                'price_daily', rc.price_daily,
                'price_overnight', rc.price_overnight,
                'base_hourly_limit', rc.base_hourly_limit,
                'hourly_unit', rc.hourly_unit
            ) as category
        FROM public.rooms r
        LEFT JOIN public.room_categories rc ON r.category_id = rc.id
        WHERE (v_hotel_id IS NULL OR r.hotel_id = v_hotel_id)
        ORDER BY r.room_number
    ) r_data;

    -- 2. Get Active Bookings with Customers
    SELECT jsonb_agg(b_data)
    INTO v_bookings
    FROM (
        SELECT 
            b.id, b.room_id, b.customer_id, b.rental_type, b.check_in_actual, b.status, 
            b.parent_booking_id, b.deposit_amount, b.notes,
            jsonb_build_object(
                'full_name', c.full_name,
                'balance', c.balance
            ) as customer
        FROM public.bookings b
        LEFT JOIN public.customers c ON b.customer_id = c.id
        WHERE b.status IN ('confirmed', 'checked_in', 'occupied')
        AND (v_hotel_id IS NULL OR b.hotel_id = v_hotel_id)
    ) b_data;

    -- 3. Get Rates (Calculated Amounts)
    SELECT jsonb_agg(rate_data)
    INTO v_rates
    FROM (
        SELECT 
            b.id as booking_id,
            (bill->>'total_amount')::numeric as total_amount,
            (bill->>'duration_hours')::int as duration_hours,
            (bill->>'duration_minutes')::int as duration_minutes,
            bill->>'rental_type_actual' as rental_type_actual,
            bill->'explanation' as explanation
        FROM public.bookings b
        CROSS JOIN LATERAL public.calculate_booking_bill(b.id) AS bill
        WHERE b.status IN ('confirmed', 'checked_in', 'occupied')
        AND (v_hotel_id IS NULL OR b.hotel_id = v_hotel_id)
    ) rate_data;

    -- 4. Get Wallets
    SELECT jsonb_agg(w)
    INTO v_wallets
    FROM public.wallets w
    WHERE (v_hotel_id IS NULL OR w.hotel_id = v_hotel_id);

    RETURN jsonb_build_object(
        'success', true,
        'rooms', COALESCE(v_rooms, '[]'::jsonb),
        'bookings', COALESCE(v_bookings, '[]'::jsonb),
        'rates', COALESCE(v_rates, '[]'::jsonb),
        'wallets', COALESCE(v_wallets, '[]'::jsonb)
    );
END;
$$;
