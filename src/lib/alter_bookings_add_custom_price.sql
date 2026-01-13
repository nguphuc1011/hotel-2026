
-- Add custom_price columns to bookings table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'custom_price') THEN
        ALTER TABLE bookings ADD COLUMN custom_price NUMERIC DEFAULT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'custom_price_reason') THEN
        ALTER TABLE bookings ADD COLUMN custom_price_reason TEXT DEFAULT NULL;
    END IF;
END $$;
