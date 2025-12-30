-- MASTER FIX: Giải quyết toàn bộ lỗi Schema, RLS và Logic Thu Chi
-- Bệ Hạ hãy chạy toàn bộ nội dung file này trong Supabase SQL Editor.

-- ==========================================
-- 1. BỔ SUNG CỘT THIẾU (SCHEMA FIX)
-- ==========================================
DO $$ 
BEGIN
    -- Bảng cashflow
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cashflow' AND column_name='deleted_at') THEN
        ALTER TABLE public.cashflow ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cashflow' AND column_name='created_by_id') THEN
        ALTER TABLE public.cashflow ADD COLUMN created_by_id UUID REFERENCES auth.users(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cashflow' AND column_name='category') THEN
        ALTER TABLE public.cashflow ADD COLUMN category TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cashflow' AND column_name='category_name') THEN
        ALTER TABLE public.cashflow ADD COLUMN category_name TEXT;
    END IF;

    -- Bảng audit_logs chuẩn hóa (Quy nhất mật sổ)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='table_name') THEN
        ALTER TABLE public.audit_logs ADD COLUMN table_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='record_id') THEN
        ALTER TABLE public.audit_logs ADD COLUMN record_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='old_data') THEN
        ALTER TABLE public.audit_logs ADD COLUMN old_data JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='new_data') THEN
        ALTER TABLE public.audit_logs ADD COLUMN new_data JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='severity') THEN
        ALTER TABLE public.audit_logs ADD COLUMN severity TEXT DEFAULT 'info';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='reason') THEN
        ALTER TABLE public.audit_logs ADD COLUMN reason TEXT;
    END IF;

    -- Các bảng khác cần Soft Delete
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bookings' AND column_name='deleted_at') THEN
        ALTER TABLE public.bookings ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='services' AND column_name='deleted_at') THEN
        ALTER TABLE public.services ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='deleted_at') THEN
        ALTER TABLE public.customers ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
END $$;

-- ==========================================
-- 2. DỌN DẸP DỮ LIỆU CŨ (DATA CLEANUP)
-- ==========================================
-- Cập nhật danh mục cho cashflow nếu bị NULL
UPDATE public.cashflow 
SET category = COALESCE(category_name, 'Chưa phân loại'),
    category_name = COALESCE(category_name, 'Chưa phân loại')
WHERE category IS NULL OR category_name IS NULL;

-- Gán giá trị mặc định cho các cột NOT NULL sau này
ALTER TABLE public.cashflow ALTER COLUMN category SET DEFAULT 'Chưa phân loại';
ALTER TABLE public.cashflow ALTER COLUMN category_name SET DEFAULT 'Chưa phân loại';

-- ==========================================
-- 3. CƠ CHẾ XÓA MỀM (SOFT DELETE MECHANISM)
-- ==========================================
-- Hàm thực thi xóa mềm (Chuyển DELETE thành UPDATE deleted_at)
CREATE OR REPLACE FUNCTION public.fn_soft_delete_cashflow()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.cashflow 
    SET deleted_at = NOW() 
    WHERE id = OLD.id;
    RETURN NULL; -- Trả về NULL để ngăn cản việc xóa vật lý
END;
$$ LANGUAGE plpgsql;

-- Áp dụng cho bảng cashflow
DROP TRIGGER IF EXISTS trg_soft_delete_cashflow ON public.cashflow;
CREATE TRIGGER trg_soft_delete_cashflow
    BEFORE DELETE ON public.cashflow
    FOR EACH ROW EXECUTE FUNCTION public.fn_soft_delete_cashflow();

-- ==========================================
-- 4. BẢO MẬT (RLS POLICIES)
-- ==========================================
-- Kích hoạt RLS
ALTER TABLE public.cashflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Chính sách cho cashflow
DROP POLICY IF EXISTS "Exclude deleted cashflow for non-admins" ON public.cashflow;
CREATE POLICY "Exclude deleted cashflow for non-admins" ON public.cashflow
    FOR SELECT USING (
        deleted_at IS NULL OR 
        (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')))
    );

DROP POLICY IF EXISTS "Enable insert for authenticated" ON public.cashflow;
CREATE POLICY "Enable insert for authenticated" ON public.cashflow
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Enable update for authorized users" ON public.cashflow;
CREATE POLICY "Enable update for authorized users" ON public.cashflow
    FOR UPDATE TO authenticated USING (
        (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))) OR
        (created_by_id = auth.uid() AND deleted_at IS NULL)
    );

DROP POLICY IF EXISTS "Enable delete for authorized users" ON public.cashflow;
CREATE POLICY "Enable delete for authorized users" ON public.cashflow
    FOR DELETE TO authenticated USING (
        (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))) OR
        (created_by_id = auth.uid())
    );

-- Chính sách cho audit_logs (Cho phép mọi người ghi log nhưng chỉ admin mới được xem)
DROP POLICY IF EXISTS "Allow authenticated to insert logs" ON public.audit_logs;
CREATE POLICY "Allow authenticated to insert logs" ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow admins to select logs" ON public.audit_logs;
CREATE POLICY "Allow admins to select logs" ON public.audit_logs
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ==========================================
-- 5. ĐỒNG BỘ DOANH THU KHI THANH TOÁN (RPC FIX)
-- ==========================================
CREATE OR REPLACE FUNCTION public.resolve_checkout(
    p_booking_id UUID,
    p_payment_method TEXT,
    p_total_amount DECIMAL,
    p_note TEXT DEFAULT ''
)
RETURNS VOID AS $$
DECLARE
    v_room_number TEXT;
    v_category_id UUID;
    v_category_name TEXT := 'Tiền phòng';
    v_user_name TEXT;
BEGIN
    -- 1. Cập nhật trạng thái booking
    UPDATE public.bookings 
    SET status = 'completed', 
        updated_at = NOW() 
    WHERE id = p_booking_id;

    -- 2. Lấy thông tin phòng để ghi log
    SELECT r.room_number INTO v_room_number
    FROM public.rooms r
    JOIN public.bookings b ON b.room_id = r.id
    WHERE b.id = p_booking_id;

    -- 3. Cập nhật trạng thái phòng thành 'available'
    UPDATE public.rooms 
    SET status = 'available' 
    WHERE id = (SELECT room_id FROM public.bookings WHERE id = p_booking_id);

    -- 4. Tìm category_id cho "Tiền phòng"
    SELECT id INTO v_category_id 
    FROM public.cashflow_categories 
    WHERE name = v_category_name 
    LIMIT 1;

    -- 5. Ghi nhận dòng tiền (Cực kỳ quan trọng)
    INSERT INTO public.cashflow (
        type,
        category,
        category_id,
        category_name,
        content,
        amount,
        payment_method,
        notes,
        created_at
    ) VALUES (
        'income',
        v_category_name,
        v_category_id,
        v_category_name,
        'Thanh toán phòng ' || COALESCE(v_room_number, ''),
        p_total_amount,
        p_payment_method,
        p_note,
        NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload config';
