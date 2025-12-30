-- MIGRATION: THIẾT LẬP MÓNG NGẦM (AUDIT LOGS & AI SCHEMA)

-- 1. Tạo bảng Audit Logs toàn diện
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    action_type TEXT NOT NULL, -- 'DELETE_SERVICE', 'UPDATE_PRICE', 'CANCEL_BOOKING', 'STOCK_ADJUST'
    performed_by UUID REFERENCES auth.users(id),
    staff_name TEXT,
    table_name TEXT,
    record_id UUID,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    severity TEXT DEFAULT 'info' -- 'info', 'warning', 'critical'
);

-- 2. Bổ sung AI-Ready columns cho bookings
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS actual_check_in TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS actual_check_out TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS predicted_duration INTERVAL,
ADD COLUMN IF NOT EXISTS efficiency_score NUMERIC;

-- 3. Bổ sung AI-Ready columns cho rooms
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS last_maintenance_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS maintenance_notes TEXT,
ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'good'; -- 'good', 'needs_repair', 'critical'

-- 4. Tạo bảng Room Issues cho "Phòng Biết Nói"
CREATE TABLE IF NOT EXISTS public.room_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    reported_by UUID REFERENCES auth.users(id),
    description TEXT NOT NULL,
    severity TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
    status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'resolved'
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id)
);

-- Index cho việc tìm kiếm nhanh
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_room_issues_status ON public.room_issues(status);

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload config';
