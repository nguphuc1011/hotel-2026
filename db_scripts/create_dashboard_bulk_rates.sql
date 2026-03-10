-- DASHBOARD BULK RATES WRAPPER
-- Mục đích: Gom nhiều lần gọi calculate_booking_bill trên Dashboard thành 1 lần
-- Lưu ý: KHÔNG thay đổi bất kỳ logic tính tiền nào, chỉ gọi lại hàm calculate_booking_bill

CREATE OR REPLACE FUNCTION public.get_dashboard_room_rates()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_results jsonb;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'booking_id', b.id,
            'room_id', b.room_id,
            'room_name', r.room_number,
            'status', b.status,
            'rental_type', b.rental_type,
            'check_in_at', b.check_in_actual,
            'total_amount', (bill->>'total_amount')::numeric,
            'duration_hours', (bill->>'duration_hours')::int,
            'duration_minutes', (bill->>'duration_minutes')::int,
            'rental_type_actual', bill->>'rental_type_actual',
            'explanation', bill->'explanation'
        )
    )
    INTO v_results
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    CROSS JOIN LATERAL public.calculate_booking_bill(b.id) AS bill
    WHERE b.status IN ('confirmed', 'checked_in');

    RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$;
