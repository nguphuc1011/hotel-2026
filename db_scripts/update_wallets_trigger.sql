-- FIX: Trigger Update Wallets (Full Logic according to Ketoan.md)
-- 1. Handle CASH/BANK updates based on payment_method
-- 2. Handle ESCROW (Tiền cọc)
-- 3. Handle RECEIVABLE (Credit/Ghi nợ)
-- 4. Handle REVENUE (P&L)

CREATE OR REPLACE FUNCTION public.trg_update_wallets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_amount numeric;
    v_sign integer;
BEGIN
    -- 1. Determine Amount & Direction
    v_amount := COALESCE(NEW.amount, 0);
    
    IF NEW.flow_type = 'IN' THEN
        v_sign := 1;
    ELSE
        v_sign := -1;
    END IF;

    -- 2. Update PHYSICAL Wallets (Source/Destination of Funds)
    -- CASH
    IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
        UPDATE public.wallets 
        SET balance = balance + (v_amount * v_sign),
            updated_at = now()
        WHERE id = 'CASH';
        
    -- BANK (Transfer, Credit Card, etc.)
    ELSIF NEW.payment_method_code IN ('transfer', 'credit_card', 'bank') THEN
        UPDATE public.wallets 
        SET balance = balance + (v_amount * v_sign),
            updated_at = now()
        WHERE id = 'BANK';
        
    -- RECEIVABLE (Credit/Ghi nợ - Non-cash transaction)
    ELSIF NEW.payment_method_code = 'credit' THEN
        -- If 'credit' IN (Revenue) -> Receivable Increases
        -- If 'credit' OUT (Refund?) -> Receivable Decreases
        UPDATE public.wallets 
        SET balance = balance + (v_amount * v_sign),
            updated_at = now()
        WHERE id = 'RECEIVABLE';
    END IF;

    -- 3. Update LOGICAL Wallets (Purpose/Allocation)
    
    -- ESCROW (Tiền cọc)
    IF NEW.category = 'Tiền cọc' THEN
        -- Deposit IN -> Escrow Increases (Liability)
        -- Deposit OUT (Refund/Settle) -> Escrow Decreases
        UPDATE public.wallets 
        SET balance = balance + (v_amount * v_sign),
            updated_at = now()
        WHERE id = 'ESCROW';
    
    -- REVENUE (Sổ Doanh Thu - P&L)
    -- Update Revenue for Income/Expense categories (excluding Deposit)
    ELSIF NEW.category NOT IN ('Tiền cọc', 'Fund Transfer', 'Adjustment') THEN
        -- Note: We track Net Income here (IN - OUT)
        -- Only if it's NOT a Credit transaction? 
        -- Ketoan.md: "Sổ Doanh Thu... Chỉ ghi tăng khi các khoản nợ hoặc cọc được Giải phóng" (Cash Basis/Realized)
        -- So if payment_method = 'credit', we do NOT update Revenue yet?
        -- Let's assume REVENUE wallet tracks Realized Revenue (Cash/Bank)
        
        IF NEW.payment_method_code != 'credit' THEN
            UPDATE public.wallets 
            SET balance = balance + (v_amount * v_sign),
                updated_at = now()
            WHERE id = 'REVENUE';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- Ensure Trigger exists
DROP TRIGGER IF EXISTS tr_update_wallets ON public.cash_flow;
CREATE TRIGGER tr_update_wallets
    AFTER INSERT ON public.cash_flow
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_update_wallets();
