-- FIX ALL FINANCIAL LOGIC (STRICT MODE)
-- Author: Trae (AI Assistant)
-- Date: 2026-01-26
-- Reference: 12loaitien.md (Cash Basis Protocol)

CREATE OR REPLACE FUNCTION public.fn_apply_wallet_logic(p_rec cash_flow, p_sign_multiplier integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_amount numeric := COALESCE(p_rec.amount, 0);
    v_flow_sign integer := CASE WHEN p_rec.flow_type = 'IN' THEN 1 ELSE -1 END;
    v_final_sign integer := v_flow_sign * p_sign_multiplier;
    v_method text := lower(COALESCE(p_rec.payment_method_code, 'cash')); -- Normalize to lowercase, default to cash
BEGIN
    -- ==================================================================================
    -- 1. SPECIAL CASE: DEPOSIT (Tiền cọc)
    -- Rule: Tăng Két/Bank + Tăng Quỹ Tạm Giữ (Escrow). KHÔNG tăng Doanh thu.
    -- ==================================================================================
    IF p_rec.category = 'Tiền cọc' THEN
        -- A. Physical Wallet (Tiền thực vào đâu?)
        IF v_method = 'cash' THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'CASH';
        ELSE
            -- Bank, Transfer, QR, Card... -> All go to BANK
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'BANK';
        END IF;
        
        -- B. Logical Wallet (Tiền của ai?) -> Của Khách (Escrow)
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'ESCROW';
        RETURN;
    END IF;

    -- ==================================================================================
    -- 2. SPECIAL CASE: DEPOSIT TRANSFER (Chuyển cọc thành Doanh thu)
    -- Rule: Giảm Escrow -> Tăng Revenue -> Giảm Nợ Khách (Receivable)
    -- ==================================================================================
    IF v_method = 'deposit_transfer' THEN
        -- p_sign_multiplier = 1 (Apply), -1 (Reverse)
        -- Chuyển từ Escrow sang Revenue
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'ESCROW';
        UPDATE public.wallets SET balance = balance + (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'REVENUE';
        
        -- Trừ vào nợ của khách (Vì khách đã dùng cọc để trả)
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN;
    END IF;

    -- ==================================================================================
    -- 3. SPECIAL CASE: CREDIT (Ghi nợ / Charge)
    -- Rule: Chỉ tăng Nợ Khách (Receivable). CHƯA ghi nhận Doanh thu (Cash Basis).
    -- ==================================================================================
    IF v_method = 'credit' THEN
        -- Tăng nợ khách
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'RECEIVABLE';
        
        -- [FIX]: REMOVED REVENUE UPDATE HERE. 
        -- Revenue is only recognized when PAID (Cash/Bank) or Transferred.
        RETURN;
    END IF;

    -- ==================================================================================
    -- 4. SPECIAL CASE: OWNER EQUITY (Chủ chi / Vốn chủ)
    -- Rule: Không đụng vào Két/Bank. Chỉ ảnh hưởng Doanh thu (Chi phí).
    -- ==================================================================================
    IF v_method = 'owner_equity' THEN
        -- [FIX]: NO Physical Wallet Update (CASH/BANK Unchanged)
        
        -- Revenue Update (P&L)
        -- Nếu là Chi phí (OUT) -> Giảm Revenue (Lợi nhuận giảm).
        -- Nếu là Nạp vốn (IN) -> Không ảnh hưởng Revenue (Chỉ tăng nợ công ty với chủ - handled by external_payables table logic).
        -- Ở đây ta chỉ xử lý cash_flow logic. 
        -- Thông thường 'Chi vận hành' (OUT) sẽ vào đây.
        IF p_rec.category NOT IN ('Trả nợ') THEN
             UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE';
        END IF;
        RETURN;
    END IF;

    -- ==================================================================================
    -- 5. STANDARD PAYMENTS (Thanh toán thường: Cash, Bank, Transfer...)
    -- Rule: Tăng Két/Bank + Tăng Doanh thu + Giảm Nợ Khách
    -- ==================================================================================
    
    -- A. Update Physical Wallet
    IF v_method = 'cash' THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'CASH';
    ELSE
        -- Default catch-all for bank, transfer, card, qr...
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'BANK';
    END IF;

    -- B. Update Revenue (Ghi nhận Doanh thu THỰC)
    -- Trừ trường hợp 'Trả nợ' (Trả nợ chủ/NCC không phải là Doanh thu/Chi phí, mà là giảm nợ)
    -- Nhưng 'Trả nợ' thường là OUT. OUT -> Revenue giảm? 
    -- 'Trả nợ' (Repay Debt) -> Cash giảm. Revenue KHÔNG ĐỔI (Vì chi phí đã tính lúc 'Chủ chi' rồi).
    -- Vậy nếu category = 'Trả nợ', ta SKIP Revenue update.
    IF p_rec.category NOT IN ('Trả nợ') THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign), updated_at = now() WHERE id = 'REVENUE';
    END IF;

    -- C. Update Receivable (Giảm nợ khách)
    -- Nếu đây là dòng tiền VÀO (Khách trả tiền) -> Giảm Receivable
    -- (Trừ các loại đã xử lý riêng ở trên: Credit, Deposit, OwnerEquity)
    IF p_rec.flow_type = 'IN' THEN
         -- Giảm nợ tương ứng với số tiền khách trả
         UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier), updated_at = now() WHERE id = 'RECEIVABLE';
    END IF;

END;
$function$;
