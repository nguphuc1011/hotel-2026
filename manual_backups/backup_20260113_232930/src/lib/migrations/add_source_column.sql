ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS source text DEFAULT 'direct';

COMMENT ON COLUMN bookings.source IS 'Booking source (direct, booking.com, agoda, etc.)';
