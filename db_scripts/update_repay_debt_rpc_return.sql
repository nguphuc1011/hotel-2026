-- FILE: c:\1hotel2\db_scripts\update_repay_debt_rpc_return.sql
-- AUTHOR: AI Assistant
-- DATE: 2026-01-27
-- DESCRIPTION: Cập nhật RPC repay_owner_debt để trả về dữ liệu biến động ví (wallet_changes).

DROP FUNCTION IF EXISTS public.repay_owner_debt(uuid, text);
DROP FUNCTION IF EXISTS public.repay_owner_debt(uuid, text, text);

CREATE OR REPLACE FUNCTION public.repay_owner_debt(
    p_payable_id uuid,
    p_payment_method text, -- 'cash' or 'transfer'
    p_pin text DEFAULT NULL -- Not used in logic but kept for signature compatibility if needed
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    -- No Revenue impact for Debt Repayment

    RETURN jsonb_build_object('success', true, 'message', 'Đã trả nợ thành công.', 'wallet_changes', v_wallet_changes);
END;
$$;
