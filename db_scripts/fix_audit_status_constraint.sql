-- Fix audit_status check constraint to include 'pending_adjustment'

ALTER TABLE public.shift_reports
DROP CONSTRAINT IF EXISTS shift_reports_audit_status_check;

ALTER TABLE public.shift_reports
ADD CONSTRAINT shift_reports_audit_status_check 
CHECK (audit_status IN ('pending', 'approved', 'adjusted', 'rejected', 'resolved', 'pending_adjustment'));
