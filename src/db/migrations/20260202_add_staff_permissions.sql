
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL;

-- Comment on column
COMMENT ON COLUMN public.staff.permissions IS 'User-specific permission overrides. If NULL, use role_permissions. If set, replaces role permissions.';
