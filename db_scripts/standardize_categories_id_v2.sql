-- ====================================================================================
-- SCRIPT CHUẨN HÓA DANH MỤC THU CHI VÀ KẾT NỐI ID CHO CASH_FLOW (BẢN ĐẦY ĐỦ)
-- ====================================================================================

-- 1. THÊM CỘT category_id VÀO BẢNG cash_flow
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_flow' AND column_name = 'category_id') THEN
        ALTER TABLE public.cash_flow ADD COLUMN category_id UUID REFERENCES public.cash_flow_categories(id);
    END IF;
END $$;

-- 2. ĐỒNG BỘ DỮ LIỆU HIỆN TẠI (MAPPING TEXT -> ID)
-- Bước này giúp các giao dịch cũ có category_id chính xác
-- Tạm thời vô hiệu hóa trigger bảo vệ để thực hiện migration một lần duy nhất
ALTER TABLE public.cash_flow DISABLE TRIGGER trg_protect_cash_flow;

UPDATE public.cash_flow cf
SET category_id = cat.id
FROM public.cash_flow_categories cat
WHERE (TRIM(LOWER(cf.category)) = TRIM(LOWER(cat.name)) OR 
      (cf.category = 'Thanh toán tiền phòng' AND cat.name = 'Tiền phòng') OR
      (cf.category = 'Thanh toán trả phòng' AND cat.name = 'Tiền phòng') OR
      (cf.category = 'NHAP_HANG' AND cat.name = 'Nhập hàng'))
  AND cf.flow_type = cat.type
  AND cf.hotel_id = cat.hotel_id;

-- Kích hoạt lại trigger sau khi hoàn tất migration
ALTER TABLE public.cash_flow ENABLE TRIGGER trg_protect_cash_flow;

-- 3. CẬP NHẬT RPC: fn_create_cash_flow (Hỗ trợ p_category_id)
CREATE OR REPLACE FUNCTION public.fn_create_cash_flow(
    p_flow_type text, 
    p_category text DEFAULT NULL, 
    p_amount numeric DEFAULT 0, 
    p_description text DEFAULT NULL, 
    p_occurred_at timestamp with time zone DEFAULT now(), 
    p_verified_by_staff_id uuid DEFAULT NULL::uuid, 
    p_verified_by_staff_name text DEFAULT NULL::text, 
    p_payment_method_code text DEFAULT 'cash'::text, 
    p_ref_id uuid DEFAULT NULL::uuid, 
    p_is_auto boolean DEFAULT false,
    p_category_id uuid DEFAULT NULL::uuid -- NEW PARAMETER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE 
    v_new_id uuid;
    v_hotel_id uuid;
    v_final_category_id uuid := p_category_id;
    v_final_category_name text := p_category;
BEGIN
    v_hotel_id := public.fn_get_tenant_id();

    -- Nếu có category_id, lấy name từ đó để đồng bộ
    IF v_final_category_id IS NOT NULL THEN
        SELECT name INTO v_final_category_name 
        FROM public.cash_flow_categories 
        WHERE id = v_final_category_id;
    -- Nếu chỉ có name, tìm ID tương ứng
    ELSIF v_final_category_name IS NOT NULL THEN
        SELECT id INTO v_final_category_id 
        FROM public.cash_flow_categories 
        WHERE TRIM(LOWER(name)) = TRIM(LOWER(v_final_category_name)) 
          AND type = p_flow_type 
          AND hotel_id = v_hotel_id;
    END IF;

    INSERT INTO public.cash_flow (
        hotel_id,
        flow_type, 
        category, 
        category_id,
        amount, 
        description, 
        occurred_at, 
        created_by, 
        verified_by_staff_id, 
        verified_by_staff_name,
        ref_id,
        is_auto,
        payment_method_code
    )
    VALUES (
        v_hotel_id,
        p_flow_type, 
        COALESCE(v_final_category_name, p_category, 'Khác'), 
        v_final_category_id,
        p_amount, 
        COALESCE(p_description, '') || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
        p_occurred_at, 
        COALESCE(p_verified_by_staff_id, auth.uid()),
        p_verified_by_staff_id,
        p_verified_by_staff_name,
        p_ref_id,
        p_is_auto,
        COALESCE(p_payment_method_code, 'cash')
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'data', v_new_id);
END; $function$;

-- 4. CẬP NHẬT TRIGGER TRG_UPDATE_WALLETS_DML (SỬ DỤNG category_id)
-- Trigger này sẽ cực kỳ chính xác vì dựa trên ID thay vì so sánh chuỗi
CREATE OR REPLACE FUNCTION public.trg_update_wallets_dml()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_amount numeric;
    v_sign integer;
    v_payment_method text;
    v_category_record RECORD;
BEGIN
    v_amount := NEW.amount;
    v_sign := CASE WHEN NEW.flow_type = 'IN' THEN 1 ELSE -1 END;
    v_payment_method := lower(COALESCE(NEW.payment_method_code, 'cash'));
    
    -- Lấy thông tin danh mục từ category_id
    SELECT * INTO v_category_record 
    FROM public.cash_flow_categories 
    WHERE id = NEW.category_id;

    -- Nếu không tìm thấy bằng ID, fallback tìm bằng tên (hỗ trợ dữ liệu cũ chưa map kịp)
    IF v_category_record.id IS NULL THEN
        SELECT * INTO v_category_record 
        FROM public.cash_flow_categories 
        WHERE TRIM(LOWER(name)) = TRIM(LOWER(NEW.category)) 
          AND type = NEW.flow_type 
          AND hotel_id = NEW.hotel_id;
    END IF;

    -- A. Xử lý ví vật lý (CASH/BANK)
    IF v_payment_method IN ('cash', 'tm', 'tiền mặt') THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() 
        WHERE id = 'CASH' AND hotel_id = NEW.hotel_id;
    ELSIF v_payment_method IN ('transfer', 'bank', 'qr', 'ngân hàng') THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() 
        WHERE id = 'BANK' AND hotel_id = NEW.hotel_id;
    END IF;

    -- B. Xử lý ví logic (ESCROW/REVENUE/RECEIVABLE) dựa trên tính chất danh mục
    -- 1. Tiền cọc (Escrow)
    IF v_category_record.name = 'Tiền cọc' THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() 
        WHERE id = 'ESCROW' AND hotel_id = NEW.hotel_id;
    -- 2. Chuyển cọc tại checkout (Escrow -> Revenue)
    ELSIF v_payment_method = 'deposit_transfer' THEN
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() 
        WHERE id = 'ESCROW' AND hotel_id = NEW.hotel_id;
        UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() 
        WHERE id = 'REVENUE' AND hotel_id = NEW.hotel_id;
    -- 3. Doanh thu (Revenue) - Chỉ ghi nhận nếu là is_revenue = true
    ELSIF COALESCE(v_category_record.is_revenue, true) THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() 
        WHERE id = 'REVENUE' AND hotel_id = NEW.hotel_id;
    END IF;

    RETURN NEW;
END;
$$;
