-- Migration: 20260101_fix_cashflow_rls_and_consistency.sql
-- Description: Thêm RLS cho bảng cashflow để hỗ trợ soft delete và đảm bảo phân quyền.

-- 1. Kích hoạt RLS cho bảng cashflow (nếu chưa có)
ALTER TABLE public.cashflow ENABLE ROW LEVEL SECURITY;

-- 2. Chính sách SELECT: Loại bỏ bản ghi đã xóa (deleted_at IS NOT NULL)
-- Admin và Manager vẫn có thể xem mọi thứ (kể cả đã xóa)
-- Staff chỉ xem được bản ghi chưa xóa
DROP POLICY IF EXISTS "Exclude deleted cashflow for non-admins" ON public.cashflow;
CREATE POLICY "Exclude deleted cashflow for non-admins" ON public.cashflow
    FOR SELECT 
    USING (
        deleted_at IS NULL OR 
        (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')))
    );

-- 3. Chính sách INSERT: Cho phép mọi user đã xác thực chèn dữ liệu
DROP POLICY IF EXISTS "Enable insert for authenticated" ON public.cashflow;
CREATE POLICY "Enable insert for authenticated" ON public.cashflow
    FOR INSERT 
    TO authenticated 
    WITH CHECK (true);

-- 4. Chính sách UPDATE: Cho phép Admin và Manager sửa mọi thứ, Staff chỉ sửa được bản ghi mình tạo (nếu chưa xóa)
DROP POLICY IF EXISTS "Enable update for authorized users" ON public.cashflow;
CREATE POLICY "Enable update for authorized users" ON public.cashflow
    FOR UPDATE 
    TO authenticated 
    USING (
        (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))) OR
        (created_by_id = auth.uid() AND deleted_at IS NULL)
    );

-- 5. Chính sách DELETE: Chỉ Admin mới được xóa vật lý (thực tế trigger sẽ chặn và chuyển thành soft delete)
DROP POLICY IF EXISTS "Enable delete for admins" ON public.cashflow;
CREATE POLICY "Enable delete for admins" ON public.cashflow
    FOR DELETE 
    TO authenticated 
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 6. Đồng bộ lại cột created_by_id (nếu chưa có) để phục vụ chính sách RLS ở trên
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashflow' AND column_name='created_by_id') THEN
        ALTER TABLE public.cashflow ADD COLUMN created_by_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- 7. Trigger tự động gán created_by_id khi insert
CREATE OR REPLACE FUNCTION public.fn_set_cashflow_user_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_by_id IS NULL THEN
        NEW.created_by_id := auth.uid();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_cashflow_user_id ON public.cashflow;
CREATE TRIGGER trg_set_cashflow_user_id
    BEFORE INSERT ON public.cashflow
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_cashflow_user_id();

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload config';
