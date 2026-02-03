-- Drop existing policies to be safe and avoid conflicts
DROP POLICY IF EXISTS "Admin Write" ON public.role_permissions;
DROP POLICY IF EXISTS "Public Read" ON public.role_permissions;
DROP POLICY IF EXISTS "Allow all access for authenticated users" ON public.role_permissions;

-- Enable RLS (idempotent)
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Create Read Policy (Public/Authenticated)
CREATE POLICY "Public Read" ON public.role_permissions 
FOR SELECT 
USING (true);

-- Create Write Policy (Admin Only - Case Insensitive)
CREATE POLICY "Admin Write" ON public.role_permissions 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.staff 
        WHERE id = auth.uid() AND role ILIKE 'admin'
    )
);

-- Just in case, allow Managers to update permissions? 
-- The user request implies they are setting up permissions, likely as Admin.
-- But let's stick to Admin for sensitive permission changes.
