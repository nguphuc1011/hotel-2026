-- Fix get_global_open_shift to use lowercase 'open' status
CREATE OR REPLACE FUNCTION public.get_global_open_shift()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift record;
BEGIN
    -- Select the single open shift (if any)
    -- Crucial fix: use 'open' (lowercase) not 'OPEN'
    SELECT * INTO v_shift FROM public.shifts WHERE status = 'open' LIMIT 1;

    IF v_shift.id IS NOT NULL THEN
        -- Get staff name
        DECLARE
            v_staff_name text;
        BEGIN
            SELECT full_name INTO v_staff_name FROM public.staff WHERE id = v_shift.staff_id;
            
            RETURN jsonb_build_object(
                'has_open_shift', true,
                'shift', jsonb_build_object(
                    'id', v_shift.id,
                    'staff_id', v_shift.staff_id,
                    'staff_name', COALESCE(v_staff_name, 'Unknown')
                )
            );
        END;
    ELSE
        RETURN jsonb_build_object('has_open_shift', false);
    END IF;
END;
$$;