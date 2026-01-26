-- FIX: Trigger Update Wallets (True 5-Fund Logic - Final Version)
-- Handles:
-- 1. Deposit (Escrow + Cash)
-- 2. Charge (Receivable +)
-- 3. Payment (Cash + Revenue + Receivable -)
-- 4. Deposit Transfer (Escrow - Revenue + Receivable -)
-- 5. Expense (Cash - Revenue -)

CREATE OR REPLACE FUNCTION public.trg_update_wallets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_amount numeric;
    v_sign integer;
BEGIN
    v_amount := COALESCE(NEW.amount, 0);
    
    -- Determine Sign based on Flow Type
    IF NEW.flow_type = 'IN' THEN
        v_sign := 1;
    ELSE
        v_sign := -1;
    END IF;

    -- ==========================================================
    -- 1. LOGIC FOR "TIỀN CỌC" (DEPOSIT IN)
    -- ==========================================================
    IF NEW.category = 'Tiền cọc' THEN
        -- Physical Wallet
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
        ELSIF NEW.payment_method_code IN ('transfer', 'credit_card', 'bank', 'qr') THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
        END IF;

        -- Logical Wallet: ESCROW (Always tracks deposits)
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'ESCROW';
        
        RETURN NEW;
    END IF;

    -- ==========================================================
    -- 2. LOGIC FOR "GHI NỢ" (CREDIT CHARGE)
    -- ==========================================================
    IF NEW.payment_method_code = 'credit' THEN
        -- Only affects RECEIVABLE (Increases Debt)
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN NEW;
    END IF;

    -- ==========================================================
    -- 3. LOGIC FOR "CHUYỂN CỌC" (DEPOSIT TRANSFER TO REVENUE)
    -- ==========================================================
    IF NEW.payment_method_code = 'deposit_transfer' THEN
        -- 1. Reduce Escrow (Used)
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'ESCROW';
        -- 2. Increase Revenue (Realized)
        UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'REVENUE';
        -- 3. Reduce Receivable (Debt paid by deposit)
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
        
        RETURN NEW;
    END IF;

    -- ==========================================================
    -- 4. LOGIC FOR PAYMENTS & EXPENSES (REALIZED)
    -- ==========================================================
    
    -- A. Update PHYSICAL WALLETS (Cash/Bank)
    IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
    ELSIF NEW.payment_method_code IN ('transfer', 'credit_card', 'bank', 'qr') THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
    END IF;

    -- B. Update REVENUE (P&L)
    -- Both Income (Payment) and Expense affect Revenue
    UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';

    -- C. Update RECEIVABLE (Debt Reduction)
    -- Only for INCOME Payments (Paying off debt)
    IF NEW.flow_type = 'IN' THEN
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
    END IF;

    RETURN NEW;
END;
$function$;
