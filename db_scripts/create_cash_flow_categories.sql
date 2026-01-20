-- 1. Create Categories Table
CREATE TABLE IF NOT EXISTS public.cash_flow_categories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('IN', 'OUT')),
    description text,
    is_system boolean DEFAULT false, -- Cannot be deleted/renamed if true
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    UNIQUE(name, type)
);

-- 2. Insert Default Categories
INSERT INTO public.cash_flow_categories (name, type, description, is_system)
VALUES 
    ('Tiền phòng', 'IN', 'Thu tiền từ khách thuê phòng', true),
    ('Bán dịch vụ', 'IN', 'Thu tiền từ bán nước, đồ ăn...', true),
    ('Phụ thu', 'IN', 'Các khoản phụ thu khác', true),
    ('Khác', 'IN', 'Thu nhập khác', false),
    ('Nhập hàng', 'OUT', 'Chi tiền nhập kho', true),
    ('Lương nhân viên', 'OUT', 'Chi trả lương', false),
    ('Điện nước', 'OUT', 'Chi phí điện nước internet', false),
    ('Bảo trì', 'OUT', 'Sửa chữa, bảo trì thiết bị', false),
    ('Khác', 'OUT', 'Chi phí khác', false)
ON CONFLICT (name, type) DO NOTHING;

-- 3. RPC to Get Categories
CREATE OR REPLACE FUNCTION public.fn_get_cash_flow_categories(
    p_type text DEFAULT NULL -- 'IN', 'OUT' or NULL for all
)
RETURNS TABLE (
    id uuid,
    name text,
    type text,
    description text,
    is_system boolean,
    is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.name, c.type, c.description, c.is_system, c.is_active
    FROM public.cash_flow_categories c
    WHERE (p_type IS NULL OR c.type = p_type)
      AND c.is_active = true
    ORDER BY c.is_system DESC, c.name ASC;
END;
$$;

-- 4. RPC to Manage Categories (Add/Update/Delete)
CREATE OR REPLACE FUNCTION public.fn_manage_cash_flow_category(
    p_action text, -- 'CREATE', 'UPDATE', 'DELETE', 'TOGGLE'
    p_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_system boolean;
BEGIN
    IF p_action = 'CREATE' THEN
        IF EXISTS (SELECT 1 FROM public.cash_flow_categories WHERE name = p_name AND type = p_type) THEN
             RETURN jsonb_build_object('success', false, 'message', 'Tên danh mục đã tồn tại');
        END IF;
        
        INSERT INTO public.cash_flow_categories (name, type, description)
        VALUES (p_name, p_type, p_description);
        
        RETURN jsonb_build_object('success', true, 'message', 'Thêm danh mục thành công');
        
    ELSIF p_action = 'UPDATE' THEN
        SELECT is_system INTO v_is_system FROM public.cash_flow_categories WHERE id = p_id;
        IF v_is_system THEN
             RETURN jsonb_build_object('success', false, 'message', 'Không thể sửa danh mục hệ thống');
        END IF;

        UPDATE public.cash_flow_categories 
        SET name = COALESCE(p_name, name),
            description = COALESCE(p_description, description)
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Cập nhật thành công');

    ELSIF p_action = 'DELETE' THEN
        SELECT is_system INTO v_is_system FROM public.cash_flow_categories WHERE id = p_id;
        IF v_is_system THEN
             RETURN jsonb_build_object('success', false, 'message', 'Không thể xóa danh mục hệ thống');
        END IF;

        -- Soft delete
        UPDATE public.cash_flow_categories SET is_active = false WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Đã xóa danh mục');
    END IF;

    RETURN jsonb_build_object('success', false, 'message', 'Hành động không hợp lệ');
END;
$$;
