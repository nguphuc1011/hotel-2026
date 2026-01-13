
CREATE TABLE IF NOT EXISTS public.ledger (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id uuid REFERENCES public.bookings(id),
    customer_id uuid REFERENCES public.customers(id),
    type text NOT NULL, -- 'REVENUE', 'PAYMENT', 'REFUND'
    category text NOT NULL, -- 'ROOM', 'SERVICE', 'SURCHARGE'
    amount numeric NOT NULL,
    description text,
    staff_id uuid REFERENCES auth.users(id),
    payment_method_code text,
    created_at timestamptz DEFAULT now()
);

-- Index for reporting
CREATE INDEX IF NOT EXISTS idx_ledger_booking_id ON public.ledger(booking_id);
CREATE INDEX IF NOT EXISTS idx_ledger_customer_id ON public.ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON public.ledger(created_at);
