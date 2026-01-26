
-- FIX: Allow updates to auto-generated Cash Flow records
-- The previous strict immutability prevented the system from updating daily room charge estimates.

CREATE OR REPLACE FUNCTION public.fn_prevent_modification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Exception for Cash Flow: Allow modification of Auto-generated records
    IF (TG_TABLE_NAME = 'cash_flow') THEN
        IF (TG_OP = 'UPDATE') THEN
            -- Allow update if the record was auto-generated (system estimate)
            IF (OLD.is_auto = true) THEN
                RETURN NEW;
            END IF;
        END IF;
        
        IF (TG_OP = 'DELETE') THEN
            -- Allow delete if the record was auto-generated
            IF (OLD.is_auto = true) THEN
                RETURN OLD;
            END IF;
        END IF;
    END IF;

    -- Default Strict Rules
    IF (TG_OP = 'DELETE') THEN
        RAISE EXCEPTION 'Action Denied: Cannot delete records from this table (Immutable Audit Log).';
    ELSIF (TG_OP = 'UPDATE') THEN
        RAISE EXCEPTION 'Action Denied: Cannot update records in this table (Immutable Audit Log). Use reversal entries instead.';  
    END IF;
    RETURN NULL;
END;
$$;
