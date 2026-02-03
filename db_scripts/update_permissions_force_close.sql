
-- Update close_shift to use Functional Permissions
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
    v_has_permission boolean := false;
    v_permissions jsonb;
BEGIN
    -- Get Requester ID
    v_requester_id := auth.uid();
    
    -- Check Requester Role
    SELECT role INTO v_requester_role FROM public.staff WHERE id = v_requester_id;

    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    
    IF v_shift.id IS NULL OR v_shift.status != 'open' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ca làm việc không tồn tại hoặc đã đóng.');
    END IF;

    -- SECURITY CHECK
    -- 1. Owner always allowed
    IF v_requester_id = v_shift.staff_id THEN
        v_has_permission := true;
    -- 2. Admin always allowed (Hardcoded Safety)
    ELSIF v_requester_role = 'Admin' THEN
        v_has_permission := true;
    ELSE
        -- 3. Check Functional Permissions (RBAC)
        -- Try to get permissions from role_permissions
        -- We handle both jsonb and text[] (via casting if needed) implicitly or via logic
        -- Assuming permissions column is jsonb as per project standard
        BEGIN
            SELECT permissions::jsonb INTO v_permissions
            FROM public.role_permissions
            WHERE role_code = v_requester_role;
            
            IF v_permissions IS NOT NULL AND (v_permissions ? 'shift_force_close' OR v_permissions ? '*') THEN
                v_has_permission := true;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Fallback or Error means no permission found safely
            NULL;
        END;
    END IF;

    IF NOT v_has_permission THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bạn không có quyền đóng ca của người khác.');
    END IF;

    -- Calculate Declared Cash
    IF p_denominations IS NOT NULL AND jsonb_array_length(p_denominations) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_denominations)
        LOOP
            INSERT INTO public.shift_denominations (shift_id, denomination, quantity)
            VALUES (p_shift_id, (v_item->>'denomination')::int, (v_item->>'quantity')::int);
            
            v_declared_cash := v_declared_cash + ((v_item->>'denomination')::int * (v_item->>'quantity')::int);
        END LOOP;
    ELSE
        v_declared_cash := COALESCE(p_declared_cash_manual, 0);
    END IF;

    -- Calculate System Cash
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
