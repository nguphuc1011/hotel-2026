-- Migration: Full 3-in-1 Security System (Consolidated)
-- Includes: Policy Types, Role/User Inheritance, RPCs
-- Created: 2026-01-29

-- 1. Ensure settings_security has policy_type
ALTER TABLE public.settings_security 
ADD COLUMN IF NOT EXISTS policy_type text CHECK (policy_type IN ('ALLOW', 'PIN', 'DENY'));

-- Update existing NULL policy_types based on is_enabled (Migration logic)
UPDATE public.settings_security
SET policy_type = CASE 
    WHEN is_enabled = true THEN 'PIN'
    ELSE 'ALLOW'
END
WHERE policy_type IS NULL;

-- 2. Create Role & User Policy Tables (Inheritance)
CREATE TABLE IF NOT EXISTS public.security_role_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role text NOT NULL,
    action_key text NOT NULL REFERENCES public.settings_security(key),
    policy_type text NOT NULL CHECK (policy_type IN ('ALLOW', 'PIN', 'DENY')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(role, action_key)
);

CREATE TABLE IF NOT EXISTS public.security_user_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    action_key text NOT NULL REFERENCES public.settings_security(key),
    policy_type text NOT NULL CHECK (policy_type IN ('ALLOW', 'PIN', 'DENY')),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(staff_id, action_key)
);

-- 4. RPC: Resolve Effective Policy (The "Smart Flow" Logic)
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

-- 5. RPC: Get Security Matrix (For Settings UI)
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
            'role_policies', COALESCE((
                SELECT jsonb_object_agg(rp.role, rp.policy_type)
                FROM public.security_role_policies rp
                WHERE rp.action_key = s.key
            ), '{}'::jsonb),
            'user_policies', COALESCE((
                SELECT jsonb_object_agg(up.staff_id, up.policy_type)
                FROM public.security_user_policies up
                WHERE up.action_key = s.key
            ), '{}'::jsonb)
        )
    )
    INTO v_result
    FROM public.settings_security s;
    
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 6. RPC: Set Policy Override
CREATE OR REPLACE FUNCTION public.fn_set_policy_override(
    p_scope text, -- 'ROLE' or 'USER'
    p_target_id text,
    p_action_key text,
    p_policy_type text -- 'ALLOW', 'PIN', 'DENY', or 'RESET'
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
