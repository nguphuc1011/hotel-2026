-- ====================================================================================
-- SCRIPT CHUẨN HÓA DANH MỤC THU CHI VÀ KẾT NỐI ID CHO CASH_FLOW (BẢN V3 - SỬA LỖI MULTI-TENANT)
-- MỤC TIÊU: Sửa lỗi RPC rò rỉ dữ liệu giữa các khách sạn (Multi-tenant Isolation)
-- ====================================================================================

-- 1. THÊM CỘT category_id VÀO BẢNG cash_flow
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_flow' AND column_name = 'category_id') THEN
        ALTER TABLE public.cash_flow ADD COLUMN category_id UUID REFERENCES public.cash_flow_categories(id);
    END IF;
END $$;

-- 2. ĐỒNG BỘ DỮ LIỆU HIỆN TẠI (MAPPING TEXT -> ID)
-- Tạm thời vô hiệu hóa trigger bảo vệ để thực hiện migration một lần duy nhất
ALTER TABLE public.cash_flow DISABLE TRIGGER trg_protect_cash_flow;

UPDATE public.cash_flow cf
SET category_id = cat.id
FROM public.cash_flow_categories cat
WHERE (TRIM(LOWER(cf.category)) = TRIM(LOWER(cat.name)) OR 
      (cf.category = 'Thanh toán tiền phòng' AND cat.name = 'Tiền phòng') OR
      (cf.category = 'Thanh toán trả phòng' AND cat.name = 'Tiền phòng') OR
      (cf.category = 'NHAP_HANG' AND cat.name = 'Nhập hàng'))
  AND cf.flow_type = cat.type
  AND cf.hotel_id = cat.hotel_id;

-- Kích hoạt lại trigger sau khi hoàn tất migration
ALTER TABLE public.cash_flow ENABLE TRIGGER trg_protect_cash_flow;

-- 3. SỬA RPC LẤY DANH MỤC (PHẢI LỌC THEO HOTEL_ID)
CREATE OR REPLACE FUNCTION public.fn_get_cash_flow_categories(
    p_type text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, name text, type text, description text, is_system boolean, is_active boolean, is_revenue boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_hotel_id uuid;
BEGIN
    -- Lấy hotel_id từ context an toàn
    v_hotel_id := public.fn_get_tenant_id();

    RETURN QUERY
    SELECT c.id, c.name, c.type, c.description, c.is_system, c.is_active, c.is_revenue
    FROM public.cash_flow_categories c
    WHERE (p_type IS NULL OR c.type = p_type)
      AND c.hotel_id = v_hotel_id -- QUAN TRỌNG: Lọc theo khách sạn hiện tại
      AND c.is_active = true
    ORDER BY c.is_system DESC, c.name ASC;
END;
$function$;

-- 4. SỬA RPC QUẢN LÝ DANH MỤC (PHẢI LỌC THEO HOTEL_ID)
CREATE OR REPLACE FUNCTION public.fn_manage_cash_flow_category(
    p_action text, 
    p_id uuid DEFAULT NULL::uuid, 
    p_name text DEFAULT NULL::text, 
    p_type text DEFAULT NULL::text, 
    p_description text DEFAULT NULL::text, 
    p_is_revenue boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_is_system boolean;
    v_hotel_id uuid;
BEGIN
    v_hotel_id := public.fn_get_tenant_id();

    IF p_action = 'CREATE' THEN
        -- Kiểm tra trùng tên TRONG CÙNG KHÁCH SẠN
        IF EXISTS (SELECT 1 FROM public.cash_flow_categories WHERE name = p_name AND type = p_type AND hotel_id = v_hotel_id) THEN
             RETURN jsonb_build_object('success', false, 'message', 'Tên danh mục đã tồn tại trong khách sạn này');
        END IF;
        
        INSERT INTO public.cash_flow_categories (name, type, description, is_revenue, hotel_id)
        VALUES (p_name, p_type, p_description, p_is_revenue, v_hotel_id);
        
        RETURN jsonb_build_object('success', true, 'message', 'Thêm danh mục thành công');
        
    ELSIF p_action = 'UPDATE' THEN
        -- Kiểm tra quyền sở hữu bản ghi
        SELECT is_system INTO v_is_system 
        FROM public.cash_flow_categories 
        WHERE id = p_id AND hotel_id = v_hotel_id;

        IF v_is_system IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy danh mục hoặc bạn không có quyền');
        END IF;

        IF v_is_system THEN
             UPDATE public.cash_flow_categories
             SET description = COALESCE(p_description, description),
                 is_revenue = COALESCE(p_is_revenue, is_revenue)
             WHERE id = p_id AND hotel_id = v_hotel_id;
        ELSE
             UPDATE public.cash_flow_categories
             SET name = COALESCE(p_name, name),
                 description = COALESCE(p_description, description),
                 is_revenue = COALESCE(p_is_revenue, is_revenue)
             WHERE id = p_id AND hotel_id = v_hotel_id;
        END IF;
        
        RETURN jsonb_build_object('success', true, 'message', 'Cập nhật thành công');
        
    ELSIF p_action = 'DELETE' THEN
        SELECT is_system INTO v_is_system 
        FROM public.cash_flow_categories 
        WHERE id = p_id AND hotel_id = v_hotel_id;

        IF v_is_system IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy danh mục hoặc bạn không có quyền');
        END IF;

        IF v_is_system THEN
             RETURN jsonb_build_object('success', false, 'message', 'Không thể xóa danh mục hệ thống');
        END IF;
        
        UPDATE public.cash_flow_categories SET is_active = false WHERE id = p_id AND hotel_id = v_hotel_id;
        RETURN jsonb_build_object('success', true, 'message', 'Đã xóa danh mục');
    END IF;

    RETURN jsonb_build_object('success', false, 'message', 'Hành động không hợp lệ');
END;
$function$;

-- 5. CẬP NHẬT RPC: fn_create_cash_flow (Cập nhật logic mapping ID)
CREATE OR REPLACE FUNCTION public.fn_create_cash_flow(
    p_flow_type text, 
    p_category text DEFAULT NULL, 
    p_amount numeric DEFAULT 0, 
    p_description text DEFAULT NULL, 
    p_occurred_at timestamp with time zone DEFAULT now(), 
    p_verified_by_staff_id uuid DEFAULT NULL::uuid, 
    p_verified_by_staff_name text DEFAULT NULL::text, 
    p_payment_method_code text DEFAULT 'cash'::text, 
    p_ref_id uuid DEFAULT NULL::uuid, 
    p_is_auto boolean DEFAULT false,
    p_category_id uuid DEFAULT NULL::uuid -- NEW PARAMETER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE 
    v_new_id uuid;
    v_hotel_id uuid;
    v_final_category_id uuid := p_category_id;
    v_final_category_name text := p_category;
BEGIN
    v_hotel_id := public.fn_get_tenant_id();

    -- Nếu có category_id, lấy name từ đó để đồng bộ
    IF v_final_category_id IS NOT NULL THEN
        SELECT name INTO v_final_category_name 
        FROM public.cash_flow_categories 
        WHERE id = v_final_category_id AND hotel_id = v_hotel_id;
    -- Nếu chỉ có name, tìm ID tương ứng
    ELSIF v_final_category_name IS NOT NULL THEN
        SELECT id INTO v_final_category_id 
        FROM public.cash_flow_categories 
        WHERE TRIM(LOWER(name)) = TRIM(LOWER(v_final_category_name)) 
          AND type = p_flow_type 
          AND hotel_id = v_hotel_id
        LIMIT 1;
    END IF;

    INSERT INTO public.cash_flow (
        hotel_id,
        flow_type, 
        category, 
        category_id,
        amount, 
        description, 
        occurred_at, 
        created_by, 
        verified_by_staff_id, 
        verified_by_staff_name,
        ref_id,
        is_auto,
        payment_method_code
    )
    VALUES (
        v_hotel_id,
        p_flow_type, 
        COALESCE(v_final_category_name, p_category, 'Khác'), 
        v_final_category_id,
        p_amount, 
        COALESCE(p_description, '') || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
        p_occurred_at, 
        COALESCE(p_verified_by_staff_id, auth.uid()),
        p_verified_by_staff_id,
        p_verified_by_staff_name,
        p_ref_id,
        p_is_auto,
        COALESCE(p_payment_method_code, 'cash')
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'data', v_new_id);
END; $function$;
