-- ====================================================================================
-- 🏦 SCRIPT: NHẤT THỐNG SỔ CÁI & CƠ CHẾ TÀI CHÍNH ATOMIC
-- 📜 Trích dẫn Điều 8: "Bộ não Backend là nguồn sự thật duy nhất."
-- 📜 Trích dẫn Điều 6: "Thanh trừng code rác và logic trùng lặp."
-- Mô tả: Gộp ví trùng, chuẩn hóa danh mục, và nâng cấp trigger xử lý tiền theo ID.
-- ====================================================================================

BEGIN;

-- 1. CHUẨN HÓA BẢNG WALLETS (THANH TRỪNG TRÙNG LẶP)
-- Tạo bảng tạm để lưu số dư gộp
CREATE TEMP TABLE consolidated_wallets AS
SELECT 
    hotel_id,
    CASE 
        WHEN id IN ('CASH', 'Tiền mặt', 'Quỹ Tiền Mặt') THEN 'CASH'
        WHEN id IN ('BANK', 'Ngân hàng', 'Quỹ Ngân Hàng') THEN 'BANK'
        WHEN id IN ('REVENUE', 'Doanh thu', 'Sổ Doanh Thu') THEN 'REVENUE'
        WHEN id IN ('RECEIVABLE', 'Công nợ tạm') THEN 'RECEIVABLE'
        WHEN id IN ('DEBT', 'Công nợ khách') THEN 'DEBT'
        WHEN id IN ('ESCROW', 'Tiền cọc') THEN 'ESCROW'
        ELSE id 
    END as target_id,
    SUM(balance) as total_balance
FROM public.wallets
GROUP BY hotel_id, target_id;

-- Xóa toàn bộ ví cũ
DELETE FROM public.wallets;

-- Chèn lại dữ liệu đã gộp với tên chuẩn
INSERT INTO public.wallets (id, hotel_id, name, balance, updated_at)
SELECT 
    target_id, 
    hotel_id,
    CASE 
        WHEN target_id = 'CASH' THEN 'Quỹ Tiền Mặt'
        WHEN target_id = 'BANK' THEN 'Quỹ Ngân Hàng'
        WHEN target_id = 'REVENUE' THEN 'Sổ Doanh Thu'
        WHEN target_id = 'RECEIVABLE' THEN 'Công nợ tạm (Khách đang ở)'
        WHEN target_id = 'DEBT' THEN 'Công nợ khách cũ'
        WHEN target_id = 'ESCROW' THEN 'Tiền cọc (Escrow)'
        ELSE target_id
    END,
    total_balance,
    now()
FROM consolidated_wallets;

-- 2. CHUẨN HÓA DANH MỤC THU CHI (CASH_FLOW_CATEGORIES)
-- Thêm cột system_code để trigger không phải đọc chữ đoán nghĩa
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cash_flow_categories' AND column_name='system_code') THEN
        ALTER TABLE public.cash_flow_categories ADD COLUMN system_code text;
    END IF;
END $$;

-- Gắn mã hệ thống cho các danh mục cốt lõi
UPDATE public.cash_flow_categories SET system_code = 'ROOM_CHARGE' WHERE name IN ('Tiền phòng', 'Thanh toán tiền phòng');
UPDATE public.cash_flow_categories SET system_code = 'SERVICE_CHARGE' WHERE name IN ('Bán dịch vụ');
UPDATE public.cash_flow_categories SET system_code = 'SETTLEMENT' WHERE name IN ('Thanh toán');
UPDATE public.cash_flow_categories SET system_code = 'DEPOSIT' WHERE name IN ('Tiền cọc');
UPDATE public.cash_flow_categories SET system_code = 'DEPOSIT_TRANSFER' WHERE name IN ('Chuyển cọc');
UPDATE public.cash_flow_categories SET system_code = 'DEBT_TRANSFER' WHERE name IN ('Kết chuyển nợ');
UPDATE public.cash_flow_categories SET system_code = 'DEBT_REPAYMENT' WHERE name IN ('Thu nợ khách');
UPDATE public.cash_flow_categories SET system_code = 'REFUND' WHERE name IN ('Hoàn tiền hủy phòng', 'Hoàn cọc');

-- 3. NÂNG CẤP TRIGGER XỬ LÝ TIỀN (fn_sync_wallets) - BẢN ATOMIC V2
CREATE OR REPLACE FUNCTION public.fn_sync_wallets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_delta NUMERIC;
    v_flow_sign INTEGER; -- 1 cho IN, -1 cho OUT
    v_method TEXT;
    v_sys_code TEXT;
    v_hotel_id uuid;
    v_is_revenue BOOLEAN;
BEGIN
    -- [A] XÁC ĐỊNH THÔNG SỐ CƠ BẢN
    IF (TG_OP = 'DELETE') THEN
        v_delta := COALESCE(OLD.amount, 0);
        v_method := lower(COALESCE(OLD.payment_method_code, 'cash'));
        v_hotel_id := OLD.hotel_id;
        v_flow_sign := CASE WHEN OLD.flow_type = 'IN' THEN 1 ELSE -1 END;
        -- Khi xóa, ta đảo ngược tác động (nhân với -1)
        v_delta := v_delta * -1;
        SELECT system_code, is_revenue INTO v_sys_code, v_is_revenue FROM public.cash_flow_categories WHERE id = OLD.category_id;
    ELSE
        v_delta := CASE WHEN TG_OP = 'INSERT' THEN COALESCE(NEW.amount, 0)
                        ELSE COALESCE(NEW.amount, 0) - COALESCE(OLD.amount, 0) END;
        v_method := lower(COALESCE(NEW.payment_method_code, 'cash'));
        v_hotel_id := NEW.hotel_id;
        v_flow_sign := CASE WHEN NEW.flow_type = 'IN' THEN 1 ELSE -1 END;
        SELECT system_code, is_revenue INTO v_sys_code, v_is_revenue FROM public.cash_flow_categories WHERE id = NEW.category_id;
    END IF;

    IF v_delta = 0 AND TG_OP = 'UPDATE' THEN RETURN NULL; END IF;
    v_is_revenue := COALESCE(v_is_revenue, true);

    -- [B] LOGIC VÍ VẬT LÝ (CASH/BANK)
    -- Tiền thật vào/ra khỏi két
    IF v_method IN ('cash', 'bank') THEN
        UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now()
        WHERE id = upper(v_method) AND hotel_id = v_hotel_id;
    END IF;

    -- [C] LOGIC CÔNG NỢ TẠM (RECEIVABLE) - Dành cho 'credit'
    -- Tăng nợ khi dùng dịch vụ/phòng (Credit IN)
    IF v_method = 'credit' THEN
        UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now()
        WHERE id = 'RECEIVABLE' AND hotel_id = v_hotel_id;
    END IF;
    -- Giảm nợ tạm khi: Thanh toán, Chuyển cọc, hoặc Kết chuyển sang nợ cũ
    IF v_sys_code IN ('SETTLEMENT', 'DEPOSIT_TRANSFER', 'DEBT_TRANSFER') OR v_method IN ('deposit_transfer', 'debt_transfer') THEN
        UPDATE public.wallets SET balance = balance - (v_delta * v_flow_sign), updated_at = now()
        WHERE id = 'RECEIVABLE' AND hotel_id = v_hotel_id;
    END IF;

    -- [D] LOGIC TIỀN CỌC (ESCROW)
    IF v_sys_code = 'DEPOSIT' THEN
        UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now()
        WHERE id = 'ESCROW' AND hotel_id = v_hotel_id;
    END IF;
    -- Giảm cọc khi chuyển sang tiền phòng
    IF v_sys_code = 'DEPOSIT_TRANSFER' OR v_method = 'deposit_transfer' THEN
        UPDATE public.wallets SET balance = balance - (v_delta * v_flow_sign), updated_at = now()
        WHERE id = 'ESCROW' AND hotel_id = v_hotel_id;
    END IF;

    -- [E] LOGIC NỢ CŨ (DEBT)
    IF v_sys_code = 'DEBT_TRANSFER' OR v_method = 'debt_transfer' THEN
        UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now()
        WHERE id = 'DEBT' AND hotel_id = v_hotel_id;
    END IF;
    IF v_sys_code = 'DEBT_REPAYMENT' THEN
        UPDATE public.wallets SET balance = balance - (v_delta * v_flow_sign), updated_at = now()
        WHERE id = 'DEBT' AND hotel_id = v_hotel_id;
    END IF;

    -- [F] SỔ DOANH THU (REVENUE) - Accrual Basis
    -- Chỉ tính Doanh thu cho các khoản phát sinh dịch vụ/phòng (Credit IN)
    -- Loại trừ các khoản thanh toán/thu nợ/cọc để tránh trùng lặp
    IF v_flow_sign = 1 AND v_is_revenue 
       AND v_sys_code NOT IN ('SETTLEMENT', 'DEBT_REPAYMENT', 'DEPOSIT', 'DEPOSIT_TRANSFER', 'DEBT_TRANSFER') 
       AND v_method NOT IN ('deposit_transfer', 'debt_transfer') THEN
        UPDATE public.wallets SET balance = balance + v_delta, updated_at = now()
        WHERE id = 'REVENUE' AND hotel_id = v_hotel_id;
    END IF;

    -- Xử lý hoàn trả doanh thu (Refund/Cancel)
    IF v_flow_sign = -1 AND v_sys_code = 'REFUND' THEN
        UPDATE public.wallets SET balance = balance - v_delta, updated_at = now()
        WHERE id = 'REVENUE' AND hotel_id = v_hotel_id;
    END IF;

    RETURN NULL;
END; $function$;

COMMIT;
