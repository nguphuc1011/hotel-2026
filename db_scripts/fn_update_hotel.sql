-- Hàm cập nhật thông tin khách sạn (SaaS Admin)
CREATE OR REPLACE FUNCTION public.fn_update_hotel(
    p_hotel_id uuid,
    p_name text,
    p_phone text,
    p_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_exists_id uuid;
BEGIN
    -- 1. Kiểm tra Hotel tồn tại
    SELECT id INTO v_exists_id FROM public.hotels WHERE id = p_hotel_id;
    IF v_exists_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy khách hàng');
    END IF;

    -- 2. Kiểm tra slug trùng lặp (nếu slug thay đổi)
    IF p_slug IS NOT NULL AND p_slug <> '' THEN
        SELECT id INTO v_exists_id FROM public.hotels WHERE slug = p_slug AND id <> p_hotel_id;
        IF v_exists_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Đường dẫn (Slug) này đã được sử dụng bởi khách sạn khác');
        END IF;
    END IF;

    -- 3. Thực hiện cập nhật
    UPDATE public.hotels
    SET 
        name = COALESCE(p_name, name),
        phone = COALESCE(p_phone, phone),
        slug = COALESCE(p_slug, slug)
    WHERE id = p_hotel_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Cập nhật thông tin khách sạn thành công'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi khi cập nhật: ' || SQLERRM);
END;
$function$;
