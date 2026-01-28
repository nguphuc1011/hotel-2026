-- CẬP NHẬT TRIGGER VÍ ĐỂ TUÂN THỦ KẾ TOÁN THÀNH TÍCH (ACCRUAL BASIS)
-- Doanh thu (REVENUE) tăng ngay khi Ghi nợ (CREDIT), không tăng khi Thu tiền (CASH/BANK).

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
    
    -- Xác định dấu dựa trên loại dòng tiền (IN = +, OUT = -)
    IF NEW.flow_type = 'IN' THEN
        v_sign := 1;
    ELSE
        v_sign := -1;
    END IF;

    -- ==========================================================
    -- 1. LOGIC CHO "TIỀN CỌC" (DEPOSIT IN)
    -- ==========================================================
    IF NEW.category = 'Tiền cọc' THEN
        -- Ví vật lý (Tiền thật)
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
        ELSIF NEW.payment_method_code IN ('transfer', 'credit_card', 'bank', 'qr') THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
        END IF;

        -- Ví logic: ESCROW (Theo dõi tiền cọc)
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'ESCROW';
        
        -- Tiền cọc KHÔNG phải doanh thu (Rule 8)
        RETURN NEW;
    END IF;

    -- ==========================================================
    -- 2. LOGIC CHO "GHI NỢ" (CREDIT CHARGE - KẾ TOÁN THÀNH TÍCH)
    -- ==========================================================
    IF NEW.payment_method_code = 'credit' THEN
        -- A. Tăng CÔNG NỢ KHÁCH (RECEIVABLE)
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';
        
        -- B. Tăng DOANH THU ngay lập tức (ACCRUAL REVENUE)
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';
        
        RETURN NEW;
    END IF;

    -- ==========================================================
    -- 3. LOGIC CHO "CHUYỂN CỌC" (DEPOSIT TRANSFER)
    -- ==========================================================
    IF NEW.payment_method_code = 'deposit_transfer' THEN
        -- 1. Giảm ví Cọc (Đã sử dụng)
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'ESCROW';
        -- 2. Giảm Công nợ (Dùng cọc để trả nợ)
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
        
        -- KHÔNG tăng REVENUE ở đây vì REVENUE đã được ghi nhận lúc Ghi nợ (Credit) rồi.
        
        RETURN NEW;
    END IF;

    -- ==========================================================
    -- 4. LOGIC CHO THANH TOÁN & CHI PHÍ (REALIZED)
    -- ==========================================================
    
    -- A. Cập nhật VÍ VẬT LÝ (Tiền thật: Cash/Bank)
    IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
    ELSIF NEW.payment_method_code IN ('transfer', 'credit_card', 'bank', 'qr') THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
    END IF;

    -- B. Cập nhật DOANH THU (REVENUE)
    -- CHỈ cập nhật REVENUE cho các khoản CHI PHÍ (OUT) hoặc Thu nhập trực tiếp không qua Credit.
    -- Nếu là khoản THU (IN) từ thanh toán nợ, KHÔNG tăng REVENUE nữa (vì đã tăng lúc Credit rồi).
    IF NEW.flow_type = 'OUT' THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';
    END IF;

    -- C. Cập nhật CÔNG NỢ (RECEIVABLE)
    -- Chỉ dành cho các khoản THU (IN) để cấn trừ nợ.
    IF NEW.flow_type = 'IN' THEN
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
    END IF;

    RETURN NEW;
END;
$function$;
