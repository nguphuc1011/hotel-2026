-- FINANCE SECURITY & STRICT VOID LOGIC
-- Created: 2026-02-02
-- Description: 
-- 1. Phân quyền chặt chẽ cho bảng cash_flow (Lễ tân chỉ INSERT, cấm UPDATE/DELETE)
-- 2. Chuyển đổi logic "Xóa" thành "Hủy/Đảo bút toán" (Void) để bảo toàn lịch sử.
-- 3. Cập nhật Settings Security.

--------------------------------------------------------------------------------
-- 1. CẬP NHẬT SETTINGS SECURITY
--------------------------------------------------------------------------------
INSERT INTO public.settings_security (key, description, is_enabled, category)
VALUES 
    ('finance_create_transaction', 'Tạo phiếu thu/chi mới', true, 'finance'),
    ('finance_void_transaction', 'Hủy/Đảo giao dịch (Thay vì xóa)', true, 'finance')
ON CONFLICT (key) DO UPDATE 
SET description = EXCLUDED.description;

-- Xóa key cũ nếu không còn phù hợp (Option)
-- DELETE FROM public.settings_security WHERE key = 'finance_delete_transaction'; 
-- Giữ lại để tương thích ngược nếu cần, nhưng logic sẽ lái sang Void.

--------------------------------------------------------------------------------
-- 2. CẬP NHẬT RLS (ROW LEVEL SECURITY) CHO CASH_FLOW
--------------------------------------------------------------------------------
ALTER TABLE public.cash_flow ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.cash_flow;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.cash_flow;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.cash_flow;
DROP POLICY IF EXISTS "Allow select for all" ON public.cash_flow;
DROP POLICY IF EXISTS "Allow insert for all authenticated" ON public.cash_flow;
DROP POLICY IF EXISTS "Allow update for managers" ON public.cash_flow;
DROP POLICY IF EXISTS "Allow delete for admins" ON public.cash_flow;

-- 2.1. SELECT: Ai cũng xem được (để hiện danh sách)
CREATE POLICY "finance_read_policy" ON public.cash_flow
    FOR SELECT USING (true);

-- 2.2. INSERT: Cho phép tất cả nhân viên đã đăng nhập
CREATE POLICY "finance_insert_policy" ON public.cash_flow
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2.3. UPDATE: Chỉ Manager/Admin mới được sửa (Lễ tân bị cấm)
CREATE POLICY "finance_update_policy" ON public.cash_flow
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.staff 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

-- 2.4. DELETE: Chỉ Admin (Hoặc cấm hoàn toàn để bảo vệ dữ liệu tuyệt đối)
CREATE POLICY "finance_delete_policy" ON public.cash_flow
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.staff 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

--------------------------------------------------------------------------------
-- 3. NÂNG CẤP RPC: XÓA -> HỦY (VOID)
--------------------------------------------------------------------------------
-- Thay vì xóa dòng, ta tạo một dòng đối ứng để triệt tiêu số tiền.
-- Hàm vẫn giữ tên fn_delete_cash_flow để tương thích UI, nhưng logic là VOID.

CREATE OR REPLACE FUNCTION public.fn_delete_cash_flow(
    p_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Chạy quyền Owner để bypass RLS (vì logic Void cần INSERT/UPDATE chuẩn)
AS $function$
DECLARE
    v_record RECORD;
    v_wallet_changes jsonb := '[]'::jsonb;
    v_wallet_name text;
    v_pm_code text;
    v_user_role text;
    v_user_id uuid;
    v_void_id uuid;
BEGIN
    -- 0. Lấy thông tin người dùng thực hiện
    v_user_id := auth.uid();
    SELECT role INTO v_user_role FROM public.staff WHERE id = v_user_id;

    -- 1. Get record info
    SELECT * INTO v_record FROM public.cash_flow WHERE id = p_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Giao dịch không tồn tại.');
    END IF;

    IF v_record.is_auto THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không thể hủy giao dịch tự động của hệ thống.');
    END IF;
    
    -- Kiểm tra nếu giao dịch này là giao dịch VOID (đã hủy rồi thì không hủy lại cái hủy)
    IF v_record.description LIKE 'VOID:%' THEN
         RETURN jsonb_build_object('success', false, 'message', 'Không thể hủy giao dịch đã là giao dịch hủy.');
    END IF;

    -- 2. Thực hiện VOID (Đảo bút toán)
    -- Thay vì DELETE, ta INSERT một dòng mới ngược dấu
    
    INSERT INTO public.cash_flow (
        flow_type,
        category,
        amount, -- Đảo dấu: Nếu IN thì vẫn là IN nhưng số âm? Hay là chuyển thành OUT?
                -- Theo nguyên tắc kế toán máy: 
                -- Nếu Thu 100k (IN), muốn hủy thì Thu -100k (IN). 
                -- Để tổng Thu trong ngày = 0.
                -- Nếu chuyển thành Chi (OUT) 100k, thì Tổng Thu = 100, Tổng Chi = 100 -> Balance = 0.
                -- Nhưng báo cáo doanh thu sẽ bị sai (Doanh thu vẫn là 100).
                -- NÊN: Giữ nguyên Type, Đảo dấu Amount.
        amount, 
        description,
        occurred_at,
        created_by,
        ref_id, -- Link tới giao dịch gốc
        payment_method_code
    )
    VALUES (
        v_record.flow_type,
        v_record.category,
        -v_record.amount, -- Đảo dấu
        'VOID: ' || v_record.description || COALESCE(' - Lý do: ' || p_reason, ''),
        now(),
        v_user_id,
        v_record.id,
        v_record.payment_method_code
    )
    RETURNING id INTO v_void_id;

    -- 3. Calculate Impact for UI (Wallet Update)
    -- Logic tính toán ví vẫn như cũ (Reverse) để UI cập nhật số dư ngay lập tức
    v_pm_code := lower(COALESCE(v_record.payment_method_code, 'cash'));
    
    IF v_pm_code IN ('cash', 'tien mat', 'tiền mặt') THEN
        v_wallet_name := 'CASH';
    ELSE
        v_wallet_name := 'BANK';
    END IF;

    -- Logic đảo ngược số dư ví (Giống hệt logic DELETE cũ)
    IF v_record.flow_type = 'IN' THEN
        -- Reverse IN: Wallet - Amount
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', v_wallet_name, 'diff', -v_record.amount);
        
        IF v_record.category = 'Tiền cọc' THEN
             v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'ESCROW', 'diff', -v_record.amount);
        ELSE
             v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'REVENUE', 'diff', -v_record.amount);
             v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'RECEIVABLE', 'diff', v_record.amount);
        END IF;

    ELSIF v_record.flow_type = 'OUT' THEN
        -- Reverse OUT: Wallet + Amount
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', v_wallet_name, 'diff', v_record.amount);
        
        v_wallet_changes := v_wallet_changes || jsonb_build_object('walletName', 'REVENUE', 'diff', v_record.amount);
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Đã hủy giao dịch thành công (Tạo phiếu điều chỉnh).', 
        'wallet_changes', v_wallet_changes,
        'void_transaction_id', v_void_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;
