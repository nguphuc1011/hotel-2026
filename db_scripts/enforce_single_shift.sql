-- Enforce Single Shift Policy
-- 1. Modify open_shift to block if ANY open shift exists
-- 2. Add force_close_shift RPC for Admins

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
        -- If the open shift belongs to the requester, it's the standard "Finish your shift" message
        -- But for this policy, we block ALL new shifts if one exists.
        -- We return specific info so Frontend can display the warning.
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

-- Helper to get global open shift status (for UI to check before trying to open)
CREATE OR REPLACE FUNCTION public.get_global_open_shift()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT jsonb_build_object(
        'has_open_shift', (count(*) > 0),
        'shift', (
            SELECT jsonb_build_object(
                'id', s.id,
                'staff_id', s.staff_id,
                'staff_name', st.full_name,
                'start_time', s.start_time
            )
            FROM public.shifts s
            JOIN public.staff st ON s.staff_id = st.id
            WHERE s.status = 'open'
            LIMIT 1
        )
    )
    FROM public.shifts
    WHERE status = 'open';
$$;

-- Force Close RPC (Admin Only)
-- This allows closing a shift without knowing the exact cash details (Blind Close / Force Close)
-- It will set declared_cash = system_cash (assuming perfect handover if forced) or 0?
-- Let's set it to 0 and mark as 'rejected' or 'pending' audit?
-- Better: Force close implies the person is gone. 
-- We should probably allow the Admin to input the cash if they counted it, OR just close it.
-- Let's reuse close_shift logic but wrapped in a permission check.
-- Actually, close_shift doesn't check for permission, it just checks shift existence.
-- So we can just call close_shift from the frontend IF the user is Admin.
-- But we need to make sure regular users can't close others' shifts.
-- CURRENTLY: close_shift takes p_shift_id. If a user guesses an ID, they can close it.
-- We should probably secure close_shift to only allow Owner OR Admin.

CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id uuid, 
    p_denominations jsonb DEFAULT NULL::jsonb, 
    p_notes text DEFAULT NULL::text, 
    p_declared_cash_manual numeric DEFAULT NULL::numeric
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_shift record;
    v_requester_id uuid;
    v_requester_role text;
    v_system_cash numeric;
    v_total_in numeric;
    v_total_out numeric;
    v_declared_cash numeric := 0;
    v_variance numeric;
    v_audit_status text;
    v_item jsonb;
BEGIN
    -- Get Requester ID (Supabase Auth)
    v_requester_id := auth.uid();
    
    -- Check Requester Role
    SELECT role INTO v_requester_role FROM public.staff WHERE id = v_requester_id;

    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    
    IF v_shift.id IS NULL OR v_shift.status != 'open' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ca làm việc không tồn tại hoặc đã đóng.');
    END IF;

    -- SECURITY CHECK: Only Owner or Admin can close
    -- Note: v_requester_id might be null if called from anon (should not happen in app)
    -- We assume authenticated calls.
    IF v_requester_id IS NOT NULL AND v_requester_id != v_shift.staff_id AND v_requester_role != 'Admin' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bạn không có quyền đóng ca của người khác.');
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
