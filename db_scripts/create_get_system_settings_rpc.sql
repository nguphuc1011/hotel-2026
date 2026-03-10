-- UNIFIED SETTINGS RPC
-- Tối ưu hóa: Lấy toàn bộ cấu hình từ các cột của bảng settings dưới dạng JSON
-- Đảm bảo tương thích với SaaS Multi-tenant (hotel_id)

CREATE OR REPLACE FUNCTION public.get_system_settings(p_hotel_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
    v_hotel_id uuid;
    v_settings jsonb;
BEGIN
    -- Use provided hotel_id or fallback to current tenant
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());

    SELECT to_jsonb(s.*)
    INTO v_settings
    FROM public.settings s
    WHERE (v_hotel_id IS NULL OR s.hotel_id = v_hotel_id)
    AND key = 'config'
    LIMIT 1;

    RETURN COALESCE(v_settings, '{}'::jsonb);
END;
$$;
