CREATE OR REPLACE FUNCTION public.fn_staff_login(p_username text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_staff record;
BEGIN
    -- 1. Verify Credentials (bao gồm hotel_id)
    SELECT id, username, full_name, role, status, pin_hash, hotel_id
    INTO v_staff
    FROM public.staff 
    WHERE username = p_username OR phone = p_username; -- Hỗ trợ đăng nhập bằng SĐT (Sale tạo)

    IF v_staff.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tên đăng nhập không tồn tại');
    END IF;

    IF v_staff.status = 'inactive' OR v_staff.status = 'suspended' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tài khoản đã bị khóa');
    END IF;

    -- Check PIN
    IF v_staff.pin_hash IS NULL OR v_staff.pin_hash <> p_pin THEN
        RETURN jsonb_build_object('success', false, 'message', 'Mã PIN không chính xác');
    END IF;

    -- 2. Standard Success
    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Đăng nhập thành công',
        'data', jsonb_build_object(
            'id', v_staff.id,
            'username', v_staff.username,
            'full_name', v_staff.full_name,
            'role', v_staff.role,
            'hotel_id', v_staff.hotel_id
        )
    );
END;
$function$;
