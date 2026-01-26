ALTER TABLE public.external_payables ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
