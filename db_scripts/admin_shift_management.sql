-- Create shift_definitions table
CREATE TABLE IF NOT EXISTS public.shift_definitions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL, -- e.g., "Ca Sáng", "Ca Chiều"
    start_time time NOT NULL,
    end_time time NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

-- Seed initial data
INSERT INTO public.shift_definitions (name, start_time, end_time)
VALUES 
    ('Ca Sáng', '06:00:00', '14:00:00'),
    ('Ca Chiều', '14:00:00', '22:00:00'),
    ('Ca Đêm', '22:00:00', '06:00:00')
ON CONFLICT DO NOTHING;

-- RPC to get shift definitions
CREATE OR REPLACE FUNCTION public.get_shift_definitions()
RETURNS SETOF public.shift_definitions
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT * FROM public.shift_definitions WHERE is_active = true ORDER BY start_time;
$$;

-- RPC to manage shift definitions (Admin)
CREATE OR REPLACE FUNCTION public.manage_shift_definition(
    p_id uuid,
    p_name text,
    p_start_time time,
    p_end_time time,
    p_is_active boolean,
    p_action text -- 'CREATE', 'UPDATE', 'DELETE'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF p_action = 'CREATE' THEN
        INSERT INTO public.shift_definitions (name, start_time, end_time, is_active)
        VALUES (p_name, p_start_time, p_end_time, p_is_active)
        RETURNING id INTO v_id;
        RETURN jsonb_build_object('success', true, 'id', v_id);
    ELSIF p_action = 'UPDATE' THEN
        UPDATE public.shift_definitions
        SET name = p_name, start_time = p_start_time, end_time = p_end_time, is_active = p_is_active
        WHERE id = p_id;
        RETURN jsonb_build_object('success', true);
    ELSIF p_action = 'DELETE' THEN
        DELETE FROM public.shift_definitions WHERE id = p_id;
        RETURN jsonb_build_object('success', true);
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Invalid action');
    END IF;
END;
$$;

-- RPC to resolve shift variance
CREATE OR REPLACE FUNCTION public.resolve_shift_variance(
    p_shift_id uuid,
    p_resolution_type text, -- 'ADJUST' (Hạch toán) or 'IGNORE' (Bỏ qua)
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
    v_category_id uuid;
BEGIN
    SELECT * INTO v_report FROM public.shift_reports WHERE shift_id = p_shift_id;
    
    IF v_report.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Shift report not found');
    END IF;

    v_variance := v_report.variance;

    IF p_resolution_type = 'IGNORE' THEN
        -- Just update status
        UPDATE public.shift_reports
        SET audit_status = 'approved', -- Treated as approved/resolved
            notes = COALESCE(notes, '') || ' [Admin Ignored Variance: ' || p_notes || ']'
        WHERE shift_id = p_shift_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Variance ignored');
        
    ELSIF p_resolution_type = 'ADJUST' THEN
        -- Create transaction to balance
        -- If variance > 0 (Surplus) -> Revenue (Thu nhập khác)
        -- If variance < 0 (Deficit) -> Expense (Chi phí khác/Thất thoát)
        
        IF v_variance > 0 THEN
             -- Get or create category 'Thu nhập khác'
             SELECT id INTO v_category_id FROM public.cash_flow_categories WHERE name = 'Thu nhập khác' LIMIT 1;
             IF v_category_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'Category "Thu nhập khác" not found');
             END IF;

             INSERT INTO public.cash_flow (
                amount, flow_type, category_id, description, payment_method_code, created_by, occurred_at
             ) VALUES (
                v_variance, 'IN', v_category_id, 'Hạch toán dư thừa ca làm việc: ' || p_notes, 'cash', p_admin_id, now()
             );
             
        ELSIF v_variance < 0 THEN
             -- Get or create category 'Thất thoát' or 'Chi phí khác'
             SELECT id INTO v_category_id FROM public.cash_flow_categories WHERE name = 'Chi phí khác' LIMIT 1;
             IF v_category_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'Category "Chi phí khác" not found');
             END IF;

             INSERT INTO public.cash_flow (
                amount, flow_type, category_id, description, payment_method_code, created_by, occurred_at
             ) VALUES (
                ABS(v_variance), 'OUT', v_category_id, 'Hạch toán thiếu hụt ca làm việc: ' || p_notes, 'cash', p_admin_id, now()
             );
        END IF;

        -- Update report status
        UPDATE public.shift_reports
        SET audit_status = 'adjusted',
            notes = COALESCE(notes, '') || ' [Admin Adjusted: ' || p_notes || ']'
        WHERE shift_id = p_shift_id;

        RETURN jsonb_build_object('success', true, 'message', 'Variance adjusted');
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Invalid resolution type');
    END IF;
END;
$$;
