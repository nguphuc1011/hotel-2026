-- Add notes column to bookings table
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS notes TEXT;
