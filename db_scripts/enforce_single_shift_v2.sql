-- Enforce Single Shift Policy & Force Close Permission
-- Created: 2026-02-03

-- 1. Helper: Check Functional Permission
CREATE OR REPLACE FUNCTION public.fn_has_permission(
    p_staff_id uuid,
    p_permission_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role text;
    v_permissions jsonb;
    v_user_permissions jsonb;
BEGIN
    -- 1. Get User Role and User-Specific Permissions
    SELECT role, permissions INTO v_role, v_user_permissions
    FROM public.staff 
    WHERE id = p_staff_id;
    
    -- 2. Check User-Specific Permissions first
    IF v_user_permissions IS NOT NULL THEN
        RETURN (v_user_permissions @> to_jsonb(p_permission_key)) OR (v_user_permissions @> to_jsonb('*'::text));
    END IF;

    -- 3. Check Role Permissions (Case Insensitive Join)
    SELECT permissions INTO v_permissions
    FROM public.role_permissions
    WHERE lower(role_code) = lower(v_role);
    
    IF v_permissions IS NULL THEN
        -- Hardcoded Fallback for Admin if table missing/empty
        IF lower(v_role) = 'admin' THEN RETURN true; END IF;
        RETURN false;
    END IF;
    
    RETURN (v_permissions @> to_jsonb(p_permission_key)) OR (v_permissions @> to_jsonb('*'::text));
END;
$$;

-- 2. Modify open_shift to block if ANY open shift exists
CREATE OR REPLACE FUNCTION public.open_shift(p_staff_id uuid, p_start_cash numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_shift_id uuid;
    v_active_shift_record record;
BEGIN
    -- SINGLE SHIFT ENFORCEMENT
    -- Check if ANYONE has an open shift
    SELECT s.id, st.full_name, st.username 
    INTO v_active_shift_record
    FROM public.shifts s
    JOIN public.staff st ON s.staff_id = st.id
    WHERE s.status = 'open'
    LIMIT 1;
    
    IF v_active_shift_record.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', format('Cảnh báo: Ca làm việc của %s vẫn đang mở. Yêu cầu bàn giao trước khi tiếp quản ngân khố!', COALESCE(v_active_shift_record.full_name, v_active_shift_record.username)),
            'code', 'SHIFT_ALREADY_OPEN',
            'blocking_staff', COALESCE(v_active_shift_record.full_name, v_active_shift_record.username),
            'blocking_shift_id', v_active_shift_record.id
        );
    END IF;

    INSERT INTO public.shifts (staff_id, start_cash, status)
    VALUES (p_staff_id, p_start_cash, 'open')
    RETURNING id INTO v_shift_id;

    RETURN jsonb_build_object('success', true, 'shift_id', v_shift_id);
END;
$function$;

-- 3. Update close_shift RPC with Permission Check & Audit Logic
CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id uuid, 
    p_declared_cash_manual numeric DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_denominations jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_shift record;
    v_requester_id uuid;
    v_system_cash numeric;
    v_total_in numeric;
    v_total_out numeric;
    v_declared_cash numeric := 0;
    v_variance numeric;
    v_audit_status text;
    v_item jsonb;
BEGIN
    v_requester_id := auth.uid();
    
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    
    IF v_shift.id IS NULL OR v_shift.status != 'open' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ca làm việc không tồn tại hoặc đã đóng.');
    END IF;

    -- SECURITY CHECK: Force Close
    IF v_shift.staff_id != v_requester_id THEN
        -- Check if requester has SHIFT_FORCE_CLOSE permission
        IF NOT public.fn_has_permission(v_requester_id, 'shift_force_close') THEN
             RETURN jsonb_build_object('success', false, 'message', 'Bạn không có quyền đóng ca của người khác (Cần quyền FORCE CLOSE).');
        END IF;
        
        -- Log force close
        p_notes := COALESCE(p_notes, '') || ' [FORCE CLOSE by ' || (SELECT username FROM public.staff WHERE id = v_requester_id) || ']';
    END IF;

    -- Calculate Declared Cash from Denominations
    IF p_denominations IS NOT NULL AND jsonb_array_length(p_denominations) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_denominations)
        LOOP
            INSERT INTO public.shift_denominations (shift_id, denomination, quantity)
            VALUES (p_shift_id, (v_item->>'denomination')::int, (v_item->>'quantity')::int);
            
            v_declared_cash := v_declared_cash + ((v_item->>'denomination')::int * (v_item->>'quantity')::int);
        END LOOP;
    ELSE
        -- Fallback to manual if provided, otherwise 0
        v_declared_cash := COALESCE(p_declared_cash_manual, 0);
    END IF;

    -- Calculate System Cash (Start Cash + Total IN - Total OUT)
    SELECT COALESCE(SUM(amount), 0) INTO v_total_in
    FROM public.cash_flow
    WHERE created_by = v_shift.staff_id 
      AND occurred_at >= v_shift.start_time
      AND flow_type = 'IN'
      AND payment_method_code = 'cash';

    SELECT COALESCE(SUM(amount), 0) INTO v_total_out
    FROM public.cash_flow
    WHERE created_by = v_shift.staff_id 
      AND occurred_at >= v_shift.start_time
      AND flow_type = 'OUT'
      AND payment_method_code = 'cash';

    v_system_cash := v_shift.start_cash + v_total_in - v_total_out;
    v_variance := v_declared_cash - v_system_cash;

    -- Determine Audit Status
    IF v_variance = 0 THEN
        v_audit_status := 'approved';
    ELSE
        v_audit_status := 'pending';
    END IF;

    -- Update Shift
    UPDATE public.shifts 
    SET end_time = now(), 
        end_cash_system = v_system_cash,
        status = 'closed'
    WHERE id = p_shift_id;

    -- Create Report
    INSERT INTO public.shift_reports (shift_id, declared_cash, system_cash, variance, notes, audit_status)
    VALUES (p_shift_id, v_declared_cash, v_system_cash, v_variance, p_notes, v_audit_status);

    RETURN jsonb_build_object(
        'success', true, 
        'system_cash', v_system_cash, 
        'declared_cash', v_declared_cash,
        'variance', v_variance,
        'audit_status', v_audit_status
    );
END;
$function$;
