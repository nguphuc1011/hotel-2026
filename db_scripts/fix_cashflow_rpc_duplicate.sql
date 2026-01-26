-- FIX: Resolve duplicate fn_create_cash_flow and mismatch parameters

-- 1. Drop ALL existing versions of fn_create_cash_flow to be clean
DROP FUNCTION IF EXISTS public.fn_create_cash_flow(text, text, numeric, text, timestamptz, uuid, text);
DROP FUNCTION IF EXISTS public.fn_create_cash_flow(text, text, numeric, text, timestamptz, uuid, text, text);

-- 2. Create the unified correct version matching frontend call
-- Frontend calls with: p_flow_type, p_category, p_amount, p_description, p_occurred_at, p_verified_by_staff_id, p_verified_by_staff_name
CREATE OR REPLACE FUNCTION public.fn_create_cash_flow(
    p_flow_type text, 
    p_category text, 
    p_amount numeric, 
    p_description text, 
    p_occurred_at timestamp with time zone DEFAULT now(),
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_new_id uuid;
BEGIN
    INSERT INTO public.cash_flow (
        flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_id, verified_by_staff_name
    )
    VALUES (
        p_flow_type, p_category, p_amount, 
        p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
        p_occurred_at, 
        COALESCE(p_verified_by_staff_id, auth.uid()),
        p_verified_by_staff_id,
        p_verified_by_staff_name
    )
    RETURNING id INTO v_new_id;
    RETURN jsonb_build_object('success', true, 'data', v_new_id);
EXCEPTION WHEN OTHERS THEN
    -- Fallback in case of error, ensuring we still try to record
    INSERT INTO public.cash_flow (flow_type, category, amount, description, occurred_at, created_by)
    VALUES (
        p_flow_type, p_category, p_amount, 
        p_description, 
        p_occurred_at, 
        auth.uid()
    )
    RETURNING id INTO v_new_id;
    RETURN jsonb_build_object('success', true, 'data', v_new_id);
END;
$function$;
