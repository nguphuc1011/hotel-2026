
DO $$
DECLARE
    v_data_type text;
BEGIN
    SELECT data_type INTO v_data_type 
    FROM information_schema.columns 
    WHERE table_name = 'role_permissions' AND column_name = 'permissions';
    
    RAISE NOTICE 'Column Type: %', v_data_type;
END $$;
