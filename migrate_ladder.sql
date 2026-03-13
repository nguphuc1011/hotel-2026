CREATE OR REPLACE FUNCTION public.fn_generate_pricing_ladder(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_ladder jsonb := '[]'::jsonb;
    v_now timestamptz := now();
    v_test_time timestamptz;
    v_bill jsonb;
    v_i int;
BEGIN
    -- Mốc hiện tại
    v_bill := public.calculate_booking_bill(p_booking_id, v_now);
    v_ladder := v_ladder || jsonb_build_object('time', v_now, 'amount', v_bill->'total_amount');

    -- Mốc 15p tiếp theo (cho 2h tới - Phục vụ khách thuê giờ)
    FOR v_i IN 1..8 LOOP
        v_test_time := v_now + (v_i * interval '15 minutes');
        v_bill := public.calculate_booking_bill(p_booking_id, v_test_time);
        v_ladder := v_ladder || jsonb_build_object('time', v_test_time, 'amount', v_bill->'total_amount');
    END LOOP;

    -- Mốc mỗi 1h (cho 6h tới)
    FOR v_i IN 3..6 LOOP
        v_test_time := v_now + (v_i * interval '1 hour');
        v_bill := public.calculate_booking_bill(p_booking_id, v_test_time);
        v_ladder := v_ladder || jsonb_build_object('time', v_test_time, 'amount', v_bill->'total_amount');
    END LOOP;

    RETURN v_ladder;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_booking_snapshot(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_bill JSONB;
    v_ladder JSONB;
    v_hotel_id UUID;
BEGIN
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_ladder := public.fn_generate_pricing_ladder(p_booking_id);
    
    -- Tích hợp Ladder vào Snapshot
    v_bill := v_bill || jsonb_build_object('pricing_ladder', v_ladder);

    SELECT hotel_id INTO v_hotel_id FROM public.bookings WHERE id = p_booking_id;

    INSERT INTO public.booking_snapshots (booking_id, hotel_id, snapshot_data, updated_at)
    VALUES (p_booking_id, v_hotel_id, v_bill, now())
    ON CONFLICT (booking_id) DO UPDATE SET 
        snapshot_data = EXCLUDED.snapshot_data,
        updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_room(
    p_booking_id uuid, 
    p_new_room_id uuid, 
    p_reason text DEFAULT NULL, 
    p_staff_id uuid DEFAULT NULL,
    p_price_mode text DEFAULT 'USE_NEW' -- 'KEEP_OLD' | 'USE_NEW'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_old_room_id uuid;
    v_new_room_status text;
    v_new_room_name text;
    v_old_room_name text;
    v_customer_id uuid;
    v_staff_id uuid;
    v_old_cat_id uuid;
    v_old_price_hourly numeric;
    v_old_price_daily numeric;
    v_old_price_overnight numeric;
    v_rental_type text;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());

    -- 1. Get Booking & Old Room Info
    SELECT room_id, customer_id, rental_type INTO v_old_room_id, v_customer_id, v_rental_type
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_old_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- 2. Validate New Room
    SELECT status, room_number INTO v_new_room_status, v_new_room_name
    FROM public.rooms
    WHERE id = p_new_room_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng mới không tồn tại');
    END IF;

    IF v_new_room_status != 'available' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng mới không sẵn sàng (Trạng thái: ' || v_new_room_status || ')');
    END IF;

    SELECT room_number, category_id INTO v_old_room_name, v_old_cat_id FROM public.rooms WHERE id = v_old_room_id;

    -- 3. Logic: Keep Old Price
    IF p_price_mode = 'KEEP_OLD' THEN
        SELECT price_hourly, price_daily, price_overnight 
        INTO v_old_price_hourly, v_old_price_daily, v_old_price_overnight
        FROM public.room_categories WHERE id = v_old_cat_id;

        UPDATE public.bookings
        SET custom_price = CASE 
                WHEN v_rental_type = 'hourly' THEN v_old_price_hourly
                WHEN v_rental_type = 'overnight' THEN v_old_price_overnight
                ELSE v_old_price_daily
            END,
            custom_price_reason = 'Giữ giá cũ khi đổi phòng'
        WHERE id = p_booking_id;
    ELSE
        -- USE_NEW: Clear custom price to use new room's category price
        UPDATE public.bookings
        SET custom_price = NULL,
            custom_price_reason = NULL
        WHERE id = p_booking_id;
    END IF;

    -- 4. Update Booking Room
    UPDATE public.bookings
    SET room_id = p_new_room_id,
        notes = COALESCE(notes, '') || E'\n[' || now() || '] Đổi phòng từ ' || COALESCE(v_old_room_name, '???') || ' sang ' || v_new_room_name || '. Giá: ' || p_price_mode || '. Lý do: ' || COALESCE(p_reason, 'N/A')
    WHERE id = p_booking_id;

    -- 5. Update Old Room (Dirty)
    UPDATE public.rooms
    SET status = 'dirty',
        current_booking_id = NULL,
        updated_at = now()
    WHERE id = v_old_room_id;

    -- 6. Update New Room (Occupied)
    UPDATE public.rooms
    SET status = 'occupied',
        current_booking_id = p_booking_id,
        updated_at = now()
    WHERE id = p_new_room_id;

    -- 7. Log Audit
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, explanation)
    VALUES (
        p_booking_id, 
        v_customer_id, 
        p_new_room_id, 
        v_staff_id, 
        jsonb_build_object(
            'action', 'change_room',
            'old_room', v_old_room_name,
            'new_room', v_new_room_name,
            'price_mode', p_price_mode,
            'reason', p_reason
        )
    );

    -- Force snapshot update to reflect new price/room immediately
    PERFORM public.fn_update_booking_snapshot(p_booking_id);

    RETURN jsonb_build_object('success', true, 'message', 'Đổi phòng thành công từ ' || v_old_room_name || ' sang ' || v_new_room_name);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$$;
