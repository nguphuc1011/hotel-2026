-- Migration: Upgrade Security Settings to 3-in-1 Policy (Tam Tầng Phòng Thủ)
-- Created: 2026-01-29

-- 1. Add policy_type column to settings_security
ALTER TABLE public.settings_security 
ADD COLUMN IF NOT EXISTS policy_type text CHECK (policy_type IN ('ALLOW', 'PIN', 'DENY'));
 
-- 2. Create Role-based Policies Table (For Role overrides)
CREATE TABLE IF NOT EXISTS public.security_role_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role text NOT NULL,
    action_key text NOT NULL REFERENCES public.settings_security(key),
    policy_type text NOT NULL CHECK (policy_type IN ('ALLOW', 'PIN', 'DENY')),
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

-- 5. DATA MIGRATION (Backfill)
-- Map existing is_enabled to new policy_type
-- is_enabled = true  -> PIN (Require PIN)
-- is_enabled = false -> ALLOW (No PIN required)
UPDATE public.settings_security
SET policy_type = CASE 
    WHEN is_enabled = true THEN 'PIN'
    ELSE 'ALLOW'
END
WHERE policy_type IS NULL;
