-- [GROUP ROOMS] Migration Script
-- Date: 2026-02-27
-- Author: Trae (AI Architect)
-- Description: Thêm tính năng Gộp Phòng (Group Booking)
-- Logic: Sử dụng cột `parent_booking_id` trong bảng `bookings` để xác định quan hệ cha-con.
--        Phòng Cha (Master) sẽ chịu trách nhiệm thanh toán cho tất cả Phòng Con (Member).

-- 1. Thêm cột `parent_booking_id` vào bảng `bookings`
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS parent_booking_id uuid REFERENCES public.bookings(id);

-- Index cho cột này để truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_bookings_parent_id ON public.bookings(parent_booking_id);

-- 2. RPC: Gộp phòng (Group Rooms)
-- Input: p_master_id (Phòng Cha), p_child_ids (Danh sách các Phòng Con)
CREATE OR REPLACE FUNCTION public.group_rooms(
    p_master_id uuid,
    p_child_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

-- 3. RPC: Tách phòng (Ungroup Room)
-- Input: p_booking_id (Phòng cần tách ra khỏi nhóm)
CREATE OR REPLACE FUNCTION public.ungroup_room(
    p_booking_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.bookings 
    SET parent_booking_id = NULL,
        updated_at = now()
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Đã tách phòng khỏi nhóm thành công.');
END;
$$;

-- 4. RPC: Lấy danh sách phòng trong nhóm (Get Group Details)
-- Input: p_booking_id (Bất kỳ phòng nào trong nhóm)
-- Output: Danh sách chi tiết các phòng (Master + Children) và tổng tiền tạm tính
CREATE OR REPLACE FUNCTION public.get_group_details(
    p_booking_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_master_id uuid;
    v_result jsonb;
    v_total_group_amount numeric := 0;
    v_rooms jsonb := '[]'::jsonb;
    v_room_record record;
    v_bill_data jsonb;
BEGIN
    -- 4.1. Xác định Master ID
    -- Nếu p_booking_id có parent -> Lấy parent làm master
    -- Nếu p_booking_id không có parent nhưng là parent của người khác -> Chính là master
    -- Nếu độc lập -> Trả về null
    
    SELECT COALESCE(parent_booking_id, id) INTO v_master_id
    FROM public.bookings 
    WHERE id = p_booking_id;
    
    -- Kiểm tra xem v_master_id có thực sự là master của nhóm nào không (có con không?)
    IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE parent_booking_id = v_master_id) 
       AND (SELECT parent_booking_id FROM public.bookings WHERE id = p_booking_id) IS NULL THEN
        RETURN jsonb_build_object('is_group', false);
    END IF;

    -- 4.2. Duyệt qua tất cả thành viên trong nhóm (Master + Children)
    FOR v_room_record IN (
        SELECT 
            b.id as booking_id,
            r.name as room_name,
            b.check_in_at,
            b.status,
            CASE WHEN b.id = v_master_id THEN true ELSE false END as is_master
        FROM public.bookings b
        JOIN public.rooms r ON b.room_id = r.id
        WHERE b.id = v_master_id OR b.parent_booking_id = v_master_id
        ORDER BY b.check_in_at ASC
    ) LOOP
        -- Tính tiền riêng cho từng phòng để hiển thị
        -- Lưu ý: Hàm calculate_booking_bill trả về jsonb chi tiết
        v_bill_data := public.calculate_booking_bill(v_room_record.booking_id);
        
        -- Cộng dồn tổng tiền
        IF (v_bill_data->>'total_amount')::numeric IS NOT NULL THEN
            v_total_group_amount := v_total_group_amount + (v_bill_data->>'total_amount')::numeric;
        END IF;

        -- Thêm vào danh sách trả về
        v_rooms := v_rooms || jsonb_build_object(
            'booking_id', v_room_record.booking_id,
            'room_name', v_room_record.room_name,
            'is_master', v_room_record.is_master,
            'check_in_at', v_room_record.check_in_actual,
            'status', v_room_record.status,
            'bill_details', v_bill_data
        );
    END LOOP;

    RETURN jsonb_build_object(
        'is_group', true,
        'master_id', v_master_id,
        'total_group_amount', v_total_group_amount,
        'rooms', v_rooms
    );
END;
$$;
