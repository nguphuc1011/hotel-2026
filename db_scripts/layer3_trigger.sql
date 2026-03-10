-- 🏛️ LAYER 3: DATABASE TRIGGER (THE SOUL)
-- Blocks cash_flow inserts if auth.uid() does not have an open shift.

CREATE OR REPLACE FUNCTION public.fn_guard_cash_flow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_has_open_shift boolean;
BEGIN
    -- Allow system background jobs if they don't have auth.uid()
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check if auth.uid() owns a shift with status='open'
    SELECT EXISTS (
        SELECT 1 FROM public.shifts 
        WHERE staff_id = auth.uid() 
        AND status = 'open'
    ) INTO v_has_open_shift;

    IF NOT v_has_open_shift THEN
        RAISE EXCEPTION 'Mưu đồ thu tiền lậu? Hãy mở ca trước! (User % không có ca mở)', auth.uid();
    END IF;

    RETURN NEW;
END;
$$;

-- Drop trigger if exists to avoid duplication errors
DROP TRIGGER IF EXISTS trg_block_illegal_cash_flow ON public.cash_flow;

-- Create Trigger
CREATE TRIGGER trg_block_illegal_cash_flow
BEFORE INSERT ON public.cash_flow
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_cash_flow();
