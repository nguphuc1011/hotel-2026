-- FIX: Restore full functionality of fn_create_cash_flow
-- 1. Restore p_ref_id and p_is_auto parameters
-- 2. Default payment_method_code to 'cash' for manual transactions

DROP FUNCTION IF EXISTS public.fn_create_cash_flow(text, text, numeric, text, timestamptz, uuid, text);

CREATE OR REPLACE FUNCTION public.fn_create_cash_flow(
    p_flow_type text, 
    p_category text, 
    p_amount numeric, 
    p_description text, 
    p_occurred_at timestamp with time zone DEFAULT now(),
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text,
    p_ref_id uuid DEFAULT NULL::uuid,
    p_is_auto boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_new_id uuid;
BEGIN
    INSERT INTO public.cash_flow (
        flow_type, 
        category, 
        amount, 
        description, 
        occurred_at, 
        created_by, 
        verified_by_staff_id, 
        verified_by_staff_name,
        ref_id,
        is_auto,
        payment_method_code
    )
    VALUES (
        p_flow_type, 
        p_category, 
        p_amount, 
        p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
        p_occurred_at, 
        COALESCE(p_verified_by_staff_id, auth.uid()),
        p_verified_by_staff_id,
        p_verified_by_staff_name,
        p_ref_id,
        p_is_auto,
        'cash' -- Default to cash for manual transactions
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'data', v_new_id);
EXCEPTION WHEN OTHERS THEN
    -- Fallback
    INSERT INTO public.cash_flow (
        flow_type, category, amount, description, occurred_at, created_by, payment_method_code
    )
    VALUES (
        p_flow_type, p_category, p_amount, p_description, p_occurred_at, auth.uid(), 'cash'
    )
    RETURNING id INTO v_new_id;
    RETURN jsonb_build_object('success', true, 'data', v_new_id);
END;
$function$;
