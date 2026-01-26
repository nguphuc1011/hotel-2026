-- FINANCIAL HEALTH CHECK RPC (Accounting Equation Verification)
-- Created: 2026-01-26
-- Reference: ketoan.md (The Golden Equation)

CREATE OR REPLACE FUNCTION public.fn_check_financial_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cash numeric;
    v_bank numeric;
    v_escrow numeric;
    v_receivable numeric;
    v_revenue numeric;
    v_external_payables numeric;
    v_golden_revenue numeric;
    v_imbalance numeric;
    v_is_healthy boolean;
BEGIN
    -- 1. Get all wallet balances
    SELECT balance INTO v_cash FROM public.wallets WHERE id = 'CASH';
    SELECT balance INTO v_bank FROM public.wallets WHERE id = 'BANK';
    SELECT balance INTO v_escrow FROM public.wallets WHERE id = 'ESCROW';
    SELECT balance INTO v_receivable FROM public.wallets WHERE id = 'RECEIVABLE';
    SELECT balance INTO v_revenue FROM public.wallets WHERE id = 'REVENUE';
    
    -- External Payables (Sổ Nợ Ngoài) - This might be a separate table or a wallet
    -- Assuming it's a wallet with ID 'EXTERNAL_PAYABLES' or similar. 
    -- If not found, default to 0.
    SELECT COALESCE(balance, 0) INTO v_external_payables FROM public.wallets WHERE id = 'EXTERNAL_PAYABLES';

    -- 2. Calculate Golden Equation Revenue
    -- REVENUE = (CASH + BANK) - (ESCROW + EXTERNAL_PAYABLES)
    v_golden_revenue := (v_cash + v_bank) - (v_escrow + v_external_payables);
    
    -- 3. Compare with actual REVENUE wallet
    v_imbalance := v_revenue - v_golden_revenue;
    
    -- 4. Check health (allow small rounding difference if needed, but strictly 0 is better)
    v_is_healthy := (ABS(v_imbalance) < 0.01);

    RETURN jsonb_build_object(
        'is_healthy', v_is_healthy,
        'wallets', jsonb_build_object(
            'cash', v_cash,
            'bank', v_bank,
            'escrow', v_escrow,
            'receivable', v_receivable,
            'revenue_actual', v_revenue,
            'external_payables', v_external_payables
        ),
        'calculations', jsonb_build_object(
            'total_physical_assets', v_cash + v_bank,
            'total_liabilities', v_escrow + v_external_payables,
            'revenue_expected_golden', v_golden_revenue,
            'imbalance', v_imbalance
        ),
        'accounting_equation', 'REVENUE = (CASH + BANK) - (ESCROW + EXTERNAL_PAYABLES)',
        'note', 'RECEIVABLE is currently excluded from REVENUE calculation as per Cash Basis protocol.',
        'timestamp', now()
    );
END;
$$;
