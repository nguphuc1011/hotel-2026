
-- CLEANUP AND FIX: External Payables RPCs
-- Ensures p_evidence_url is saved and only the latest versions exist.

DO $$ 
DECLARE 
    func_record RECORD;
BEGIN
    -- Drop all versions of record_owner_expense
    FOR func_record IN 
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'record_owner_expense' AND n.nspname = 'public'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.record_owner_expense(' || func_record.args || ') CASCADE';
    END LOOP;

    -- Drop all versions of repay_owner_debt
    FOR func_record IN 
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'repay_owner_debt' AND n.nspname = 'public'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.repay_owner_debt(' || func_record.args || ') CASCADE';
    END LOOP;
END $$;

-- 1. Final version of record_owner_expense
CREATE OR REPLACE FUNCTION public.record_owner_expense(
    p_amount numeric,
    p_description text,
    p_creditor_name text DEFAULT 'Chủ đầu tư',
    p_evidence_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_payable_id uuid;
BEGIN
    -- A. Record Debt in Sổ Nợ Ngoài
    INSERT INTO public.external_payables (creditor_name, amount, description, evidence_url, status)
    VALUES (p_creditor_name, p_amount, p_description, p_evidence_url, 'active')
    RETURNING id INTO v_payable_id;

    -- B. Record Expense in Cash Flow (affects REVENUE, skips CASH/BANK)
    INSERT INTO public.cash_flow (
        flow_type, category, amount, description, 
        payment_method_code, wallet_id, created_by, occurred_at
    ) VALUES (
        'OUT', 'Chi vận hành', p_amount, p_description || ' (Chủ chi: ' || p_creditor_name || ')',
        'owner_equity', 'REVENUE', 
        auth.uid(),
        now()
    );

    RETURN jsonb_build_object('success', true, 'payable_id', v_payable_id);
END;
$$;

-- 2. Final version of repay_owner_debt
CREATE OR REPLACE FUNCTION public.repay_owner_debt(
    p_payable_id uuid,
    p_payment_method text,
    p_pin text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_debt_record RECORD;
    v_wallet_changes jsonb := '[]'::jsonb;
    v_pm_code text;
BEGIN
    v_pm_code := lower(p_payment_method);
    
    -- Check Debt
    SELECT * INTO v_debt_record FROM public.external_payables WHERE id = p_payable_id AND status = 'active';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Khoản nợ không tồn tại hoặc đã trả.');
    END IF;

    -- A. Record Cash Flow (Money OUT from CASH/BANK, NO REVENUE effect)
    INSERT INTO public.cash_flow (
        flow_type, category, amount, description, 
        payment_method_code, wallet_id, created_by, occurred_at
    ) VALUES (
        'OUT', 'Trả nợ', v_debt_record.amount, 'Trả nợ ' || v_debt_record.creditor_name || ': ' || v_debt_record.description,
        v_pm_code, 
        CASE WHEN v_pm_code = 'cash' THEN 'CASH' ELSE 'BANK' END,
        auth.uid(),
        now()
    );

    -- B. Close Debt in Sổ Nợ Ngoài
    UPDATE public.external_payables SET status = 'paid', updated_at = now() WHERE id = p_payable_id;

    -- Simulation for Wallet Changes
    IF v_pm_code = 'cash' THEN
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'CASH', 'diff', -v_debt_record.amount);
    ELSE
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'BANK', 'diff', -v_debt_record.amount);
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Đã trả nợ thành công.', 'wallet_changes', v_wallet_changes);
END;
$$;
