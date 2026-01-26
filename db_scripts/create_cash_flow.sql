-- 1. Tạo bảng Sổ quỹ (Cash Flow)
CREATE TABLE IF NOT EXISTS public.cash_flow (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    flow_type text NOT NULL CHECK (flow_type IN ('IN', 'OUT')), -- IN: Thu, OUT: Chi
    category text NOT NULL, -- Ví dụ: ROOM, SERVICE, IMPORT, SALARY, ELECTRICITY, OTHER...
    amount numeric NOT NULL DEFAULT 0,
    description text,
    occurred_at timestamptz DEFAULT now(), -- Thời điểm phát sinh giao dịch
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id), -- Người tạo phiếu
    ref_id uuid, -- ID tham chiếu (Booking ID, Import ID...)
    is_auto boolean DEFAULT false, -- True nếu là giao dịch tự động sinh ra từ hệ thống
    updated_at timestamptz DEFAULT now()
);

-- Index cho tìm kiếm nhanh
CREATE INDEX IF NOT EXISTS idx_cash_flow_occurred_at ON public.cash_flow(occurred_at);
CREATE INDEX IF NOT EXISTS idx_cash_flow_type ON public.cash_flow(flow_type);

-- 2. RPC: Tạo phiếu thu/chi (Backend Logic)
CREATE OR REPLACE FUNCTION public.fn_create_cash_flow(
    p_flow_type text,
    p_category text,
    p_amount numeric,
    p_description text,
    p_occurred_at timestamptz DEFAULT now(),
    p_ref_id uuid DEFAULT NULL,
    p_is_auto boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_id uuid;
BEGIN
    INSERT INTO public.cash_flow (flow_type, category, amount, description, occurred_at, ref_id, is_auto, created_by)
    VALUES (p_flow_type, p_category, p_amount, p_description, p_occurred_at, p_ref_id, p_is_auto, auth.uid())
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Tạo phiếu thành công',
        'data', v_new_id
    );
END;
$$;

-- 3. RPC: Lấy báo cáo tổng quan (Dashboard)
-- Trả về: Tổng thu, Tổng chi, Tồn quỹ trong khoảng thời gian
CREATE OR REPLACE FUNCTION public.fn_get_cash_flow_stats(
    p_from_date timestamptz,
    p_to_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_total_in numeric := 0;
    v_total_out numeric := 0;
    v_balance numeric := 0;
    v_chart_data jsonb;
BEGIN
    -- Tính tổng thu trong kỳ
    SELECT COALESCE(SUM(amount), 0) INTO v_total_in
    FROM public.cash_flow
    WHERE flow_type = 'IN' AND occurred_at BETWEEN p_from_date AND p_to_date;

    -- Tính tổng chi trong kỳ
    SELECT COALESCE(SUM(amount), 0) INTO v_total_out
    FROM public.cash_flow
    WHERE flow_type = 'OUT' AND occurred_at BETWEEN p_from_date AND p_to_date;

    -- Tính số dư hiện tại (Tính từ đầu thiên địa đến giờ, không phụ thuộc filter)
    -- Balance = Tổng Thu - Tổng Chi
    SELECT 
        COALESCE(SUM(CASE WHEN flow_type = 'IN' THEN amount ELSE -amount END), 0)
    INTO v_balance
    FROM public.cash_flow;

    -- Biểu đồ theo ngày (trong khoảng thời gian chọn)
    SELECT jsonb_agg(t) INTO v_chart_data
    FROM (
        SELECT 
            date_trunc('day', occurred_at)::date as date,
            SUM(CASE WHEN flow_type = 'IN' THEN amount ELSE 0 END) as total_in,
            SUM(CASE WHEN flow_type = 'OUT' THEN amount ELSE 0 END) as total_out
        FROM public.cash_flow
        WHERE occurred_at BETWEEN p_from_date AND p_to_date
        GROUP BY 1
        ORDER BY 1
    ) t;

    RETURN jsonb_build_object(
        'total_in', v_total_in,
        'total_out', v_total_out,
        'net_income', v_total_in - v_total_out,
        'current_balance', v_balance,
        'chart_data', COALESCE(v_chart_data, '[]'::jsonb)
    );
END;
$$;
