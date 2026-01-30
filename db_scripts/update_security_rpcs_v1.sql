-- Migration: Update Security RPCs to support policy_type
-- Created: 2026-01-29

CREATE OR REPLACE FUNCTION public.fn_get_security_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result jsonb;
BEGIN
    -- Trả về object: { "key": "policy_type" }
    SELECT jsonb_object_agg(key, policy_type)
    INTO v_result
    FROM public.settings_security;
    
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_security_setting(
    p_key text,
    p_policy_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate policy_type
    IF p_policy_type NOT IN ('ALLOW', 'PIN', 'APPROVAL', 'DENY') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Loại chính sách không hợp lệ');
    END IF;

    UPDATE public.settings_security
    SET policy_type = p_policy_type,
        -- Đồng bộ ngược lại is_enabled để các logic cũ (nếu còn) không bị gãy
        is_enabled = (p_policy_type <> 'ALLOW'),
        updated_at = NOW()
    WHERE key = p_key;
    
    RETURN jsonb_build_object('success', true, 'message', 'Cập nhật cấu hình bảo mật thành công');
END;
$$;
