-- Create shift_denominations table
CREATE TABLE IF NOT EXISTS public.shift_denominations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    shift_id uuid REFERENCES public.shifts(id) ON DELETE CASCADE,
    denomination integer NOT NULL,
    quantity integer NOT NULL DEFAULT 0,
    total_amount numeric GENERATED ALWAYS AS (denomination * quantity) STORED,
    created_at timestamp with time zone DEFAULT now()
);

-- Add audit_status to shift_reports
ALTER TABLE public.shift_reports 
ADD COLUMN IF NOT EXISTS audit_status text DEFAULT 'pending' CHECK (audit_status IN ('pending', 'approved', 'adjusted', 'rejected'));

-- Update close_shift RPC
CREATE OR REPLACE FUNCTION public.close_shift(
    p_shift_id uuid, 
    p_denominations jsonb DEFAULT NULL, -- Format: '[{"denomination": 500000, "quantity": 10}, ...]'
    p_notes text DEFAULT NULL,
    p_declared_cash_manual numeric DEFAULT NULL -- Allow manual override if no denominations provided
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_shift record;
    v_system_cash numeric;
    v_total_in numeric;
    v_total_out numeric;
    v_declared_cash numeric := 0;
    v_variance numeric;
    v_audit_status text;
    v_item jsonb;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
    
    IF v_shift.id IS NULL OR v_shift.status != 'open' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ca làm việc không tồn tại hoặc đã đóng.');
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
