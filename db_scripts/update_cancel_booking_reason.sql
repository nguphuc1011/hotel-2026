-- Drop the existing 5-argument function to avoid signature conflict
DROP FUNCTION IF EXISTS public.cancel_booking(uuid, uuid, text, numeric, text);

-- Recreate with p_reason
CREATE OR REPLACE FUNCTION public.cancel_booking(
    p_booking_id uuid,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text,
    p_penalty_amount numeric DEFAULT 0,
    p_penalty_payment_method text DEFAULT 'cash'::text,
    p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_room_id uuid;
    v_status text;
    v_reversal_report jsonb;
    v_penalty_id uuid;
    v_room_name text;
BEGIN
    -- 1. Kiểm tra trạng thái Booking
    SELECT room_id, status INTO v_room_id, v_status
    FROM public.bookings
    WHERE id = p_booking_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Booking không tồn tại');
    END IF;

    IF v_status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Booking đã bị hủy trước đó');
    END IF;
    
    -- Get Room Name
    SELECT room_number INTO v_room_name FROM public.rooms WHERE id = v_room_id;

    -- 2. THỰC THI BÚT TOÁN ĐẢO (Gọi hàm Bằng Chứng Thép)
    v_reversal_report := public.fn_reverse_cash_flow_on_cancel(p_booking_id);

    IF NOT (v_reversal_report->>'success')::boolean THEN
        RETURN v_reversal_report;
    END IF;

    -- 3. XỬ LÝ TIỀN PHẠT (Nếu có)
    IF p_penalty_amount > 0 THEN
        INSERT INTO public.cash_flow (
            ref_id,
            flow_type,
            category,
            amount,
            payment_method_code,
            description,
            created_by,
            verified_by_staff_id,
            occurred_at
        ) VALUES (
            p_booking_id,
            'IN',
            'Phạt hủy phòng',
            p_penalty_amount,
            p_penalty_payment_method,
            'Tiền phạt hủy phòng ' || COALESCE(v_room_name, '') || '. Lý do: ' || COALESCE(p_reason, 'Không có'),
            p_verified_by_staff_id,
            p_verified_by_staff_id,
            now()
        ) RETURNING id INTO v_penalty_id;
    END IF;

    -- 4. Cập nhật trạng thái Booking
    -- Append reason to notes
    UPDATE public.bookings
    SET
        status = 'cancelled',
        verified_by_staff_id = p_verified_by_staff_id,
        verified_by_staff_name = p_verified_by_staff_name,
        notes = COALESCE(notes, '') || CASE WHEN p_reason IS NOT NULL AND p_reason <> '' THEN E'\n[Lý do hủy] ' || p_reason ELSE '' END
    WHERE id = p_booking_id;

    -- 5. Giải phóng phòng
    IF v_room_id IS NOT NULL THEN
        UPDATE public.rooms
        SET
            status = 'available',
            current_booking_id = NULL,
            last_status_change = now()
        WHERE id = v_room_id;
    END IF;

    -- 6. TRÌNH TẤU BÁO CÁO
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Hủy phòng thành công' || CASE WHEN p_penalty_amount > 0 THEN ' (Đã thu phạt ' || p_penalty_amount || ')' ELSE '' END,
        'reversal', v_reversal_report,
        'penalty_id', v_penalty_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống khi hủy phòng: ' || SQLERRM);
END;
$function$;
