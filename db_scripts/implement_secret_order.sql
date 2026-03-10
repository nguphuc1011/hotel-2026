-- 1. Create System Categories
INSERT INTO public.cash_flow_categories (name, type, description, is_system)
VALUES 
    ('Xử lý thâm hụt ngân khố', 'OUT', 'Dùng để hạch toán khoản thiếu hụt từ ca làm việc', true),
    ('Xử lý thặng dư ngân khố', 'IN', 'Dùng để hạch toán khoản dư thừa từ ca làm việc', true),
    ('Bồi thường thiếu hụt', 'IN', 'Nhân viên nộp tiền bồi thường cho khoản thiếu hụt', true),
    ('Hoàn trả tiền thừa', 'OUT', 'Hoàn trả lại tiền dư thừa cho khách hoặc nhân viên', true)
ON CONFLICT (name, type) DO NOTHING;

-- 2. Update resolve_shift_variance Function
CREATE OR REPLACE FUNCTION public.resolve_shift_variance(
    p_shift_id uuid,
    p_resolution_type text, -- 'ACCEPT', 'COMPENSATE', 'EXTERNAL'
    p_notes text,
    p_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_report record;
    v_variance numeric;
    v_cat_loss uuid;
    v_cat_gain uuid;
    v_cat_comp_in uuid;
    v_cat_comp_out uuid;
BEGIN
    -- Get Report
    SELECT * INTO v_report FROM public.shift_reports WHERE shift_id = p_shift_id;
    
    IF v_report.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Shift report not found');
    END IF;

    -- Get Category IDs
    SELECT id INTO v_cat_loss FROM public.cash_flow_categories WHERE name = 'Xử lý thâm hụt ngân khố';
    SELECT id INTO v_cat_gain FROM public.cash_flow_categories WHERE name = 'Xử lý thặng dư ngân khố';
    SELECT id INTO v_cat_comp_in FROM public.cash_flow_categories WHERE name = 'Bồi thường thiếu hụt';
    SELECT id INTO v_cat_comp_out FROM public.cash_flow_categories WHERE name = 'Hoàn trả tiền thừa';

    v_variance := v_report.variance;

    -- 1. EXTERNAL (Đã xử lý bên ngoài)
    IF p_resolution_type = 'EXTERNAL' THEN
        UPDATE public.shift_reports
        SET audit_status = 'resolved',
            notes = COALESCE(notes, '') || ' [Xử lý ngoài: ' || p_notes || ']'
        WHERE shift_id = p_shift_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Đã ghi nhận xử lý ngoài');

    -- 2. ACCEPT (Chủ chấp nhận)
    ELSIF p_resolution_type = 'ACCEPT' THEN
        IF v_variance < 0 THEN -- Missing Money (Deficit) -> Create Expense
             INSERT INTO public.cash_flow (
                amount, flow_type, category_id, description, payment_method_code, created_by, occurred_at, transaction_type
             ) VALUES (
                ABS(v_variance), 'OUT', v_cat_loss, '[Xử lý ca] Chủ chấp nhận thâm hụt: ' || p_notes, 'cash', p_admin_id, now(), 'SHIFT_ADJUSTMENT'
             );
        ELSIF v_variance > 0 THEN -- Extra Money (Surplus) -> Create Income
             INSERT INTO public.cash_flow (
                amount, flow_type, category_id, description, payment_method_code, created_by, occurred_at, transaction_type
             ) VALUES (
                v_variance, 'IN', v_cat_gain, '[Xử lý ca] Chủ chấp nhận thặng dư: ' || p_notes, 'cash', p_admin_id, now(), 'SHIFT_ADJUSTMENT'
             );
        END IF;

        UPDATE public.shift_reports
        SET audit_status = 'resolved',
            notes = COALESCE(notes, '') || ' [Chủ chấp nhận: ' || p_notes || ']'
        WHERE shift_id = p_shift_id;

        RETURN jsonb_build_object('success', true, 'message', 'Đã hạch toán chấp nhận sai lệch');

    -- 3. COMPENSATE (Nhân viên bồi thường / Trả lại)
    ELSIF p_resolution_type = 'COMPENSATE' THEN
        IF v_variance < 0 THEN 
             -- Missing Money: 
             -- 1. Record Loss (Expense)
             INSERT INTO public.cash_flow (
                amount, flow_type, category_id, description, payment_method_code, created_by, occurred_at, transaction_type
             ) VALUES (
                ABS(v_variance), 'OUT', v_cat_loss, '[Xử lý ca] Ghi nhận thâm hụt (Chờ bù): ' || p_notes, 'cash', p_admin_id, now(), 'SHIFT_ADJUSTMENT'
             );
             -- 2. Record Compensation (Income)
             INSERT INTO public.cash_flow (
                amount, flow_type, category_id, description, payment_method_code, created_by, occurred_at, transaction_type
             ) VALUES (
                ABS(v_variance), 'IN', v_cat_comp_in, '[Xử lý ca] Nhân viên bồi thường: ' || p_notes, 'cash', p_admin_id, now(), 'SHIFT_ADJUSTMENT'
             );
        ELSIF v_variance > 0 THEN 
             -- Extra Money:
             -- 1. Record Gain (Income)
             INSERT INTO public.cash_flow (
                amount, flow_type, category_id, description, payment_method_code, created_by, occurred_at, transaction_type
             ) VALUES (
                v_variance, 'IN', v_cat_gain, '[Xử lý ca] Ghi nhận thặng dư (Chờ trả): ' || p_notes, 'cash', p_admin_id, now(), 'SHIFT_ADJUSTMENT'
             );
             -- 2. Record Return (Expense)
             INSERT INTO public.cash_flow (
                amount, flow_type, category_id, description, payment_method_code, created_by, occurred_at, transaction_type
             ) VALUES (
                v_variance, 'OUT', v_cat_comp_out, '[Xử lý ca] Hoàn trả tiền thừa: ' || p_notes, 'cash', p_admin_id, now(), 'SHIFT_ADJUSTMENT'
             );
        END IF;

        UPDATE public.shift_reports
        SET audit_status = 'resolved',
            notes = COALESCE(notes, '') || ' [Bồi thường/Hoàn trả: ' || p_notes || ']'
        WHERE shift_id = p_shift_id;

        RETURN jsonb_build_object('success', true, 'message', 'Đã hạch toán bồi thường/hoàn trả');

    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Invalid resolution type');
    END IF;
END;
$$;
