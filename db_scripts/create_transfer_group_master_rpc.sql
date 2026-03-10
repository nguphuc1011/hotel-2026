CREATE OR REPLACE FUNCTION public.transfer_group_master(
    p_old_master_booking_id uuid,
    p_new_master_booking_id uuid,
    p_action_for_old_master text DEFAULT 'ungroup' -- 'become_child', 'ungroup', 'cancel'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_master_exists boolean;
    v_new_master_exists boolean;
    v_old_master_status text;
    v_new_master_status text;
    v_children_count integer;
    v_new_parent uuid;
BEGIN
    -- 1. Validate old master
    SELECT EXISTS(SELECT 1 FROM public.bookings WHERE id = p_old_master_booking_id),
           status
    INTO v_old_master_exists, v_old_master_status
    FROM public.bookings
    WHERE id = p_old_master_booking_id;

    IF NOT v_old_master_exists THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng chủ cũ không tồn tại.');
    END IF;

    -- Must have children to be considered a master
    SELECT COUNT(*) INTO v_children_count
    FROM public.bookings
    WHERE parent_booking_id = p_old_master_booking_id;

    IF v_children_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Booking cũ không phải là phòng chủ của nhóm.');
    END IF;

    -- 2. Validate new master
    SELECT EXISTS(SELECT 1 FROM public.bookings WHERE id = p_new_master_booking_id),
           status,
           parent_booking_id
    INTO v_new_master_exists, v_new_master_status, v_new_parent
    FROM public.bookings
    WHERE id = p_new_master_booking_id;

    IF NOT v_new_master_exists THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng chủ mới không tồn tại.');
    END IF;

    IF p_old_master_booking_id = p_new_master_booking_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng chủ cũ và mới không được trùng nhau.');
    END IF;

    IF v_new_master_status IN ('cancelled', 'checked_out') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng chủ mới không thể ở trạng thái đã hủy hoặc đã trả phòng.');
    END IF;

    -- New master must currently be a child of the old master group
    IF v_new_parent IS DISTINCT FROM p_old_master_booking_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng được chọn không thuộc nhóm của phòng chủ cũ.');
    END IF;

    -- 3. Transfer master role
    -- Promote new master (remove parent link)
    UPDATE public.bookings
    SET parent_booking_id = NULL
    WHERE id = p_new_master_booking_id;

    -- Reassign all children of old master to new master (exclude the promoted one)
    UPDATE public.bookings
    SET parent_booking_id = p_new_master_booking_id
    WHERE parent_booking_id = p_old_master_booking_id
      AND id <> p_new_master_booking_id;

    -- 4. Handle old master action
    IF p_action_for_old_master = 'become_child' THEN
        UPDATE public.bookings
        SET parent_booking_id = p_new_master_booking_id
        WHERE id = p_old_master_booking_id;
    ELSIF p_action_for_old_master = 'ungroup' THEN
        UPDATE public.bookings
        SET parent_booking_id = NULL
        WHERE id = p_old_master_booking_id;
    ELSIF p_action_for_old_master = 'cancel' THEN
        PERFORM public.cancel_booking(
            p_old_master_booking_id,
            NULL,
            NULL,
            0,
            'none',
            'Hủy tự động do chuyển phòng chủ'
        );
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Hành động không hợp lệ cho phòng chủ cũ.');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Chuyển phòng chủ thành công.');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$$;
