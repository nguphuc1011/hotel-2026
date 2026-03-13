-- MIGRATION: UPDATE fn_get_dashboard_data TO RETURN FULL BILLING DATA
CREATE OR REPLACE FUNCTION public.fn_get_dashboard_data(p_hotel_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_hotel_id uuid;
    v_rooms jsonb; v_bookings jsonb; v_rates jsonb; v_wallets jsonb;
BEGIN
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());

    -- 1. Lấy danh sách phòng (Bổ sung price_next_hour)
    SELECT jsonb_agg(r_data) INTO v_rooms FROM (
        SELECT r.id, r.room_number, r.status, r.updated_at, r.notes, r.category_id, r.floor,
            jsonb_build_object(
                'id', rc.id, 
                'name', rc.name, 
                'price_hourly', rc.price_hourly, 
                'price_next_hour', rc.price_next_hour, -- Bổ sung
                'price_daily', rc.price_daily, 
                'price_overnight', rc.price_overnight, 
                'base_hourly_limit', rc.base_hourly_limit, 
                'hourly_unit', rc.hourly_unit
            ) as category
        FROM public.rooms r LEFT JOIN public.room_categories rc ON r.category_id = rc.id
        WHERE (v_hotel_id IS NULL OR r.hotel_id = v_hotel_id) ORDER BY r.room_number
    ) r_data;

    -- 2. Lấy dữ liệu tiền phòng (Đọc từ Snapshot - Đảm bảo đủ các trường billing)
    SELECT jsonb_agg(rate_data) INTO v_rates FROM (
        SELECT 
            b.id as booking_id, 
            COALESCE((s.snapshot_data->>'total_amount')::numeric, 0) as total_amount, 
            COALESCE((s.snapshot_data->>'service_total')::numeric, 0) as service_total, 
            COALESCE((s.snapshot_data->>'surcharge_amount')::numeric, 0) as surcharge_amount, 
            COALESCE((s.snapshot_data->>'extra_person_charge')::numeric, 0) as extra_person_charge,
            COALESCE((s.snapshot_data->>'discount_amount')::numeric, 0) as discount_amount,
            COALESCE((s.snapshot_data->>'custom_surcharge')::numeric, 0) as custom_surcharge,
            COALESCE((s.snapshot_data->>'duration_hours')::int, 0) as duration_hours, 
            COALESCE((s.snapshot_data->>'duration_minutes')::int, 0) as duration_minutes, 
            COALESCE(s.snapshot_data->>'rental_type_actual', b.rental_type) as rental_type_actual, 
            COALESCE(s.snapshot_data->>'duration_text', 'Đang tính...') as duration_text, 
            COALESCE(s.snapshot_data->'pricing_ladder', '[]'::jsonb) as pricing_ladder,
            COALESCE(s.snapshot_data->'explanation', '[]'::jsonb) as explanation
        FROM public.bookings b LEFT JOIN public.booking_snapshots s ON b.id = s.booking_id
        WHERE b.status IN ('confirmed', 'checked_in', 'occupied') AND (v_hotel_id IS NULL OR b.hotel_id = v_hotel_id)
    ) rate_data;

    -- 3. Lấy danh sách Booking & Ví
    SELECT jsonb_agg(b_data) INTO v_bookings FROM (
        SELECT b.id, b.room_id, b.customer_id, b.rental_type, b.check_in_actual, b.status, b.parent_booking_id, b.deposit_amount, b.notes,
            jsonb_build_object('full_name', c.full_name, 'balance', c.balance) as customer
        FROM public.bookings b LEFT JOIN public.customers c ON b.customer_id = c.id
        WHERE b.status IN ('confirmed', 'checked_in', 'occupied') AND (v_hotel_id IS NULL OR b.hotel_id = v_hotel_id)
    ) b_data;

    SELECT jsonb_agg(w) INTO v_wallets FROM public.wallets w WHERE (v_hotel_id IS NULL OR w.hotel_id = v_hotel_id);

    RETURN jsonb_build_object(
        'success', true, 
        'rooms', COALESCE(v_rooms, '[]'::jsonb), 
        'bookings', COALESCE(v_bookings, '[]'::jsonb), 
        'rates', COALESCE(v_rates, '[]'::jsonb), 
        'wallets', COALESCE(v_wallets, '[]'::jsonb)
    );
END;
$function$;
