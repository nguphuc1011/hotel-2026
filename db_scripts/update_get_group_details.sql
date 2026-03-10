-- [UPDATE] get_group_details RPC
-- Date: 2026-02-28
-- Description: Update get_group_details to support p_selected_child_ids parameter for Checklist Payment calculation.
--              Also exposes 'total_amount' and 'payable_amount' at the top level of room objects for easier FE access.

CREATE OR REPLACE FUNCTION public.get_group_details(
    p_booking_id uuid,
    p_selected_child_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 AS $$
 DECLARE
     v_master_id uuid;
     v_result jsonb;
     v_total_group_amount numeric := 0;
     v_selected_payable_total numeric := 0;
     v_rooms jsonb := '[]'::jsonb;
     v_room_record record;
     v_bill_data jsonb;
     v_is_selected boolean;
     v_room_total numeric;
     v_room_payable numeric;
 BEGIN
    RAISE NOTICE 'Executing get_group_details for booking ID: %', p_booking_id;
    -- 1. Identify Master ID
    SELECT COALESCE(parent_booking_id, id) INTO v_master_id
    FROM public.bookings 
    WHERE id = p_booking_id;
    
    -- Check if it's a valid group context
    IF v_master_id IS NULL THEN
         RETURN jsonb_build_object('is_group', false, 'message', 'Không tìm thấy booking hoặc booking không thuộc nhóm.');
    END IF;

    -- Check if master has children or is a child
    IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE parent_booking_id = v_master_id) 
       AND (SELECT parent_booking_id FROM public.bookings WHERE id = p_booking_id) IS NULL 
       AND v_master_id = p_booking_id THEN
        RETURN jsonb_build_object('is_group', false, 'message', 'Booking không phải là nhóm hoặc không có phòng con.');
    END IF;

    -- 2. Iterate through all group members (Master + Children)
    FOR v_room_record IN (
        SELECT 
            b.id as booking_id,
                    r.room_number as room_name,
            b.check_in_actual,
            b.status,
            CASE WHEN b.id = v_master_id THEN true ELSE false END as is_master
        FROM public.bookings b
        JOIN public.rooms r ON b.room_id = r.id
        WHERE b.id = v_master_id OR b.parent_booking_id = v_master_id
        ORDER BY b.check_in_actual ASC
    ) LOOP
        -- Calculate bill for each room
        v_bill_data := public.calculate_booking_bill(v_room_record.booking_id);
        
        -- Check for error from calculate_booking_bill
        IF v_bill_data->>'success' = 'false' THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'Lỗi khi tính hóa đơn cho phòng ' || v_room_record.room_name || ': ' || COALESCE(v_bill_data->>'message', 'Không xác định'),
                'context', 'get_group_details -> calculate_booking_bill',
                'booking_id', v_room_record.booking_id
            );
        END IF;

        v_room_total := COALESCE((v_bill_data->>'total_amount')::numeric, 0);
        v_room_payable := COALESCE((v_bill_data->>'amount_to_pay')::numeric, 0);

        -- Accumulate Total Group Amount (All members)
        v_total_group_amount := v_total_group_amount + v_room_total;

        -- Accumulate Selected Payable Total
        -- Logic: If p_selected_child_ids provided, only sum those.
        -- Note: Usually we only select Children to pay for. Master is always paying for itself?
        -- The UI logic adds `selectedGroupPayableTotal` to `currentTotal` (Master's own bill).
        -- So `selectedGroupPayableTotal` should only include the SELECTED CHILDREN.
        
        v_is_selected := false;
        IF p_selected_child_ids IS NOT NULL THEN
             IF v_room_record.booking_id = ANY(p_selected_child_ids) THEN
                 v_is_selected := true;
             END IF;
        END IF;

        IF v_is_selected THEN
            v_selected_payable_total := v_selected_payable_total + v_room_payable;
        END IF;

        -- Add to list
        v_rooms := v_rooms || jsonb_build_object(
            'booking_id', v_room_record.booking_id,
            'room_name', v_room_record.room_name,
            'is_master', v_room_record.is_master,
            'check_in_at', v_room_record.check_in_actual,
            'status', v_room_record.status,
            'total_amount', v_room_total,
            'payable_amount', v_room_payable,
            'bill_details', v_bill_data
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'is_group', true,
        'master_id', v_master_id,
        'total_group_amount', v_total_group_amount,
        'selected_payable_total', v_selected_payable_total,
        'rooms', v_rooms
    );
END;
$$;
