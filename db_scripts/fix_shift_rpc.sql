CREATE OR REPLACE FUNCTION public.open_shift(
    staff_uuid uuid, 
    initial_cash numeric, 
    p_hotel_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_shift_id uuid;
    last_shift_cash numeric;
    v_hotel_id uuid;
BEGIN
    v_hotel_id := COALESCE(p_hotel_id, public.fn_get_tenant_id());
    
    IF EXISTS (
        SELECT 1 FROM public.shifts 
        WHERE staff_id = staff_uuid AND status = 'open' AND (v_hotel_id IS NULL OR hotel_id = v_hotel_id)
    ) THEN
        RAISE EXCEPTION 'Nhân viên đã có ca làm việc đang mở';
    END IF;
    
    last_shift_cash := public.get_last_shift_balance(v_hotel_id);
    last_shift_cash := COALESCE(last_shift_cash, initial_cash, 0);
    
    INSERT INTO public.shifts (hotel_id, staff_id, initial_cash, start_time, status)
    VALUES (v_hotel_id, staff_uuid, last_shift_cash, now(), 'open')
    RETURNING id INTO new_shift_id;
    
    RETURN new_shift_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id uuid,
    p_actual_cash numeric,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift record;
    v_in numeric := 0;
    v_out numeric := 0;
    v_expected numeric := 0;
    v_diff numeric := 0;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    
    IF v_shift.id IS NULL OR v_shift.status <> 'open' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ca làm việc không tồn tại hoặc đã đóng.');
    END IF;

    -- Tính tổng thu tiền mặt trong ca
    SELECT COALESCE(SUM(amount), 0) INTO v_in
    FROM public.cash_flow
    WHERE hotel_id = v_shift.hotel_id
      AND occurred_at >= v_shift.start_time
      AND flow_type = 'IN'
      AND LOWER(COALESCE(payment_method_code, 'cash')) IN ('cash', 'tm');

    -- Tính tổng chi tiền mặt trong ca
    SELECT COALESCE(SUM(amount), 0) INTO v_out
    FROM public.cash_flow
    WHERE hotel_id = v_shift.hotel_id
      AND occurred_at >= v_shift.start_time
      AND flow_type = 'OUT'
      AND LOWER(COALESCE(payment_method_code, 'cash')) IN ('cash', 'tm');

    v_expected := COALESCE(v_shift.initial_cash, 0) + v_in - v_out;
    v_diff := COALESCE(p_actual_cash, 0) - v_expected;

    UPDATE public.shifts
    SET 
        end_time = now(),
        actual_cash = p_actual_cash,
        expected_cash = v_expected,
        difference = v_diff,
        total_revenue_cash = v_in,
        total_expense_cash = v_out,
        notes = p_notes,
        status = 'closed',
        updated_at = now()
    WHERE id = p_shift_id;

    RETURN jsonb_build_object(
        'success', true,
        'expected_cash', v_expected,
        'actual_cash', p_actual_cash,
        'difference', v_diff,
        'total_revenue_cash', v_in,
        'total_expense_cash', v_out
    );
END;
$$;
