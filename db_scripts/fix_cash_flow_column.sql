ALTER TABLE public.cash_flow 
ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash';