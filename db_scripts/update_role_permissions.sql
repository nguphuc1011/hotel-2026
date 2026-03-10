-- Update permissions for Admin to include 'manage_shifts'
-- and remove obsolete 'shift_force_close'

-- 1. Remove 'shift_force_close' from all roles (using array_remove if it's text[])
-- Assuming permissions is text[] based on TypeScript usage. 
-- If it's JSONB, the syntax would be different. Let's assume text[] first as it's common with Supabase.

DO $$
BEGIN
    -- Check if column is text[]
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'role_permissions' 
        AND column_name = 'permissions' 
        AND data_type = 'ARRAY'
    ) THEN
        -- Remove old key
        UPDATE role_permissions
        SET permissions = array_remove(permissions, 'shift_force_close');

        -- Add new key to Admin
        UPDATE role_permissions
        SET permissions = array_append(permissions, 'manage_shifts')
        WHERE role_code = 'Admin' 
        AND NOT ('manage_shifts' = ANY(permissions));
        
    ELSE
        -- Assume JSONB if not ARRAY
        -- Remove old key (complex in JSONB, might skip if not critical)
        
        -- Add new key to Admin
        UPDATE role_permissions
        SET permissions = permissions || '["manage_shifts"]'::jsonb
        WHERE role_code = 'Admin'
        AND NOT (permissions @> '["manage_shifts"]');
    END IF;
END $$;
