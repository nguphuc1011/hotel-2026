-- 1. ADD is_revenue COLUMN
ALTER TABLE public.cash_flow_categories 
ADD COLUMN IF NOT EXISTS is_revenue BOOLEAN DEFAULT TRUE;

-- 2. UPDATE DEFAULT DATA (Non-Revenue items)
UPDATE public.cash_flow_categories 
SET is_revenue = FALSE 
WHERE name IN (
    'Tiền cọc', 
    'Hoàn cọc', 
    'Thu nợ', 
    'Trả nợ', 
    'Rút vốn', 
    'Nạp vốn', 
    'Chuyển quỹ', 
    'Vay nợ', 
    'Trả nợ vay'
);

-- 3. UPDATE RPC to Get Categories (Include is_revenue)
DROP FUNCTION IF EXISTS public.fn_get_cash_flow_categories(text);

CREATE OR REPLACE FUNCTION public.fn_get_cash_flow_categories(
    p_type text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    name text,
    type text,
    description text,
    is_system boolean,
    is_active boolean,
    is_revenue boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT c.id, c.name, c.type, c.description, c.is_system, c.is_active, c.is_revenue
    FROM public.cash_flow_categories c
    WHERE (p_type IS NULL OR c.type = p_type)
      AND c.is_active = true
    ORDER BY c.is_system DESC, c.name ASC;
END;
$$;

-- 4. UPDATE RPC to Manage Categories (Handle is_revenue)
DROP FUNCTION IF EXISTS public.fn_manage_cash_flow_category(text, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.fn_manage_cash_flow_category(
    p_action text,
    p_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_type text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_is_revenue boolean DEFAULT TRUE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_system boolean;
BEGIN
    IF p_action = 'CREATE' THEN
        IF EXISTS (SELECT 1 FROM public.cash_flow_categories WHERE name = p_name AND type = p_type) THEN
             RETURN jsonb_build_object('success', false, 'message', 'Tên danh mục đã tồn tại');
        END IF;
        
        INSERT INTO public.cash_flow_categories (name, type, description, is_revenue)
        VALUES (p_name, p_type, p_description, p_is_revenue);
        
        RETURN jsonb_build_object('success', true, 'message', 'Thêm danh mục thành công');
        
    ELSIF p_action = 'UPDATE' THEN
        SELECT is_system INTO v_is_system FROM public.cash_flow_categories WHERE id = p_id;
        IF v_is_system THEN
             -- System categories: Only update description (and maybe is_revenue if user wants?)
             -- User request implies adding toggle, so we should allow updating is_revenue for user categories.
             -- For system categories? "Tiền phòng", "Bán dịch vụ", "Phụ thu" should probably stay Revenue=TRUE.
             -- But let's allow updating is_revenue generally if needed, except for critical ones?
             -- "ẨN DANH MỤC HỆ THỐNG" -> user can't select them anyway.
             -- Let's just allow update.
             UPDATE public.cash_flow_categories
             SET description = COALESCE(p_description, description),
                 is_revenue = COALESCE(p_is_revenue, is_revenue)
             WHERE id = p_id;
        ELSE
             UPDATE public.cash_flow_categories
             SET name = COALESCE(p_name, name),
                 description = COALESCE(p_description, description),
                 is_revenue = COALESCE(p_is_revenue, is_revenue)
             WHERE id = p_id;
        END IF;
        
        RETURN jsonb_build_object('success', true, 'message', 'Cập nhật thành công');
        
    ELSIF p_action = 'DELETE' THEN
        SELECT is_system INTO v_is_system FROM public.cash_flow_categories WHERE id = p_id;
        IF v_is_system THEN
             RETURN jsonb_build_object('success', false, 'message', 'Không thể xóa danh mục hệ thống');
        END IF;
        
        UPDATE public.cash_flow_categories SET is_active = false WHERE id = p_id;
        RETURN jsonb_build_object('success', true, 'message', 'Đã xóa danh mục');
    END IF;

    RETURN jsonb_build_object('success', false, 'message', 'Hành động không hợp lệ');
END;
$$;

-- 5. UPDATE fn_sync_wallets (The CORE Logic)
CREATE OR REPLACE FUNCTION public.fn_sync_wallets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_delta NUMERIC := 0;
    v_flow_sign INTEGER;
    v_method TEXT;
    v_cat TEXT;
    v_rec RECORD;
    v_is_revenue BOOLEAN := TRUE; -- Default TRUE
    v_cat_exists BOOLEAN;
BEGIN
    -- 1. CƠ CHẾ DELTA
    IF (TG_OP = 'DELETE') THEN
        v_rec := OLD;
        v_delta := -COALESCE(OLD.amount, 0);
    ELSIF (TG_OP = 'INSERT') THEN
        v_rec := NEW;
        v_delta := COALESCE(NEW.amount, 0);
    ELSE
        v_rec := NEW;
        v_delta := COALESCE(NEW.amount, 0) - COALESCE(OLD.amount, 0);
    END IF;

    IF v_delta = 0 AND TG_OP = 'UPDATE' THEN RETURN NEW; END IF;

    v_flow_sign := CASE WHEN v_rec.flow_type = 'IN' THEN 1 ELSE -1 END;
    v_method := lower(COALESCE(v_rec.payment_method_code, 'cash'));
    v_cat := COALESCE(v_rec.category, '');

    -- Lấy trạng thái is_revenue từ bảng categories
    SELECT is_revenue INTO v_is_revenue
    FROM public.cash_flow_categories 
    WHERE name = v_cat LIMIT 1;

    -- Nếu không tìm thấy category (ví dụ category cũ hoặc nhập tay), giữ mặc định TRUE
    IF v_is_revenue IS NULL THEN 
        v_is_revenue := TRUE; 
    END IF;

    -- NGOẠI LỆ TỐI CAO: Sơ đồ phòng (có ref_id và phương thức credit) -> LUÔN LÀ REVENUE
    IF v_method = 'credit' AND v_rec.ref_id IS NOT NULL THEN
        v_is_revenue := TRUE;
    END IF;
    
    -- Xử lý các loại đặc biệt (Hardcoded Logic vẫn giữ để đảm bảo an toàn cho các loại System)
    IF v_cat IN ('Tiền cọc', 'Hoàn cọc', 'Chuyển cọc') THEN
        v_is_revenue := FALSE; -- Cọc không phải doanh thu
    END IF;

    -- 2. CẬP NHẬT VÍ VẬT LÝ (CASH/BANK)
    -- Chỉ khi có tiền thật chảy vào/ra (Khác Credit, Deposit Transfer)
    IF v_method NOT IN ('credit', 'deposit_transfer') THEN
        UPDATE public.wallets 
        SET balance = balance + (v_delta * v_flow_sign), updated_at = now() 
        WHERE id = (CASE WHEN v_method = 'cash' THEN 'CASH' ELSE 'BANK' END);
    END IF;

    -- 3. MA TRẬN ĐIỀU PHỐI TÚI TIỀN (LOGIC MỚI THEO IS_REVENUE)
    
    -- A. GHI NỢ (Credit)
    IF v_method = 'credit' THEN
        UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now() WHERE id = 'RECEIVABLE';
        
        -- Chỉ cộng Doanh thu nếu is_revenue = TRUE
        IF v_is_revenue THEN
            UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now() WHERE id = 'REVENUE';
        END IF;

    -- B. TIỀN CỌC (Deposit/Escrow)
    ELSIF v_cat IN ('Tiền cọc', 'Hoàn cọc') THEN
        UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now() WHERE id = 'ESCROW';
        -- Cọc không bao giờ vào Revenue (đã set v_is_revenue = FALSE ở trên hoặc trong DB)

    -- C. CHUYỂN CỌC (Deposit Transfer)
    ELSIF v_method = 'deposit_transfer' THEN
        UPDATE public.wallets SET balance = balance - v_delta, updated_at = now() WHERE id = 'ESCROW';
        UPDATE public.wallets SET balance = balance - v_delta, updated_at = now() WHERE id = 'RECEIVABLE';
        -- Chuyển cọc thường là để thanh toán cho Doanh thu (đã ghi nhận lúc Credit) hoặc thanh toán trực tiếp
        -- Logic cũ: Không tính Doanh thu. Logic này giữ nguyên vì Doanh thu đã ghi lúc Check-in (Credit).
        
    -- D. VỐN CHỦ SỞ HỮU (Owner Equity)
    ELSIF v_method = 'owner_equity' THEN
        NULL; -- Chỉ ảnh hưởng Cash/Bank

    -- E. THU NỢ (Debt Collection)
    ELSIF v_rec.flow_type = 'IN' AND v_cat IN ('Tiền phòng', 'Thu nợ', 'Thanh toán', 'Thanh toán công nợ', 'Thanh toán tiền phòng', 'Công nợ') THEN
        UPDATE public.wallets SET balance = balance - v_delta, updated_at = now() WHERE id = 'RECEIVABLE';
        -- Thu nợ không tăng Revenue (vì đã tăng lúc ghi nợ).
        -- Lưu ý: Nếu user tạo category "Thu nợ" và set is_revenue = TRUE, nó sẽ bị sai logic (Double counting).
        -- Tuy nhiên, đoạn code này chạy TRƯỚC đoạn default bên dưới, nên nó sẽ override logic is_revenue.
        -- Đây là Hardcoded logic bảo vệ.

    -- F. TRẢ NỢ (Debt Repayment)
    ELSIF v_rec.flow_type = 'OUT' AND v_cat IN ('Trả nợ', 'Thanh toán nợ') THEN
        NULL; -- Chỉ giảm Cash/Bank.

    -- G. MẶC ĐỊNH (Theo cấu hình is_revenue)
    ELSE
        IF v_is_revenue THEN
            UPDATE public.wallets SET balance = balance + (v_delta * v_flow_sign), updated_at = now() WHERE id = 'REVENUE';
        END IF;
    END IF;

    RETURN NULL;
END;
$$;

-- 6. DELETE OLD AMBIGUOUS FUNCTIONS
DROP FUNCTION IF EXISTS public.adjust_customer_balance(uuid, numeric, text, text, uuid);
DROP FUNCTION IF EXISTS public.adjust_customer_balance(uuid, numeric, text, text, uuid, uuid);
