-- CẬP NHẬT RPC LẤY THỐNG KÊ THU CHI (QUY TẮC KẾ TOÁN THÀNH TÍCH - ACCRUAL BASIS)
-- Đảm bảo: 
-- 1. Doanh thu tăng ngay khi Check-in (Credit).
-- 2. Không tính trùng doanh thu khi khách thanh toán tiền nợ (Settlement).
-- 3. Tồn quỹ chỉ tính Tiền mặt + Ngân hàng.

CREATE OR REPLACE FUNCTION public.fn_get_cash_flow_stats(
    p_from_date timestamptz,
    p_to_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_total_revenue numeric := 0;
    v_total_expense numeric := 0;
    v_cash_balance numeric := 0;
    v_chart_data jsonb;
BEGIN
    -- 1. TỔNG DOANH THU (REVENUE - Kế toán thành tích)
    -- Bao gồm: 
    -- - Các khoản Ghi nợ (credit) lúc Check-in hoặc phát sinh dịch vụ.
    -- - Các khoản Thu trực tiếp (không qua nợ) - thường là phiếu thu thủ công.
    -- LOẠI TRỪ: Các khoản thanh toán nợ (settlement) và Chuyển cọc (deposit_transfer) để tránh tính trùng.
    
    SELECT COALESCE(SUM(amount), 0) INTO v_total_revenue
    FROM public.cash_flow
    WHERE flow_type = 'IN' 
      AND occurred_at BETWEEN p_from_date AND p_to_date
      AND (
          payment_method_code = 'credit' -- Ghi nhận doanh thu lúc check-in
          OR (payment_method_code NOT IN ('credit', 'deposit_transfer') AND is_auto = false) -- Thu thủ công trực tiếp
      );

    -- 2. TỔNG CHI PHÍ (EXPENSE)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_expense
    FROM public.cash_flow
    WHERE flow_type = 'OUT' 
      AND occurred_at BETWEEN p_from_date AND p_to_date;

    -- 3. TỒN QUỸ THỰC TẾ (CASH + BANK)
    -- Chỉ tính số dư trong ví CASH và BANK
    SELECT COALESCE(SUM(balance), 0) INTO v_cash_balance
    FROM public.wallets
    WHERE id IN ('CASH', 'BANK');

    -- 4. DỮ LIỆU BIỂU ĐỒ (Doanh thu vs Chi phí theo ngày)
    SELECT jsonb_agg(t) INTO v_chart_data
    FROM (
        SELECT 
            date_trunc('day', occurred_at)::date as date,
            SUM(CASE 
                WHEN flow_type = 'IN' AND (payment_method_code = 'credit' OR (payment_method_code NOT IN ('credit', 'deposit_transfer') AND is_auto = false)) 
                THEN amount ELSE 0 END) as total_in,
            SUM(CASE WHEN flow_type = 'OUT' THEN amount ELSE 0 END) as total_out
        FROM public.cash_flow
        WHERE occurred_at BETWEEN p_from_date AND p_to_date
        GROUP BY 1
        ORDER BY 1
    ) t;

    RETURN jsonb_build_object(
        'total_in', v_total_revenue,
        'total_out', v_total_revenue - (v_total_revenue - v_total_expense), -- Vẫn trả về v_total_expense nhưng logic rõ ràng
        'total_out_real', v_total_expense,
        'net_income', v_total_revenue - v_total_expense,
        'current_balance', v_cash_balance,
        'chart_data', COALESCE(v_chart_data, '[]'::jsonb)
    );
END;
$$;
