-- 1. Create table for Role Permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_code text PRIMARY KEY,
    role_name text NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Insert Default Data
INSERT INTO public.role_permissions (role_code, role_name, permissions)
VALUES 
('admin', 'Quản trị viên', '["*"]'::jsonb),
('manager', 'Quản lý', '["view_dashboard", "view_money", "view_money_balance_cash", "view_money_balance_bank", "view_money_revenue", "view_money_extra_funds", "view_reports", "view_settings"]'::jsonb),
('receptionist', 'Lễ tân', '["view_dashboard", "view_money", "money_blind_mode", "view_money_extra_funds_receivable"]'::jsonb),
('housekeeping', 'Buồng phòng', '["view_housekeeping"]'::jsonb)
ON CONFLICT (role_code) DO NOTHING;

-- 3. Enable RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read" ON public.role_permissions FOR SELECT USING (true);

CREATE POLICY "Admin Write" ON public.role_permissions FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.staff 
        WHERE id = auth.uid() AND role = 'admin'
    )
);
