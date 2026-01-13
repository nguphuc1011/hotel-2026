-- Add custom_price columns
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS custom_price NUMERIC DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS custom_price_reason TEXT DEFAULT NULL;

-- Add source column
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source text DEFAULT 'direct';

-- Add check_in_note if needed (notes exists)
-- Ensure extra_adults/children exist
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extra_adults int DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extra_children int DEFAULT 0;
