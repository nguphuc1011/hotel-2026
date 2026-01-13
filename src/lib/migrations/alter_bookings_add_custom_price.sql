-- Migration: Add custom_price columns to bookings table
-- Created: 2026-01-12
-- Description: Support for custom negotiated price (logic v3)

DO $$
BEGIN
    -- Add custom_price if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'custom_price') THEN
        ALTER TABLE public.bookings ADD COLUMN custom_price numeric DEFAULT NULL;
    END IF;

    -- Add custom_price_reason if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'custom_price_reason') THEN
        ALTER TABLE public.bookings ADD COLUMN custom_price_reason text DEFAULT NULL;
    END IF;
END $$;
