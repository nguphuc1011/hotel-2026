
-- CHUYỂN ĐỔI SANG KẾ TOÁN THÀNH TÍCH (ACCRUAL BASIS)
-- Theo lệnh Quân Sư: Check-in = Doanh thu; Cọc = Trừ Nợ.

CREATE OR REPLACE FUNCTION public.fn_apply_wallet_logic(
    p_rec record,
    p_sign_multiplier integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_amount numeric := COALESCE(p_rec.amount, 0);
    v_flow_sign integer := CASE WHEN p_rec.flow_type = 'IN' THEN 1 ELSE -1 END;
    v_final_sign integer := v_flow_sign * p_sign_multiplier;      
    v_method text := lower(COALESCE(p_rec.payment_method_code, 'cash'));
BEGIN
    -- 1. CREDIT (Ghi nợ): Tăng Nợ + Tăng Doanh thu (Chốt sổ ngay)
    IF v_method = 'credit' THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'RECEIVABLE';
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE';
        RETURN;
    END IF;

    -- 2. DEPOSIT (Tiền cọc): Tăng Cash + Giảm Nợ (Bypass Escrow)
    IF p_rec.category = 'Tiền cọc' THEN
        -- Tăng tiền thực
        IF v_method = 'cash' THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'CASH';
        ELSE
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'BANK';
        END IF;
        
        -- Giảm nợ khách (Receivable) - Thay vì tăng Escrow
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN;
    END IF;

    -- 3. OWNER EQUITY: Unchanged
    IF v_method = 'owner_equity' THEN
         IF p_rec.category NOT IN ('Trả nợ') THEN
             UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE';
         END IF;
         RETURN;
    END IF;

    -- 4. STANDARD PAYMENT (Thanh toán): Tăng Cash + Giảm Nợ
    -- A. Update Physical Wallet
    IF v_method = 'cash' THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'CASH';
    ELSE
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'BANK';
    END IF;

    -- B. Debt Reduction (Receivable)
    IF p_rec.flow_type = 'IN' THEN
        -- Khách trả tiền -> Giảm nợ
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'RECEIVABLE';
    ELSE
        -- Chi phí (OUT) -> Giảm Doanh thu (Trừ trường hợp Trả nợ)
        IF p_rec.category NOT IN ('Trả nợ') THEN
             UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE';
        END IF;
    END IF;

END;
$$;
