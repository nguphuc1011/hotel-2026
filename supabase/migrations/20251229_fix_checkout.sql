-- 1. Add missing columns to bookings
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='total_amount') THEN
        ALTER TABLE public.bookings ADD COLUMN total_amount NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='final_amount') THEN
        ALTER TABLE public.bookings ADD COLUMN final_amount NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='surcharge') THEN
        ALTER TABLE public.bookings ADD COLUMN surcharge NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='payment_method') THEN
        ALTER TABLE public.bookings ADD COLUMN payment_method TEXT;
    END IF;
END $$;

-- 2. Define or Update resolve_checkout RPC
-- (Đã được thay thế bởi handle_checkout trong 20260101_unify_checkout_system.sql)
DROP FUNCTION IF EXISTS public.resolve_checkout(uuid, text, numeric, numeric, numeric, text, uuid, boolean);
DROP FUNCTION IF EXISTS public.resolve_checkout(uuid, text, numeric, numeric, numeric, text, uuid);

