-- Add extra_adults and extra_children columns to bookings table
-- Default to 0 to ensure backward compatibility and simpler logic

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'extra_adults') THEN
        ALTER TABLE bookings ADD COLUMN extra_adults INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'extra_children') THEN
        ALTER TABLE bookings ADD COLUMN extra_children INTEGER DEFAULT 0;
    END IF;
END $$;
