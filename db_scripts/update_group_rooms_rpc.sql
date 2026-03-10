CREATE OR REPLACE FUNCTION public.group_rooms(p_master_id uuid, p_child_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_master_status text;
    v_child_id uuid;
    v_child_status text;
    v_count int := 0;
BEGIN
    -- 2.1. Kiểm tra Phòng Cha
    SELECT status INTO v_master_status FROM public.bookings WHERE id = p_master_id;
    
    IF v_master_status IS NULL OR v_master_status = 'checked_out' OR v_master_status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng chính không hợp lệ hoặc đã trả phòng.');
    END IF;

    -- 2.2. Duyệt qua danh sách Phòng Con để gộp
    FOREACH v_child_id IN ARRAY p_child_ids
    LOOP
        -- Không cho phép gộp chính nó
        IF v_child_id = p_master_id THEN
            CONTINUE;
        END IF;

        -- Kiểm tra xem phòng con đã thuộc nhóm khác chưa
        IF (SELECT parent_booking_id FROM public.bookings WHERE id = v_child_id) IS NOT NULL THEN
            -- Nếu đã thuộc nhóm khác, bỏ qua phòng con này
            CONTINUE; 
        END IF;

        -- Kiểm tra trạng thái Phòng Con
        SELECT status INTO v_child_status FROM public.bookings WHERE id = v_child_id;

        IF v_child_status = 'checked_in' THEN
            -- Cập nhật parent_booking_id cho Phòng Con
            UPDATE public.bookings 
            SET parent_booking_id = p_master_id,
                updated_at = now()
            WHERE id = v_child_id;
            
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'message', format('Đã gộp thành công %s phòng vào phòng chính.', v_count));
END;
$function$;