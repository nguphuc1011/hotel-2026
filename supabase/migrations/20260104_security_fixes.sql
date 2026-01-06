-- Migration: Fix Database Security Errors
-- Date: 2026-01-04
-- Purpose: Enable RLS on public tables and fix Security Definer Views

-- 1. FIX SECURITY DEFINER VIEWS
-- Supabase recommends views to be security_invoker=true so they respect RLS of underlying tables.
-- Recreating 'view_pending_services'
DROP VIEW IF EXISTS public.view_pending_services;
CREATE OR REPLACE VIEW public.view_pending_services WITH (security_invoker = true) AS
SELECT 
    r.room_number,
    b.id as booking_id,
    b.check_in_at,
    s_used.val->>'name' as service_name,
    COALESCE((s_used.val->>'quantity')::INTEGER, 0) as quantity,
    COALESCE((s_used.val->>'price')::DECIMAL, 0) as price,
    COALESCE((s_used.val->>'quantity')::INTEGER, 0) * COALESCE((s_used.val->>'price')::DECIMAL, 0) as total_amount
FROM public.bookings b
JOIN public.rooms r ON b.room_id = r.id
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.services_used, '[]'::jsonb)) s_used(val)
WHERE b.status = 'active' AND b.deleted_at IS NULL;

-- Recreating 'debtor_overview'
DROP VIEW IF EXISTS public.debtor_overview;
CREATE OR REPLACE VIEW public.debtor_overview WITH (security_invoker = true) AS
SELECT 
    id,
    full_name,
    phone,
    balance, -- Số dư (Âm là đang nợ)
    last_visit as last_stay_date, -- Alias để FE không bị lỗi nếu đang dùng tên này
    total_spent,
    created_at
FROM public.customers
WHERE balance < 0
ORDER BY balance ASC;

-- 2. FIX RLS DISABLED IN PUBLIC TABLES
-- Enabling RLS and adding policies for identified tables

-- Table: public.service_categories
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.service_categories;
DROP POLICY IF EXISTS "Enable write access for staff" ON public.service_categories;
CREATE POLICY "Enable read access for all users" ON public.service_categories FOR SELECT USING (true);
CREATE POLICY "Enable write access for staff" ON public.service_categories FOR ALL USING (
  (auth.jwt() ->> 'role') IN ('admin', 'manager', 'staff', 'service_role')
);

-- Table: public.stock_history
ALTER TABLE public.stock_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.stock_history;
DROP POLICY IF EXISTS "Enable insert for staff" ON public.stock_history;
CREATE POLICY "Enable read access for authenticated users" ON public.stock_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for staff" ON public.stock_history FOR INSERT TO authenticated WITH CHECK (
  (auth.jwt() ->> 'role') IN ('admin', 'manager', 'staff', 'service_role')
);

-- Table: public.cashflow_categories
ALTER TABLE public.cashflow_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.cashflow_categories;
DROP POLICY IF EXISTS "Enable write access for staff" ON public.cashflow_categories;
CREATE POLICY "Enable read access for all users" ON public.cashflow_categories FOR SELECT USING (true);
CREATE POLICY "Enable write access for staff" ON public.cashflow_categories FOR ALL USING (
  (auth.jwt() ->> 'role') IN ('admin', 'manager', 'staff', 'service_role')
);

-- Table: public.inventory_audit_details
ALTER TABLE public.inventory_audit_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.inventory_audit_details;
DROP POLICY IF EXISTS "Enable insert for staff" ON public.inventory_audit_details;
CREATE POLICY "Enable read access for authenticated users" ON public.inventory_audit_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for staff" ON public.inventory_audit_details FOR INSERT TO authenticated WITH CHECK (
  (auth.jwt() ->> 'role') IN ('admin', 'manager', 'staff', 'service_role')
);

-- 3. GRANT PERMISSIONS (Ensure functionality isn't broken by new RLS)
GRANT SELECT ON public.view_pending_services TO authenticated, anon, service_role;
GRANT SELECT ON public.debtor_overview TO authenticated, service_role;
