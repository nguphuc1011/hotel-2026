-- Enable RLS on cash_flow table
ALTER TABLE public.cash_flow ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts (if any)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.cash_flow;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.cash_flow;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.cash_flow;

-- Create comprehensive policies
-- 1. Allow everyone to READ (Staff need to see cash flow)
CREATE POLICY "Enable read access for all users" ON public.cash_flow
    FOR SELECT
    USING (true);

-- 2. Allow authenticated users to INSERT (RPC usually handles this, but good for backup)
CREATE POLICY "Enable insert access for authenticated users" ON public.cash_flow
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- 3. Allow admins to UPDATE/DELETE (Optional, adjust based on roles)
-- For now, let's keep it simple.
