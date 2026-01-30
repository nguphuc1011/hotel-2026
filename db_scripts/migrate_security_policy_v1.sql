-- Migration: Upgrade Security Settings to 3-in-1 Policy (Tam Tầng Phòng Thủ)
-- Created: 2026-01-29

-- 1. Add policy_type column to settings_security
ALTER TABLE public.settings_security 
ADD COLUMN IF NOT EXISTS policy_type text CHECK (policy_type IN ('ALLOW', 'PIN', 'APPROVAL', 'DENY'));

-- 2. Create Pending Approvals Table (For 'APPROVAL' flow)
CREATE TABLE IF NOT EXISTS public.pending_approvals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    action_key text NOT NULL REFERENCES public.settings_security(key),
    staff_id uuid NOT NULL REFERENCES public.staff(id),
    request_data jsonb DEFAULT '{}',
    status text DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by_staff_id uuid REFERENCES public.staff(id),
    approval_method text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. Create Role-based Policies Table (For Role overrides)
CREATE TABLE IF NOT EXISTS public.security_role_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role text NOT NULL,
    action_key text NOT NULL REFERENCES public.settings_security(key),
    policy_type text NOT NULL CHECK (policy_type IN ('ALLOW', 'PIN', 'APPROVAL', 'DENY')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(role, action_key)
);

-- 4. RPC to Get Full Security Context
CREATE OR REPLACE FUNCTION public.fn_get_security_context(p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_object_agg(
        s.key, 
        COALESCE(rp.policy_type, s.policy_type, 'PIN')
    )
    INTO v_result
    FROM public.settings_security s
    LEFT JOIN public.security_role_policies rp ON s.key = rp.action_key AND rp.role = p_role;
    
    RETURN v_result;
END;
$$;

-- 5. RPC to Create Pending Approval
CREATE OR REPLACE FUNCTION public.fn_create_approval_request(
    p_action_key text,
    p_request_data jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id uuid;
BEGIN
    INSERT INTO public.pending_approvals (action_key, staff_id, request_data)
    VALUES (p_action_key, auth.uid(), p_request_data)
    RETURNING id INTO v_id;
    
    RETURN jsonb_build_object('success', true, 'approval_id', v_id);
END;
$$;

-- 6. RPC to Approve Request
CREATE OR REPLACE FUNCTION public.fn_approve_request_override(
    p_request_id uuid,
    p_manager_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_manager_id uuid;
BEGIN
    SELECT id INTO v_manager_id FROM public.staff 
    WHERE pin_hash = p_manager_pin AND (role = 'Manager' OR role = 'Admin' OR role = 'Owner') AND is_active = true;
    
    IF v_manager_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Mã PIN quản lý không đúng hoặc không đủ quyền');
    END IF;

    UPDATE public.pending_approvals
    SET status = 'APPROVED',
        approved_by_staff_id = v_manager_id,
        approval_method = 'PIN_OVERRIDE',
        updated_at = now()
    WHERE id = p_request_id AND status = 'PENDING';
    
    RETURN jsonb_build_object('success', true, 'message', 'Đã duyệt nóng thành công');
END;
$$;

-- 7. DATA MIGRATION (Backfill)
-- Map existing is_enabled to new policy_type
-- is_enabled = true  -> PIN (Require PIN)
-- is_enabled = false -> ALLOW (No PIN required)
UPDATE public.settings_security
SET policy_type = CASE 
    WHEN is_enabled = true THEN 'PIN'
    ELSE 'ALLOW'
END
WHERE policy_type IS NULL;
