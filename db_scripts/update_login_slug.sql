-- UPDATE: fn_staff_login TRẢ VỀ CẢ SLUG ĐỂ FRONTEND CHUYỂN HƯỚNG ĐÚNG
CREATE OR REPLACE FUNCTION public.fn_staff_login(p_username text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_staff record;
BEGIN
    -- 1. Verify Credentials
    -- Kết hợp với bảng hotels để lấy slug
    SELECT 
        s.id, 
        s.username, 
        s.full_name, 
        s.role, 
        s.is_active, 
        s.pin_hash, 
        s.hotel_id,
        h.slug as hotel_slug
    FROM public.staff s
    JOIN public.hotels h ON s.hotel_id = h.id
    WHERE s.username = p_username
    INTO v_staff;

    IF v_staff.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tên đăng nhập không tồn tại');
    END IF;

    IF v_staff.is_active = false THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tài khoản đã bị khóa');
    END IF;

    -- Check PIN
    IF v_staff.pin_hash IS NULL OR v_staff.pin_hash <> p_pin THEN
        RETURN jsonb_build_object('success', false, 'message', 'Mã PIN không chính xác');
    END IF;

    -- 2. Success
    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Đăng nhập thành công',
        'data', jsonb_build_object(
            'id', v_staff.id,
            'username', v_staff.username,
            'full_name', v_staff.full_name,
            'role', v_staff.role,
            'hotel_id', v_staff.hotel_id,
            'hotel_slug', v_staff.hotel_slug
        )
    );
END;
$function$;
