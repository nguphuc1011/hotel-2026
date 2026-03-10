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

    RETURN jsonb_build_object(
        'success', false, 
        'message', 'Flow xin lệnh đã bị vô hiệu hóa'
    );
END;
$$;

-- 2. Tạo lại fn_approve_request (giữ stub để tránh lỗi schema cache, nhưng không còn dùng)
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
    RETURN jsonb_build_object(
        'success', false,
        'message', 'Flow xin lệnh đã bị vô hiệu hóa'
    );
END;
$$;
