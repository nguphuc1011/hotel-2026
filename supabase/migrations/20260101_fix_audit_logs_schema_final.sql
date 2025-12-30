-- MIGRATION: FIX_AUDIT_LOGS_SCHEMA_FINAL
-- Description: Đảm bảo bảng audit_logs có đầy đủ các cột cần thiết cho cả mã nguồn và trigger hệ thống.
-- Tâu Bệ Hạ: Đây là bản vá tối thượng để chấm dứt tình trạng "lúc có lúc không" của các cột trong bảng nhật ký.

DO $$ 
BEGIN
    -- 1. Đảm bảo các cột cơ bản tồn tại
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='user_id') THEN
        ALTER TABLE public.audit_logs ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='action') THEN
        ALTER TABLE public.audit_logs ADD COLUMN action TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='entity_type') THEN
        ALTER TABLE public.audit_logs ADD COLUMN entity_type TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='entity_id') THEN
        -- Thử thêm dạng TEXT để linh hoạt cho cả UUID và String
        ALTER TABLE public.audit_logs ADD COLUMN entity_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='table_name') THEN
        ALTER TABLE public.audit_logs ADD COLUMN table_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='old_value') THEN
        ALTER TABLE public.audit_logs ADD COLUMN old_value JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='new_value') THEN
        ALTER TABLE public.audit_logs ADD COLUMN new_value JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='reason') THEN
        ALTER TABLE public.audit_logs ADD COLUMN reason TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='severity') THEN
        ALTER TABLE public.audit_logs ADD COLUMN severity TEXT DEFAULT 'info';
    END IF;

    -- 2. Đồng bộ các cột AI-Ready (nếu Bệ Hạ muốn dùng cấu trúc mới)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='action_type') THEN
        ALTER TABLE public.audit_logs ADD COLUMN action_type TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='performed_by') THEN
        ALTER TABLE public.audit_logs ADD COLUMN performed_by UUID REFERENCES auth.users(id);
    END IF;

    -- 3. Cập nhật dữ liệu để các cột mới không bị trống
    UPDATE public.audit_logs SET action_type = action WHERE action_type IS NULL;
    UPDATE public.audit_logs SET performed_by = user_id WHERE performed_by IS NULL;
    UPDATE public.audit_logs SET table_name = entity_type WHERE table_name IS NULL;

    -- 4. Thiết lập RLS (Row Level Security) - Tránh lỗi 42501
    ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

    -- Xóa policy cũ nếu có để tránh trùng lặp
    DROP POLICY IF EXISTS "Allow authenticated users to insert audit_logs" ON public.audit_logs;
    DROP POLICY IF EXISTS "Allow authenticated users to select audit_logs" ON public.audit_logs;

    -- Cho phép người dùng đã đăng nhập ghi log
    CREATE POLICY "Allow authenticated users to insert audit_logs" 
    ON public.audit_logs FOR INSERT 
    TO authenticated 
    WITH CHECK (true);

    -- Cho phép người dùng đã đăng nhập xem log (cho AI Dashboard)
    CREATE POLICY "Allow authenticated users to select audit_logs" 
    ON public.audit_logs FOR SELECT 
    TO authenticated 
    USING (true);

END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload config';
