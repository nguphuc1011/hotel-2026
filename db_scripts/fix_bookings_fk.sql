-- FIX: Change FK bookings.verified_by_staff_id to reference public.staff instead of auth.users

-- 1. Drop incorrect constraint
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_verified_by_staff_id_fkey;

-- 2. Add correct constraint
ALTER TABLE public.bookings
ADD CONSTRAINT bookings_verified_by_staff_id_fkey
FOREIGN KEY (verified_by_staff_id)
REFERENCES public.staff (id);
