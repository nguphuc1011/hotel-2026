-- Add last_force_logout_at column to staff table if it doesn't exist
ALTER TABLE staff 
ADD COLUMN IF NOT EXISTS last_force_logout_at TIMESTAMPTZ DEFAULT NOW();

-- Create RPC to trigger global logout
CREATE OR REPLACE FUNCTION force_staff_logout(p_staff_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE staff 
  SET last_force_logout_at = NOW() 
  WHERE id = p_staff_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION force_staff_logout(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION force_staff_logout(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION force_staff_logout(UUID) TO anon; -- Depending on auth setup
