-- FIX: Add missing updated_at column to cash_flow table
-- Required for fn_sync_booking_to_ledger and other automated sync processes.

ALTER TABLE public.cash_flow ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure all existing rows have the column populated
UPDATE public.cash_flow SET updated_at = created_at WHERE updated_at IS NULL;

-- Create or replace function for updated_at trigger if needed (optional but recommended)
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_cash_flow_updated_at ON public.cash_flow;
CREATE TRIGGER tr_cash_flow_updated_at
BEFORE UPDATE ON public.cash_flow
FOR EACH ROW
EXECUTE FUNCTION public.fn_set_updated_at();
