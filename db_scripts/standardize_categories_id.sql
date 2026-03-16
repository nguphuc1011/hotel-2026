-- ====================================================================================
-- SCRIPT CHUẨN HÓA DANH MỤC THU CHI VÀ KẾT NỐI ID CHO CASH_FLOW
-- MỤC TIÊU: Loại bỏ việc dùng TEXT để định danh danh mục, chuyển sang dùng ID duy nhất.
-- ====================================================================================

DO $$
BEGIN
    -- 1. Thêm cột category_id vào bảng cash_flow
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_flow' AND column_name = 'category_id') THEN
        ALTER TABLE public.cash_flow ADD COLUMN category_id UUID REFERENCES public.cash_flow_categories(id);
    END IF;
END $$;

-- 2. Chuẩn hóa dữ liệu trong cash_flow_categories (Đảm bảo mỗi hotel có đủ danh mục hệ thống)
-- Gộp các tên trùng lặp hoặc tương đương về một chuẩn duy nhất
-- Bước này chỉ là cập nhật text để bước sau map sang ID dễ dàng hơn
UPDATE public.cash_flow SET category = 'Tiền phòng' WHERE category IN ('Tiền phòng', 'Thanh toán tiền phòng', 'Thanh toán trả phòng');
UPDATE public.cash_flow SET category = 'Bán dịch vụ' WHERE category IN ('Bán dịch vụ', 'Thanh toán dịch vụ');
UPDATE public.cash_flow SET category = 'Nhập hàng' WHERE category IN ('Nhập hàng', 'NHAP_HANG');
UPDATE public.cash_flow SET category = 'Tiền cọc' WHERE category IN ('Tiền cọc', 'Thu trước');
UPDATE public.cash_flow SET category = 'Thanh toán' WHERE category IN ('Thanh toán', 'Thu nợ cũ', 'Thu nợ khách', 'Thu nợ');

-- 3. Mapping category_id dựa trên category (text) và hotel_id
UPDATE public.cash_flow cf
SET category_id = cat.id
FROM public.cash_flow_categories cat
WHERE cf.category = cat.name 
  AND cf.flow_type = cat.type
  AND cf.hotel_id = cat.hotel_id;

-- 4. Xử lý các trường hợp không tìm thấy category_id (Tạo danh mục 'Khác' nếu cần)
-- (Tùy chọn: Có thể kiểm tra các bản ghi null category_id sau bước này)

-- 5. Cập nhật các hàm RPC quan trọng để dùng ID (Pseudocode logic)
-- Chúng ta sẽ cần cập nhật: process_checkout, fn_manage_cash_flow_category, trg_update_wallets_dml

-- CẬP NHẬT TRG_UPDATE_WALLETS_DML ĐỂ ƯU TIÊN KIỂM TRA THEO ID HOẶC TÍNH CHẤT CỦA CATEGORY
CREATE OR REPLACE FUNCTION public.trg_update_wallets_dml()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_amount numeric;
    v_sign integer;
    v_payment_method text;
    v_is_revenue boolean;
    v_category_name text;
BEGIN
    v_amount := NEW.amount;
    v_sign := CASE WHEN NEW.flow_type = 'IN' THEN 1 ELSE -1 END;
    v_payment_method := lower(COALESCE(NEW.payment_method_code, 'cash'));
    
    -- Lấy thông tin từ bảng danh mục (Sử dụng category_id)
    SELECT name, is_revenue INTO v_category_name, v_is_revenue 
    FROM public.cash_flow_categories 
    WHERE id = NEW.category_id;

    -- Nếu không có ID, fallback về text (để tương thích ngược tạm thời)
    IF v_category_name IS NULL THEN
        v_category_name := NEW.category;
        v_is_revenue := true; -- Mặc định
    END IF;

    -- LOGIC CŨ DỰA TRÊN v_category_name VÀ v_payment_method...
    -- (Tiếp tục logic từ fix_all_wallet_flows.sql nhưng sạch hơn)
    
    -- Ví dụ xử lý Thanh toán/Doanh thu
    IF v_category_name IN ('Thanh toán', 'Tiền phòng') THEN
        -- Cập nhật CASH/BANK/REVENUE/RECEIVABLE...
    END IF;

    RETURN NEW;
END;
$$;
