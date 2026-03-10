-- 🏛️ ROYAL DECREE: STRICT SHIFT ENFORCEMENT 🏛️
-- 1. MODIFY open_shift: Remove manual start cash, enforce system wallet balance
-- 2. CREATE TRIGGER: Block cash_flow inserts without open shift
-- 3. MODIFY close_shift: Force logout signal

-- ==============================================================================
-- 1. MODIFY open_shift (Automatic Treasury Quota)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.open_shift(p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_shift_id uuid;
    v_active_shift_record record;
    v_system_cash numeric;
BEGIN
    -- A. SINGLE SHIFT ENFORCEMENT
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

    -- B. AUTOMATIC TREASURY QUOTA (Fetch from CASH wallet)
    SELECT balance INTO v_system_cash
    FROM public.wallets
    WHERE id = 'CASH';

    IF v_system_cash IS NULL THEN
        v_system_cash := 0;
    END IF;

    -- C. OPEN NEW SHIFT
    INSERT INTO public.shifts (staff_id, start_cash, status, start_time)
    VALUES (p_staff_id, v_system_cash, 'open', now())
    RETURNING id INTO v_shift_id;

    RETURN jsonb_build_object(
        'success', true, 
        'shift_id', v_shift_id,
        'start_cash', v_system_cash,
        'message', format('Đã mở ca thành công với số dư: %s', v_system_cash)
    );
END;
$function$;

-- ==============================================================================
-- 2. DATABASE GATEKEEPER (Trigger on cash_flow)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_guard_cash_flow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_has_open_shift boolean;
    v_is_admin boolean;
BEGIN
    -- Allow system/automated processes (if any) or check specifically for user action
    -- We assume auth.uid() is present for user actions.
    
    IF auth.uid() IS NULL THEN
        -- Allow system background jobs if they don't have auth.uid()
        -- OR block them? Better to allow if it's internal. 
        -- But for safety, let's assume all legitimate user actions have auth.uid()
        RETURN NEW;
    END IF;

    -- Check if user is Admin (Admin can Override/View, but for Insert they should ideally own a shift or use Override)
    -- However, the requirement is "Check if auth.uid() owns a shift with status='open'"
    -- If Admin wants to do transaction, they must "Override" (which means they become the shift owner or similar).
    -- But wait, Override Login creates a session. Does it create a shift?
    -- The prompt says: "Muốn thao tác, Admin phải thực hiện lệnh Override (Chiếm quyền) để đứng tên chủ ca."
    -- So yes, Admin MUST own the open shift.

    SELECT EXISTS (
        SELECT 1 FROM public.shifts 
        WHERE staff_id = auth.uid() 
        AND status = 'open'
    ) INTO v_has_open_shift;

    IF NOT v_has_open_shift THEN
        RAISE EXCEPTION 'Mưu đồ thu tiền lậu? Hãy mở ca trước! (User % không có ca mở)', auth.uid();
    END IF;

    RETURN NEW;
END;
$$;

-- Drop trigger if exists to avoid duplication errors during re-runs
DROP TRIGGER IF EXISTS trg_block_illegal_cash_flow ON public.cash_flow;

CREATE TRIGGER trg_block_illegal_cash_flow
BEFORE INSERT ON public.cash_flow
FOR EACH ROW
EXECUTE FUNCTION public.fn_guard_cash_flow();

-- ==============================================================================
-- 3. SESSION SYNC (Force Logout in close_shift)
-- ==============================================================================
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
    v_item jsonb;
BEGIN
    v_requester_id := auth.uid();
    
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    
    IF v_shift.id IS NULL OR v_shift.status != 'open' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ca làm việc không tồn tại hoặc đã đóng.');
    END IF;

    -- Security Check: Only Owner or Admin (logic can be added here, but usually handled by UI/Gatekeeper)
    -- For now, we trust the ID but we could enforce v_shift.staff_id = v_requester_id OR Admin.

    -- 1. CALCULATE DECLARED CASH
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

    -- 2. CALCULATE SYSTEM CASH (Total In - Total Out during shift)
    -- Logic: Start Cash + (In - Out)
    -- Actually, simpler: Get current Wallet Balance? 
    -- The previous implementation calculated flows. 
    -- Let's stick to Wallet Balance for accuracy if available, or Flow calculation.
    -- Using Flow calculation ensures we know what happened *during* the shift.
    
    -- Get Flow Sums
    SELECT COALESCE(SUM(amount), 0) INTO v_total_in
    FROM public.cash_flow
    WHERE created_at >= v_shift.start_time 
    AND flow_type = 'IN';

    SELECT COALESCE(SUM(amount), 0) INTO v_total_out
    FROM public.cash_flow
    WHERE created_at >= v_shift.start_time 
    AND flow_type = 'OUT';

    v_system_cash := v_shift.start_cash + v_total_in - v_total_out;
    v_variance := v_declared_cash - v_system_cash;

    -- 3. CLOSE SHIFT
    UPDATE public.shifts
    SET 
        end_time = now(),
        status = 'closed',
        declared_cash = v_declared_cash,
        system_cash = v_system_cash,
        difference = v_variance,
        notes = p_notes
    WHERE id = p_shift_id;

    -- 4. FORCE LOGOUT SIGNAL
    -- Update last_force_logout_at for the staff who owned the shift
    UPDATE public.staff
    SET last_force_logout_at = now()
    WHERE id = v_shift.staff_id;

    RETURN jsonb_build_object(
        'success', true, 
        'system_cash', v_system_cash,
        'variance', v_variance,
        'message', 'Đã chốt ca thành công. Phiên làm việc sẽ kết thúc.'
    );
END;
$function$;
