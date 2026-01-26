-- 1. Create External Payables Table (Sổ Nợ Ngoài)
-- Tracks individual debt items (e.g., Owner paid electricity, Hotel owes Owner).
CREATE TABLE IF NOT EXISTS public.external_payables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creditor_name TEXT NOT NULL, -- e.g., 'Chủ đầu tư', 'NCC Viettel'
    amount NUMERIC NOT NULL CHECK (amount > 0),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paid'))
);

-- Enable RLS (Optional but good practice)
ALTER TABLE public.external_payables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for authenticated users" ON public.external_payables FOR ALL USING (true);


-- 2. Update Wallet Trigger to handle Owner Equity and Repayment Logic
-- Changes:
--   a. 'owner_equity' payment method -> No Physical Wallet update, but updates REVENUE (Expense).
--   b. 'Trả nợ' category -> Physical Wallet update (Money out), but NO REVENUE update (Not an expense).

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
        ELSIF NEW.payment_method_code IN ('transfer', 'credit_card', 'bank', 'qr') THEN
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

    -- 4. REALIZED PAYMENTS (Thanh toán / Thu nợ cũ)
    IF NEW.category IN ('Thanh toán', 'Thu nợ cũ') THEN
        -- A. Physical
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
        ELSIF NEW.payment_method_code IN ('transfer', 'credit_card', 'bank', 'qr') THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
        END IF;

        -- B. Revenue
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';
        
        -- C. Receivable Reduction (if IN)
        IF NEW.flow_type = 'IN' THEN
            UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
        END IF;
        
        RETURN NEW;
    END IF;

    -- 5. EXPENSES (Chi vận hành) & REPAYMENTS (Trả nợ)
    IF NEW.flow_type = 'OUT' AND NEW.category NOT IN ('Điều chỉnh') THEN
        -- A. Physical Wallet Update
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'CASH'; -- OUT is positive amount
        ELSIF NEW.payment_method_code IN ('transfer', 'credit_card', 'bank', 'qr') THEN
            UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'BANK';
        END IF;
        -- Note: If 'owner_equity', no Physical update.

        -- B. Revenue (P&L Reduction)
        -- Only reduce Revenue if it's NOT a Debt Repayment
        IF NEW.category NOT IN ('Trả nợ') THEN
            UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'REVENUE';
        END IF;
        
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


-- 3. Helper Function: Record Owner Expense (Chủ chi)
CREATE OR REPLACE FUNCTION record_owner_expense(
    p_amount numeric,
    p_description text,
    p_creditor_name text DEFAULT 'Chủ đầu tư'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_payable_id uuid;
BEGIN
    -- A. Record Debt in Sổ Nợ Ngoài
    INSERT INTO public.external_payables (creditor_name, amount, description, status)
    VALUES (p_creditor_name, p_amount, p_description, 'active')
    RETURNING id INTO v_payable_id;

    -- B. Record Expense in Cash Flow (affects REVENUE, skips CASH/BANK)
    INSERT INTO public.cash_flow (
        flow_type, category, amount, description, 
        payment_method_code, wallet_id, created_by, occurred_at
    ) VALUES (
        'OUT', 'Chi vận hành', p_amount, p_description || ' (Chủ chi)',
        'owner_equity', 'REVENUE', 
        NULL, -- System/Admin
        now()
    );

    RETURN jsonb_build_object('success', true, 'payable_id', v_payable_id);
END;
$$;


-- 4. Helper Function: Repay Debt (Trả nợ Chủ)
CREATE OR REPLACE FUNCTION repay_owner_debt(
    p_payable_id uuid,
    p_payment_method text -- 'cash' or 'transfer'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_debt_record RECORD;
BEGIN
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
        p_payment_method, 
        CASE WHEN p_payment_method = 'cash' THEN 'CASH' ELSE 'BANK' END,
        NULL,
        now()
    );

    -- B. Close Debt in Sổ Nợ Ngoài ("Biến mất" - or mark paid)
    -- User said "Biến mất", but deleting is risky for audit. Let's delete for now to match user mental model exactly, 
    -- OR update status='paid' and filter out in UI.
    -- "Khoản ghi trong Sổ Nợ Ngoài biến mất".
    -- I will DELETE it to be exact, or move to history table? 
    -- Let's UPDATE status = 'paid' for safety, but UI should hide it.
    -- User's prompt: "Khoản ghi... biến mất".
    -- I'll stick to UPDATE 'paid' for data integrity, but explain it.
    
    UPDATE public.external_payables SET status = 'paid', updated_at = now() WHERE id = p_payable_id;

    RETURN jsonb_build_object('success', true, 'message', 'Đã trả nợ thành công.');
END;
$$;
