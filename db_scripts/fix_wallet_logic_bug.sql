-- FIX WALLET LOGIC BUG: Owner Equity was affecting BANK wallet and ignoring REVENUE
-- Date: 2025-05-24
-- Author: Trae (AI Assistant)

CREATE OR REPLACE FUNCTION public.fn_apply_wallet_logic(p_rec cash_flow, p_sign_multiplier integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_amount numeric := COALESCE(p_rec.amount, 0);
    v_flow_sign integer := CASE WHEN p_rec.flow_type = 'IN' THEN 1 ELSE -1 END;
    v_final_sign integer := v_flow_sign * p_sign_multiplier;
BEGIN
    -- 1. LOGIC FOR "TIỀN CỌC" (DEPOSIT)
    IF p_rec.category = 'Tiền cọc' THEN
        -- Physical Wallet
        IF p_rec.payment_method_code IN ('cash', NULL) THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'CASH';
        ELSE
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'BANK';
        END IF;
        -- Logical Wallet: ESCROW
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'ESCROW';
        RETURN;
    END IF;

    -- 2. LOGIC FOR "GHI NỢ" (CREDIT CHARGE)
    IF p_rec.payment_method_code = 'credit' THEN
        -- Only affects RECEIVABLE (Increases Debt)
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'RECEIVABLE';
        
        -- Also affects REVENUE (Accrual accounting: revenue is recognized when charged)
        -- Skip for 'Trả nợ'
        IF p_rec.category NOT IN ('Trả nợ') THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE';
        END IF;
        RETURN;
    END IF;

    -- 3. LOGIC FOR "CHUYỂN CỌC" (DEPOSIT TRANSFER)
    IF p_rec.payment_method_code = 'deposit_transfer' THEN
        -- Note: Transfer is special, we don't use v_flow_sign here because it's a balanced internal movement
        -- If p_sign_multiplier = 1 (Apply), we do the transfer.
        -- If p_sign_multiplier = -1 (Reverse), we reverse the transfer.
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'ESCROW';
        UPDATE public.wallets SET balance = balance + (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'REVENUE';
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN;
    END IF;

    -- 4. LOGIC FOR PAYMENTS & EXPENSES
    
    -- A. Update PHYSICAL WALLETS (Cash/Bank)
    -- [CRITICAL FIX]: Skip PHYSICAL update if payment method is 'owner_equity' (Owner pays from pocket)
    IF p_rec.payment_method_code NOT IN ('owner_equity') THEN
        IF p_rec.payment_method_code IN ('cash', NULL) THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'CASH';
        ELSE
            -- Default to BANK for transfer, card, etc.
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'BANK';
        END IF;
    END IF;

    -- B. Update REVENUE (P&L)
    -- [CRITICAL FIX]: Allow 'owner_equity' to affect REVENUE (Expense should reduce P&L)
    -- Skip 'Trả nợ' (Liability reduction, not Expense)
    IF p_rec.category NOT IN ('Trả nợ') THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE';
    END IF;

    -- C. Update RECEIVABLE (Debt Reduction)
    -- When a PAYMENT (not credit) is received, it reduces Receivable.
    IF p_rec.flow_type = 'IN' AND p_rec.payment_method_code NOT IN ('credit', 'owner_equity', 'deposit_transfer') THEN
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'RECEIVABLE';
    END IF;
END;
$function$;
