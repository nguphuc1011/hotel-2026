-- DROP LEGACY TABLES AND CLEANUP
-- Date: 2026-01-05
-- Description: Drop old tables transactions, cashflow, expenses, debt_transactions and remove legacy columns from bookings.

-- 1. Drop Legacy Tables
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.cashflow CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.debt_transactions CASCADE;

-- 2. Drop Legacy Columns from Bookings (Double check)
DO $$
BEGIN
    -- Drop include_debt if exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'include_debt') THEN
        ALTER TABLE public.bookings DROP COLUMN include_debt;
    END IF;

    -- Drop merged_debt_amount if exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'merged_debt_amount') THEN
        ALTER TABLE public.bookings DROP COLUMN merged_debt_amount;
    END IF;
END $$;
