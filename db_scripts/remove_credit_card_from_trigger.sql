-- FIX: REMOVE 'credit_card' FROM FINANCIAL SYSTEM
-- Run this script in Supabase SQL Editor.
-- Purpose: Remove 'credit_card' from the payment method check in trg_update_wallets function
-- as per user request to completely remove card payments.

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

    -- 1. DEPOSIT (Tiền cọc)
    IF NEW.category = 'Tiền cọc' THEN
        -- Physical
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
        ELSIF NEW.payment_method_code IN ('transfer', 'bank', 'qr') THEN -- REMOVED 'credit_card'
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
        END IF;
        -- Logical: Escrow
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'ESCROW';
        RETURN NEW;
    END IF;

    -- 2. CREDIT CHARGE (Ghi nợ - Increases Receivable)
    IF NEW.payment_method_code = 'credit' THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN NEW;
    END IF;

    -- 3. DEPOSIT TRANSFER (Cọc -> Doanh thu)
    IF NEW.payment_method_code = 'deposit_transfer' THEN
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'ESCROW';
        UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'REVENUE';
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN NEW;
    END IF;

    -- 4. REALIZED PAYMENTS (Thanh toán)
    IF NEW.category IN ('Thanh toán', 'Thu nợ cũ') THEN
        -- A. Physical
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
        ELSIF NEW.payment_method_code IN ('transfer', 'bank', 'qr') THEN -- REMOVED 'credit_card'
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
        END IF;

        -- B. Revenue
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';
        
        -- C. Receivable Reduction
        IF NEW.flow_type = 'IN' THEN
            UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
        END IF;
        
        RETURN NEW;
    END IF;

    -- 5. EXPENSES (Chi vận hành)
    IF NEW.flow_type = 'OUT' AND NEW.category NOT IN ('Điều chỉnh') THEN
        -- Physical
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'CASH';
        ELSIF NEW.payment_method_code IN ('transfer', 'bank', 'qr') THEN -- REMOVED 'credit_card'
            UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'BANK';
        END IF;
        
        -- Revenue (P&L Reduction)
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'REVENUE';
        RETURN NEW;
    END IF;

    -- 6. ADJUSTMENTS (Điều chỉnh - Giảm nợ)
    IF NEW.category = 'Điều chỉnh' AND NEW.payment_method_code = 'credit' THEN
         UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';
         RETURN NEW;
    END IF;

    -- Fallback for other incomes
    IF NEW.flow_type = 'IN' THEN
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'CASH';
        ELSE
            UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'BANK';
        END IF;
        UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'REVENUE';
    END IF;

    RETURN NEW;
END;
$function$;
