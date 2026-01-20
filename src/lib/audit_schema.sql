-- AUDIT LOGGING SCHEMA
-- Created: 2026-01-20
-- Description: Add columns to track who verified sensitive actions

-- 1. Bookings (Check-in overrides)
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS verified_by_staff_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS verified_by_staff_name text;

-- 2. Customer Transactions (Refunds, Adjustments)
ALTER TABLE public.customer_transactions 
ADD COLUMN IF NOT EXISTS verified_by_staff_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS verified_by_staff_name text;

-- 3. Cash Flow (Expenses, Income)
ALTER TABLE public.cash_flow 
ADD COLUMN IF NOT EXISTS verified_by_staff_id uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS verified_by_staff_name text;
