-- Add permissions column to staff table
-- This column will store specific permission overrides for each user
-- It is a text array (or jsonb) of permission keys
-- If null, the user inherits role permissions

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff' AND column_name = 'permissions') THEN
        ALTER TABLE public.staff ADD COLUMN permissions text[];
    END IF;
END $$;
