-- DROP LEGACY COLUMNS
-- Date: 2026-01-05
-- Description: Remove include_debt and merged_debt_amount columns from bookings table if they exist.

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
