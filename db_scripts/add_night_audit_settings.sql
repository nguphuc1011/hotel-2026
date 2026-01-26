-- Migration: Add night_audit_time to settings and combine with early check-in logic
-- Created: 2026-01-26

-- 1. Add column if not exists
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS night_audit_time time DEFAULT '04:00:00';

-- 2. Update default value for existing config
UPDATE public.settings 
SET night_audit_time = '04:00:00' 
WHERE key = 'config' AND night_audit_time IS NULL;

-- 3. Sync full_day_early_before to night_audit_time for consistency
UPDATE public.settings 
SET night_audit_time = full_day_early_before 
WHERE key = 'config' AND full_day_early_before IS NOT NULL;
