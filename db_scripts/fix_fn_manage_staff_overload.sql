-- Fix fn_manage_staff overloading and unify into a single clean function

DROP FUNCTION IF EXISTS public.fn_manage_staff(text, uuid, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.fn_manage_staff(text, uuid, text, text, text, text, boolean, uuid);

CREATE OR REPLACE FUNCTION public.fn_manage_staff(
    p_action text, 
    p_id uuid DEFAULT NULL::uuid, 
    p_username text DEFAULT NULL::text, 
    p_full_name text DEFAULT NULL::text, 
    p_role text DEFAULT NULL::text, 
    p_pin_hash text DEFAULT NULL::text, 
    p_is_active boolean DEFAULT true, 
    p_hotel_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_hotel_id uuid := COALESCE(p_hotel_id, public.fn_get_tenant_id());
BEGIN
    IF p_action = 'CREATE' THEN
        IF EXISTS (SELECT 1 FROM public.staff WHERE username = p_username AND (v_hotel_id IS NULL OR hotel_id = v_hotel_id)) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Tên đăng nhập đã tồn tại trong khách sạn này');
        END IF;
        
        INSERT INTO public.staff (username, full_name, role, is_active, pin_hash, password_hash, hotel_id)
        VALUES (p_username, p_full_name, p_role, p_is_active, p_pin_hash, 'PENDING_SETUP', v_hotel_id);
        
        RETURN jsonb_build_object('success', true, 'message', 'Thêm nhân viên thành công');
        
    ELSIF p_action = 'UPDATE' THEN
        UPDATE public.staff
        SET full_name = COALESCE(p_full_name, full_name),
            role = COALESCE(p_role, role),
            is_active = COALESCE(p_is_active, is_active),
            hotel_id = COALESCE(v_hotel_id, hotel_id)
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Cập nhật nhân viên thành công');
        
    ELSIF p_action = 'SET_PIN' THEN
        IF length(p_pin_hash) <> 4 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Mã PIN phải gồm đúng 4 chữ số');
        END IF;

        UPDATE public.staff
        SET pin_hash = p_pin_hash
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Cài đặt mã PIN thành công');
        
    ELSIF p_action = 'DELETE' THEN
        UPDATE public.staff SET is_active = false WHERE id = p_id;
        RETURN jsonb_build_object('success', true, 'message', 'Đã ngừng kích hoạt tài khoản nhân viên');
    END IF;
    
    RETURN jsonb_build_object('success', false, 'message', 'Hành động không hợp lệ');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_manage_staff(text, uuid, text, text, text, text, boolean, uuid) TO anon, authenticated, service_role;
