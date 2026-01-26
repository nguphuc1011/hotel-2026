-- FINANCIAL HEALTH CHECK RPC
-- Checks the Accounting Equation: CASH + BANK = ESCROW + EXTERNAL_PAYABLES + REVENUE
-- Returns the state of all funds and any discrepancy.

CREATE OR REPLACE FUNCTION public.get_financial_health_check()
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_cash numeric;
    v_bank numeric;
    v_escrow numeric;
    v_receivable numeric;
    v_revenue numeric;
    v_ext_payables numeric;
    
    v_assets numeric;
    v_liabilities_equity numeric;
    v_diff numeric;
    v_status text;
BEGIN
    -- 1. Get Wallet Balances
    SELECT balance INTO v_cash FROM public.wallets WHERE id = 'CASH';
    SELECT balance INTO v_bank FROM public.wallets WHERE id = 'BANK';
    SELECT balance INTO v_escrow FROM public.wallets WHERE id = 'ESCROW';
    SELECT balance INTO v_receivable FROM public.wallets WHERE id = 'RECEIVABLE';
    SELECT balance INTO v_revenue FROM public.wallets WHERE id = 'REVENUE';
    
    -- 2. Get External Payables (Sum of active debts)
    -- Note: External Payables table tracks specific debts.
    -- If we treat it as a 'Fund', we should sum the remaining amount?
    -- Or does the system rely on a Wallet for it?
    -- The '12loaitien.md' mentions 'Sổ Nợ Ngoài'. 
    -- If there is no 'EXTERNAL_PAYABLES' wallet, we sum the table.
    -- However, for the equation to hold, the 'Flow' must have updated a Wallet or we calculate it.
    -- Let's assume we sum the table for now.
    SELECT COALESCE(SUM(amount - paid_amount), 0) INTO v_ext_payables 
    FROM public.external_payables 
    WHERE status = 'active';

    -- 3. Calculate Equation (Cash Basis)
    -- Liquid Assets = CASH + BANK
    -- Claims = ESCROW (Customer) + EXTERNAL_PAYABLES (Owner/Supplier) + REVENUE (Owner Profit)
    v_assets := COALESCE(v_cash, 0) + COALESCE(v_bank, 0);
    v_liabilities_equity := COALESCE(v_escrow, 0) + COALESCE(v_ext_payables, 0) + COALESCE(v_revenue, 0);
    v_diff := v_assets - v_liabilities_equity;
    
    IF v_diff = 0 THEN
        v_status := 'BALANCED';
    ELSE
        v_status := 'IMBALANCED';
    END IF;

    RETURN json_build_object(
        'status', v_status,
        'diff', v_diff,
        'assets', json_build_object(
            'total', v_assets,
            'cash', v_cash,
            'bank', v_bank
        ),
        'liabilities_equity', json_build_object(
            'total', v_liabilities_equity,
            'escrow', v_escrow,
            'external_payables', v_ext_payables,
            'revenue', v_revenue
        ),
        'receivable_pending', v_receivable -- Informational only for Cash Basis
    );
END;
$function$;
