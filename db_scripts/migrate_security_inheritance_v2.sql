-- Migration: Advanced Security Policies (Role & User Inheritance)
-- Created: 2026-01-29

-- 1. Create User-specific Policies Table (Tầng Cá Nhân)
CREATE TABLE IF NOT EXISTS public.security_user_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    action_key text NOT NULL REFERENCES public.settings_security(key),
    policy_type text NOT NULL CHECK (policy_type IN ('ALLOW', 'PIN', 'APPROVAL', 'DENY')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(staff_id, action_key)
);

-- 2. Update Role Policies Table (Tầng Chức Vụ - Đã tạo ở v1 nhưng cần đảm bảo)
CREATE TABLE IF NOT EXISTS public.security_role_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role text NOT NULL,
    action_key text NOT NULL REFERENCES public.settings_security(key),
    policy_type text NOT NULL CHECK (policy_type IN ('ALLOW', 'PIN', 'APPROVAL', 'DENY')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(role, action_key)
);

-- 3. CORE RPC: Get Matrix for UI (Lấy ma trận quyền để hiển thị)
-- Returns: 
-- [
--   { 
--     key: 'checkin_custom_price', 
--     global_policy: 'PIN', 
--     role_policies: { 'Manager': 'ALLOW', 'Staff': 'PIN' }, 
--     user_policies: { 'uuid-1': 'ALLOW', 'uuid-2': 'DENY' }
--   }
-- ]
CREATE OR REPLACE FUNCTION public.fn_get_security_matrix()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'key', s.key,
            'category', s.category,
            'description', s.description,
            'global_policy', COALESCE(s.policy_type, 'PIN'),
            'role_policies', (
                SELECT jsonb_object_agg(rp.role, rp.policy_type)
                FROM public.security_role_policies rp
                WHERE rp.action_key = s.key
            ),
            'user_policies', (
                SELECT jsonb_object_agg(up.staff_id, up.policy_type)
                FROM public.security_user_policies up
                WHERE up.action_key = s.key
            )
        )
    )
    INTO v_result
    FROM public.settings_security s;
    
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 4. CORE RPC: Resolve Effective Policy (Tính quyền cuối cùng cho 1 user)
-- Logic: User > Role > Global
CREATE OR REPLACE FUNCTION public.fn_resolve_policy(
    p_staff_id uuid,
    p_action_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_policy text;
    v_role_policy text;
    v_global_policy text;
    v_role text;
BEGIN
    -- 1. Get User's Role
    SELECT role INTO v_role FROM public.staff WHERE id = p_staff_id;
    
    -- 2. Check User Override (Layer 1)
    SELECT policy_type INTO v_user_policy 
    FROM public.security_user_policies 
    WHERE staff_id = p_staff_id AND action_key = p_action_key;
    
    IF v_user_policy IS NOT NULL THEN
        RETURN v_user_policy;
    END IF;
    
    -- 3. Check Role Override (Layer 2)
    SELECT policy_type INTO v_role_policy
    FROM public.security_role_policies
    WHERE role = v_role AND action_key = p_action_key;
    
    IF v_role_policy IS NOT NULL THEN
        RETURN v_role_policy;
    END IF;
    
    -- 4. Check Global Setting (Layer 3)
    SELECT COALESCE(policy_type, 'PIN') INTO v_global_policy
    FROM public.settings_security
    WHERE key = p_action_key;
    
    RETURN COALESCE(v_global_policy, 'PIN');
END;
$$;

-- 5. RPC: Update Policy (Role or User)
CREATE OR REPLACE FUNCTION public.fn_set_policy_override(
    p_scope text, -- 'ROLE' or 'USER'
    p_target_id text, -- Role Name (e.g. 'Manager') or Staff UUID
    p_action_key text,
    p_policy_type text -- 'ALLOW', 'PIN', 'APPROVAL', 'DENY', or 'RESET' (to delete override)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_scope = 'ROLE' THEN
        IF p_policy_type = 'RESET' THEN
            DELETE FROM public.security_role_policies 
            WHERE role = p_target_id AND action_key = p_action_key;
        ELSE
            INSERT INTO public.security_role_policies (role, action_key, policy_type)
            VALUES (p_target_id, p_action_key, p_policy_type)
            ON CONFLICT (role, action_key) 
            DO UPDATE SET policy_type = p_policy_type, updated_at = now();
        END IF;
        
    ELSIF p_scope = 'USER' THEN
        IF p_policy_type = 'RESET' THEN
            DELETE FROM public.security_user_policies 
            WHERE staff_id = p_target_id::uuid AND action_key = p_action_key;
        ELSE
            INSERT INTO public.security_user_policies (staff_id, action_key, policy_type)
            VALUES (p_target_id::uuid, p_action_key, p_policy_type)
            ON CONFLICT (staff_id, action_key) 
            DO UPDATE SET policy_type = p_policy_type, updated_at = now();
        END IF;
    END IF;
    
    RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. Helper: Get Full Context for Client (Replace old fn_get_security_context)
CREATE OR REPLACE FUNCTION public.fn_get_security_context_v2(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result jsonb;
    v_role text;
BEGIN
    SELECT role INTO v_role FROM public.staff WHERE id = p_staff_id;

    SELECT jsonb_object_agg(
        s.key, 
        public.fn_resolve_policy(p_staff_id, s.key)
    )
    INTO v_result
    FROM public.settings_security s;
    
    RETURN v_result;
END;
$$;
