
-- CLEANUP: Unified fn_create_cash_flow
-- This script removes all duplicate versions of the function and keeps only the most comprehensive one.

DO $$ 
DECLARE 
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'fn_create_cash_flow' AND n.nspname = 'public'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.fn_create_cash_flow(' || func_record.args || ') CASCADE';
        RAISE NOTICE 'Dropped: fn_create_cash_flow(%)', func_record.args;
    END LOOP;
END $$;

-- Now create the final version
CREATE OR REPLACE FUNCTION public.fn_create_cash_flow(
    p_flow_type text,
    p_category text,
    p_amount numeric,
    p_description text,
    p_occurred_at timestamptz DEFAULT now(),
    p_verified_by_staff_id uuid DEFAULT NULL,
    p_verified_by_staff_name text DEFAULT NULL,
    p_payment_method_code text DEFAULT 'cash',
    p_ref_id uuid DEFAULT NULL,
    p_is_auto boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_id uuid;
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
        payment_method_code,
        ref_id,
        is_auto
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
        COALESCE(p_payment_method_code, 'cash'),
        p_ref_id,
        p_is_auto
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Tạo phiếu thành công',
        'data', v_new_id
    );
END;
$$;
