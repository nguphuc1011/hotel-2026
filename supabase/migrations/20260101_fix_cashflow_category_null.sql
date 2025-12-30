-- Migration: Fix Cashflow Category Not Null Violation
-- Description: Đảm bảo cột category trong bảng cashflow không gây lỗi 23502 và đồng bộ với category_name.

DO $$ 
BEGIN
    -- 1. Đảm bảo cột category tồn tại
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashflow' AND column_name='category') THEN
        ALTER TABLE public.cashflow ADD COLUMN category TEXT;
    END IF;

    -- 2. Cập nhật các bản ghi đang bị NULL category từ category_name
    UPDATE public.cashflow 
    SET category = category_name 
    WHERE category IS NULL AND category_name IS NOT NULL;

    -- 3. Cập nhật các bản ghi vẫn NULL (nếu cả 2 đều null) thành 'Chưa phân loại'
    UPDATE public.cashflow 
    SET category = 'Chưa phân loại', category_name = 'Chưa phân loại'
    WHERE category IS NULL;

    -- 4. Thiết lập ràng buộc NOT NULL và giá trị mặc định để tránh lỗi 23502 trong tương lai
    ALTER TABLE public.cashflow ALTER COLUMN category SET NOT NULL;
    ALTER TABLE public.cashflow ALTER COLUMN category SET DEFAULT 'Chưa phân loại';

    -- 5. Đồng bộ tương tự cho category_name nếu cần
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashflow' AND column_name='category_name') THEN
        ALTER TABLE public.cashflow ALTER COLUMN category_name SET DEFAULT 'Chưa phân loại';
    END IF;
END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload config';
