-- Fix RPCs for Security Approval Flow
-- SCRIPT "NUCLEAR DROP": Xóa sạch mọi phiên bản cũ dựa trên tên hàm
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT oid::regprocedure as sig 
              FROM pg_proc 
              WHERE proname IN ('fn_approve_request', 'fn_create_approval_request') 
              AND pronamespace = 'public'::regnamespace) 
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END $$;

-- 1. Tạo lại fn_create_approval_request
CREATE OR REPLACE FUNCTION public.fn_create_approval_request(
    p_action_key text,
    p_request_data jsonb DEFAULT '{}',
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id uuid;
    v_staff_id uuid;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());
    
    IF v_staff_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không xác định được nhân viên yêu cầu');
    END IF;

    INSERT INTO public.pending_approvals (action_key, staff_id, request_data)
    VALUES (p_action_key, v_staff_id, p_request_data)
    RETURNING id INTO v_id;
    
    RETURN jsonb_build_object(
        'success', true, 
        'request_id', v_id,
        'approval_id', v_id
    );
END;
$$;

-- 2. Tạo lại fn_approve_request 
-- LƯU Ý: Thứ tự tham số cực kỳ quan trọng để khớp với Schema Cache của PostgREST
-- p_manager_id, p_manager_pin, p_method, p_request_id (theo thứ tự alphabet của tên tham số)
CREATE OR REPLACE FUNCTION public.fn_approve_request(
    p_manager_id uuid DEFAULT NULL,
    p_manager_pin text DEFAULT NULL,
    p_method text DEFAULT 'PIN_OVERRIDE',
    p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_manager_id uuid;
    v_req RECORD;
BEGIN
    -- Kiểm tra requestId có hợp lệ không
    IF p_request_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Thiếu ID yêu cầu (p_request_id)');
    END IF;

    SELECT * INTO v_req FROM public.pending_approvals WHERE id = p_request_id;
    
    IF v_req IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Yêu cầu không tồn tại hoặc ID sai định dạng: ' || p_request_id::text);
    END IF;
    
    IF v_req.status <> 'PENDING' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Yêu cầu đã được xử lý (Status: ' || v_req.status || ')');
    END IF;

    -- Xác định managerId
    IF p_manager_pin IS NOT NULL AND p_manager_pin <> '' THEN
        -- Xác thực qua PIN
        SELECT id INTO v_manager_id FROM public.staff 
        WHERE pin_hash = p_manager_pin AND (role IN ('Manager', 'Admin', 'Owner')) AND is_active = true;
        
        IF v_manager_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'message', 'Mã PIN quản lý không đúng hoặc không đủ quyền');
        END IF;
    ELSIF p_manager_id IS NOT NULL THEN
        -- Xác thực qua ID (Telegram/Webhook)
        v_manager_id := p_manager_id;
    ELSE
        -- Fallback về auth.uid()
        v_manager_id := auth.uid(); 
    END IF;

    IF v_manager_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không xác định được người phê duyệt');
    END IF;

    -- Thực hiện update
    UPDATE public.pending_approvals
    SET status = 'APPROVED',
        approved_by_staff_id = v_manager_id,
        approval_method = p_method,
        updated_at = now()
    WHERE id = p_request_id;
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Đã duyệt yêu cầu thành công',
        'approved_by_id', v_manager_id,
        'approved_by_name', (SELECT full_name FROM public.staff WHERE id = v_manager_id)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống SQL: ' || SQLERRM);
END;
$$;
