-- Cập nhật fn_get_tenant_id để ưu tiên lấy hotel_id từ JWT token
CREATE OR REPLACE FUNCTION public.fn_get_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $$
DECLARE
    v_jwt jsonb;
    v_id text;
BEGIN
    -- 1. Ưu tiên lấy từ JWT claims (mã hóa có chữ ký số xác thực)
    BEGIN
        v_jwt := auth.jwt();
        IF v_jwt IS NOT NULL THEN
            v_id := coalesce(
                v_jwt ->> 'hotel_id',
                v_jwt -> 'app_metadata' ->> 'hotel_id',
                v_jwt -> 'user_metadata' ->> 'hotel_id'
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_id := NULL;
    END;

    -- 2. Nếu tìm thấy trong JWT claims, trả về UUID
    IF v_id IS NOT NULL AND v_id <> '' THEN
        BEGIN
            RETURN v_id::uuid;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    -- 3. Fallback từ request.headers (x-hotel-id)
    BEGIN
        v_id := current_setting('request.headers', true)::json ->> 'x-hotel-id';
        IF v_id IS NOT NULL AND v_id <> '' THEN
            RETURN v_id::uuid;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- Đồng bộ RLS policy cho bảng shifts về chuẩn chung fn_get_tenant_id()
DROP POLICY IF EXISTS "Tenant Isolation" ON public.shifts;
CREATE POLICY "Tenant Isolation" ON public.shifts
FOR ALL
USING (hotel_id = fn_get_tenant_id())
WITH CHECK (hotel_id = fn_get_tenant_id());
