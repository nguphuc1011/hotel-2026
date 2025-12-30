-- Migration: THAO_AI_FOUNDATION (Móng ngầm của Tháo)
-- Description: Khởi tạo cơ chế Soft Delete, Audit Triggers và tinh chỉnh bảng audit_logs

-- 1. TINH CHỈNH BẢNG audit_logs
DO $$ 
BEGIN
    -- Thêm các cột theo yêu cầu mới
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='table_name') THEN
        ALTER TABLE public.audit_logs ADD COLUMN table_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='permission_used') THEN
        ALTER TABLE public.audit_logs ADD COLUMN permission_used TEXT;
    END IF;

    -- Đồng bộ dữ liệu cũ nếu có
    UPDATE public.audit_logs SET table_name = entity_type WHERE table_name IS NULL;
END $$;

-- 2. KÍCH HOẠT CƠ CHẾ SOFT DELETE (XÓA MỀM)
-- Thêm cột deleted_at vào các bảng quan trọng
DO $$ 
BEGIN
    -- bookings
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='deleted_at') THEN
        ALTER TABLE public.bookings ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
    -- services
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='deleted_at') THEN
        ALTER TABLE public.services ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
    -- customers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='deleted_at') THEN
        ALTER TABLE public.customers ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
    -- cashflow
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashflow' AND column_name='deleted_at') THEN
        ALTER TABLE public.cashflow ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
END $$;

-- Cập nhật RLS để tự động lọc bỏ các bản ghi đã bị xóa mềm (đối với người dùng không phải admin)
-- Lưu ý: Admin vẫn có thể thấy "Nghĩa địa dữ liệu" nếu cần
DROP POLICY IF EXISTS "Exclude deleted bookings" ON public.bookings;
CREATE POLICY "Exclude deleted bookings" ON public.bookings
    FOR SELECT USING (deleted_at IS NULL OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')));

DROP POLICY IF EXISTS "Exclude deleted services" ON public.services;
CREATE POLICY "Exclude deleted services" ON public.services
    FOR SELECT USING (deleted_at IS NULL OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')));

-- 3. SQL TRIGGER TỰ ĐỘNG GHI LOG (BỘ NÃO TỰ THÂN CỦA THÁO)
CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_action_type TEXT := TG_OP;
    v_old_data JSONB := NULL;
    v_new_data JSONB := NULL;
    v_severity TEXT := 'info';
    v_reason TEXT := NULL;
    v_is_suspicious BOOLEAN := FALSE;
BEGIN
    -- Xác định dữ liệu cũ và mới
    IF (TG_OP = 'UPDATE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        
        -- Kiểm tra hành vi nghi vấn (Gian lận giá/kho)
        -- Ví dụ: Sửa giá thấp hơn hoặc giảm số lượng kho mà không qua luồng chuẩn
        IF (TG_TABLE_NAME = 'services' AND (NEW.price < OLD.price OR NEW.stock < OLD.stock)) THEN
            v_severity := 'warning';
            v_is_suspicious := TRUE;
        END IF;

        -- Kiểm tra gian lận Folio (Sửa trạng thái booking)
        IF (TG_TABLE_NAME = 'bookings' AND OLD.status = 'completed' AND NEW.status != 'completed') THEN
            v_severity := 'danger';
            v_is_suspicious := TRUE;
            v_reason := 'Cảnh báo: Cố tình mở lại phòng đã thanh toán!';
        END IF;

    ELSIF (TG_OP = 'DELETE') THEN
        v_old_data := to_jsonb(OLD);
        v_severity := 'danger';
        v_is_suspicious := TRUE;
        v_reason := 'Cảnh báo: Hành động xóa vật lý bị cấm nhưng vẫn thực thi!';
    END IF;

    -- Chỉ ghi log nếu có sự thay đổi thực sự hoặc là hành động nhạy cảm
    IF (v_old_data IS DISTINCT FROM v_new_data OR TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (
            user_id,
            action,
            entity_type,
            table_name,
            entity_id,
            old_value,
            new_value,
            severity,
            is_suspicious,
            reason
        ) VALUES (
            v_user_id,
            v_action_type || ' ' || TG_TABLE_NAME,
            TG_TABLE_NAME,
            TG_TABLE_NAME,
            COALESCE(NEW.id, OLD.id),
            v_old_data,
            v_new_data,
            v_severity,
            v_is_suspicious,
            v_reason
        );
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Gắn trigger vào các bảng nhạy cảm
DROP TRIGGER IF EXISTS trg_audit_bookings ON public.bookings;
CREATE TRIGGER trg_audit_bookings
    AFTER UPDATE OR DELETE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_services ON public.services;
CREATE TRIGGER trg_audit_services
    AFTER UPDATE OR DELETE ON public.services
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_cashflow ON public.cashflow;
CREATE TRIGGER trg_audit_cashflow
    AFTER UPDATE OR DELETE ON public.cashflow
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 4. TRIGGER NGĂN CHẶN XÓA VẬT LÝ (ENFORCE SOFT DELETE)
CREATE OR REPLACE FUNCTION public.fn_enforce_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Nếu là lệnh DELETE vật lý, chuyển thành UPDATE deleted_at
    IF (TG_OP = 'DELETE') THEN
        EXECUTE format('UPDATE %I.%I SET deleted_at = NOW() WHERE id = $1', TG_TABLE_SCHEMA, TG_TABLE_NAME) USING OLD.id;
        RETURN NULL; -- Hủy lệnh DELETE vật lý
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Gắn trigger ngăn xóa vào các bảng
DROP TRIGGER IF EXISTS trg_soft_delete_bookings ON public.bookings;
CREATE TRIGGER trg_soft_delete_bookings
    BEFORE DELETE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_soft_delete();

DROP TRIGGER IF EXISTS trg_soft_delete_services ON public.services;
CREATE TRIGGER trg_soft_delete_services
    BEFORE DELETE ON public.services
    FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_soft_delete();

DROP TRIGGER IF EXISTS trg_soft_delete_customers ON public.customers;
CREATE TRIGGER trg_soft_delete_customers
    BEFORE DELETE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_soft_delete();

DROP TRIGGER IF EXISTS trg_soft_delete_cashflow ON public.cashflow;
CREATE TRIGGER trg_soft_delete_cashflow
    BEFORE DELETE ON public.cashflow
    FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_soft_delete();

-- 5. PHÂN LOẠI DÒNG TIỀN (CASHFLOW CATEGORIZATION)
-- Thêm ràng buộc duy nhất để hỗ trợ ON CONFLICT
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cashflow_categories_name_type_key') THEN
        ALTER TABLE public.cashflow_categories ADD CONSTRAINT cashflow_categories_name_type_key UNIQUE (name, type);
    END IF;
END $$;

-- Đảm bảo các hạng mục hệ thống tồn tại
INSERT INTO public.cashflow_categories (name, type, color, is_system)
VALUES 
    ('Tiền phòng (Room)', 'income', '#3b82f6', true),
    ('Dịch vụ (Service)', 'income', '#10b981', true),
    ('Tiền cọc (Deposit)', 'income', '#f59e0b', true)
ON CONFLICT (name, type) DO UPDATE 
SET is_system = true, color = EXCLUDED.color;

-- 6. HỆ THỐNG BÀN GIAO CA & KIỂM KHO (SHIFT & INVENTORY AUDIT)
-- Bảng Bàn giao ca
CREATE TABLE IF NOT EXISTS public.shift_handovers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES auth.users(id),
    staff_name TEXT,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ,
    initial_cash NUMERIC DEFAULT 0,
    total_income_cash NUMERIC DEFAULT 0,
    total_expense_cash NUMERIC DEFAULT 0,
    expected_cash NUMERIC DEFAULT 0,
    actual_cash NUMERIC DEFAULT 0,
    discrepancy NUMERIC DEFAULT 0,
    notes TEXT,
    status TEXT DEFAULT 'open', -- open, completed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Bảng Phiếu kiểm kho
CREATE TABLE IF NOT EXISTS public.inventory_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES auth.users(id),
    staff_name TEXT,
    audit_date TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Chi tiết phiếu kiểm kho
CREATE TABLE IF NOT EXISTS public.inventory_audit_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES public.inventory_audits(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.services(id),
    service_name TEXT,
    system_stock NUMERIC DEFAULT 0,
    actual_stock NUMERIC DEFAULT 0,
    discrepancy NUMERIC DEFAULT 0
);

-- Enable RLS for new tables
ALTER TABLE public.shift_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audit_details ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Staff can manage their own handovers" ON public.shift_handovers
    FOR ALL USING (staff_id = auth.uid() OR (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))));

CREATE POLICY "Staff can manage inventory audits" ON public.inventory_audits
    FOR ALL USING (true); -- Simplified for now, refine with roles if needed

CREATE POLICY "Staff can manage audit details" ON public.inventory_audit_details
    FOR ALL USING (true);

-- Gắn trigger audit log cho các bảng mới
DROP TRIGGER IF EXISTS trg_audit_shift_handovers ON public.shift_handovers;
CREATE TRIGGER trg_audit_shift_handovers
    AFTER INSERT OR UPDATE OR DELETE ON public.shift_handovers
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_inventory_audits ON public.inventory_audits;
CREATE TRIGGER trg_audit_inventory_audits
    AFTER INSERT OR UPDATE OR DELETE ON public.inventory_audits
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
