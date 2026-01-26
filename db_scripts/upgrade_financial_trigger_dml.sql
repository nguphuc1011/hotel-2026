-- UPGRADE: trg_update_wallets to handle INSERT, UPDATE, DELETE
-- This ensures the Wallets (Két) always match the Cash Flow (Sổ) even if records are edited or deleted.

CREATE OR REPLACE FUNCTION public.fn_apply_wallet_logic(p_rec public.cash_flow, p_sign_multiplier integer) 
RETURNS void AS $$
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
    IF p_rec.payment_method_code IN ('cash', NULL) THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'CASH';
    ELSE
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'BANK';
    END IF;

    -- B. Update REVENUE (Skip 'Trả nợ' and 'owner_equity' - owner_equity is handled manually or separately)
    IF p_rec.category NOT IN ('Trả nợ') AND p_rec.payment_method_code NOT IN ('owner_equity') THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE';
    END IF;

    -- C. Update RECEIVABLE (Debt Reduction)
    -- When a PAYMENT (not credit) is received, it reduces Receivable.
    IF p_rec.flow_type = 'IN' AND p_rec.payment_method_code NOT IN ('credit', 'owner_equity', 'deposit_transfer') THEN
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'RECEIVABLE';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- THE MAIN TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.trg_update_wallets_dml() RETURNS trigger AS $$
BEGIN
    -- 1. Reverse OLD effect
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        PERFORM public.fn_apply_wallet_logic(OLD, -1);
    END IF;

    -- 2. Apply NEW effect
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        PERFORM public.fn_apply_wallet_logic(NEW, 1);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach Trigger
DROP TRIGGER IF EXISTS tr_update_wallets ON public.cash_flow;
CREATE TRIGGER tr_update_wallets
    AFTER INSERT OR UPDATE OR DELETE ON public.cash_flow
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_update_wallets_dml();
