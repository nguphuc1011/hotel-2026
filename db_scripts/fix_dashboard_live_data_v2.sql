-- ====================================================================================
-- SCRIPT FIX LỖI HIỂN THỊ SƠ ĐỒ PHÒNG (DỮ LIỆU LIVE 100% NHƯ TRONG FOLIO)
-- ====================================================================================

-- Cập nhật fn_get_dashboard_data để tính toán tiền phòng LIVE thay vì đọc snapshot cũ
CREATE OR REPLACE FUNCTION public.fn_get_dashboard_data(p_hotel_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_hotel_id uuid;
    v_rooms jsonb; v_bookings jsonb; v_rates jsonb; v_wallets jsonb;
BEGIN
    -- 1. Xác định hotel_id
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());

    -- 2. Lấy danh sách phòng
    SELECT jsonb_agg(r_data) INTO v_rooms FROM (
        SELECT r.id, r.room_number, r.status, r.updated_at, r.notes, r.category_id, r.floor,
            jsonb_build_object(
                'id', rc.id, 
                'name', rc.name, 
                'price_hourly', rc.price_hourly, 
                'price_next_hour', rc.price_next_hour,
                'price_daily', rc.price_daily, 
                'price_overnight', rc.price_overnight, 
                'base_hourly_limit', rc.base_hourly_limit, 
                'hourly_unit', rc.hourly_unit
            ) as category
        FROM public.rooms r LEFT JOIN public.room_categories rc ON r.category_id = rc.id
        WHERE (v_hotel_id IS NULL OR r.hotel_id = v_hotel_id) ORDER BY r.room_number
    ) r_data;

    -- 3. Lấy dữ liệu tiền phòng LIVE (Gọi calculate_booking_bill trực tiếp để đảm bảo khớp 100% với Folio)
    SELECT jsonb_agg(rate_data) INTO v_rates FROM (
        SELECT 
            b.id as booking_id, 
            COALESCE((bill.bill_data->>'total_amount')::numeric, 0) as total_amount, 
            COALESCE((bill.bill_data->>'service_total')::numeric, 0) as service_total, 
            COALESCE((bill.bill_data->>'surcharge_amount')::numeric, 0) as surcharge_amount, 
            COALESCE((bill.bill_data->>'extra_person_charge')::numeric, 0) as extra_person_charge,
            COALESCE((bill.bill_data->>'discount_amount')::numeric, 0) as discount_amount,
            COALESCE((bill.bill_data->>'custom_surcharge')::numeric, 0) as custom_surcharge,
            COALESCE((bill.bill_data->>'duration_hours')::int, 0) as duration_hours, 
            COALESCE((bill.bill_data->>'duration_minutes')::int, 0) as duration_minutes, 
            COALESCE(bill.bill_data->>'rental_type_actual', b.rental_type) as rental_type_actual, 
            COALESCE(bill.bill_data->>'duration_text', 'Đang tính...') as duration_text, 
            COALESCE(public.fn_generate_pricing_ladder(b.id), '[]'::jsonb) as pricing_ladder,
            COALESCE(bill.bill_data->'explanation', '[]'::jsonb) as explanation
        FROM public.bookings b 
        CROSS JOIN LATERAL (SELECT public.calculate_booking_bill(b.id) as bill_data) bill
        WHERE b.status IN ('confirmed', 'checked_in', 'occupied') AND (v_hotel_id IS NULL OR b.hotel_id = v_hotel_id)
    ) rate_data;

    -- 4. Lấy danh sách Booking & Ví
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
