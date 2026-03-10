CREATE OR REPLACE FUNCTION public.resolve_shift_variance(p_shift_id uuid, p_resolution_type text, p_notes text, p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_report record;
    v_shift record;
    v_variance numeric;
    v_cat_loss_name text := 'Xử lý thâm hụt ngân khố';
    v_cat_gain_name text := 'Xử lý thặng dư ngân khố';
    v_check_id uuid;
BEGIN
    -- Get Report
    SELECT * INTO v_report FROM public.shift_reports WHERE shift_id = p_shift_id;
    IF v_report.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy báo cáo ca (Shift Report)');
    END IF;

    -- Get Shift Info (for Backdating)
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    IF v_shift.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy ca làm việc');
    END IF;

    -- Ensure Categories exist
    SELECT id INTO v_check_id FROM public.cash_flow_categories WHERE name = v_cat_loss_name;
    IF v_check_id IS NULL THEN
        INSERT INTO public.cash_flow_categories (name, type, description, is_system)
        VALUES (v_cat_loss_name, 'OUT', 'Dùng để hạch toán khoản thiếu hụt từ ca làm việc', true);
    END IF;
    
    SELECT id INTO v_check_id FROM public.cash_flow_categories WHERE name = v_cat_gain_name;
    IF v_check_id IS NULL THEN
        INSERT INTO public.cash_flow_categories (name, type, description, is_system)
        VALUES (v_cat_gain_name, 'IN', 'Dùng để hạch toán khoản dư thừa từ ca làm việc', true);
    END IF;

    v_variance := v_report.variance;

    -- CASE 1: MATCHED (Tiền đã khớp thực tế - Người tự xử)
    IF p_resolution_type = 'MATCHED' THEN
        -- Logic: Admin confirms money is actually correct (found missing cash, returned extra cash externally)
        -- Action: Just mark as resolved. NO new transactions.
        
        UPDATE public.shift_reports
        SET audit_status = 'resolved',
            notes = COALESCE(notes, '') || ' [Đã khớp thực tế: ' || p_notes || ']'
        WHERE shift_id = p_shift_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Đã xác nhận tiền khớp thực tế');

    -- CASE 2: ADJUST (Hạch toán điều chỉnh - Máy tự xử)
    ELSIF p_resolution_type = 'ADJUST' THEN
        -- Logic: Admin accepts the variance. System creates transaction to balance books.
        -- Action: Create IN/OUT transaction backdated to shift.end_time.
        
        IF v_variance < 0 THEN -- Missing Money (Deficit) -> Create Expense (OUT) to explain the missing amount
             INSERT INTO public.cash_flow (
                amount, flow_type, category, description, payment_method_code, created_by, occurred_at, transaction_type
             ) VALUES (
                ABS(v_variance), 'OUT', v_cat_loss_name, '[Hạch toán ca] Xử lý thâm hụt: ' || p_notes, 'cash', p_admin_id, v_shift.end_time, 'SHIFT_ADJUSTMENT'
             );
        ELSIF v_variance > 0 THEN -- Extra Money (Surplus) -> Create Income (IN) to explain the extra amount
             INSERT INTO public.cash_flow (
                amount, flow_type, category, description, payment_method_code, created_by, occurred_at, transaction_type
             ) VALUES (
                v_variance, 'IN', v_cat_gain_name, '[Hạch toán ca] Xử lý thặng dư: ' || p_notes, 'cash', p_admin_id, v_shift.end_time, 'SHIFT_ADJUSTMENT'
             );
        END IF;

        UPDATE public.shift_reports
        SET audit_status = 'resolved',
            notes = COALESCE(notes, '') || ' [Hạch toán điều chỉnh: ' || p_notes || ']'
        WHERE shift_id = p_shift_id;

        RETURN jsonb_build_object('success', true, 'message', 'Đã hạch toán điều chỉnh (Hồi tố)');

    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Loại xử lý không hợp lệ (Chỉ chấp nhận ADJUST hoặc MATCHED)');
    END IF;
END;
$function$
