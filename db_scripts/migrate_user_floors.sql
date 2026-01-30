
-- Table for User Floor Permissions
CREATE TABLE IF NOT EXISTS user_floors (
    user_id UUID REFERENCES staff(id) ON DELETE CASCADE,
    floor INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, floor)
);

-- Enable RLS
ALTER TABLE user_floors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read user_floors" ON user_floors;
CREATE POLICY "Allow public read user_floors" ON user_floors FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert/update/delete user_floors" ON user_floors;
CREATE POLICY "Allow authenticated insert/update/delete user_floors" ON user_floors FOR ALL USING (auth.role() = 'authenticated');

-- RPC to get floors for a user
CREATE OR REPLACE FUNCTION fn_get_user_floors(p_user_id UUID)
RETURNS TABLE (floor INTEGER) AS $$
BEGIN
    RETURN QUERY SELECT uf.floor FROM user_floors uf WHERE uf.user_id = p_user_id ORDER BY uf.floor;
END;
$$ LANGUAGE plpgsql;

-- RPC to set floors for a user
CREATE OR REPLACE FUNCTION fn_set_user_floors(p_user_id UUID, p_floors INTEGER[])
RETURNS VOID AS $$
BEGIN
    DELETE FROM user_floors WHERE user_id = p_user_id;
    
    IF p_floors IS NOT NULL AND array_length(p_floors, 1) > 0 THEN
        INSERT INTO user_floors (user_id, floor)
        SELECT p_user_id, UNNEST(p_floors);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- RPC to get all available floors from rooms
CREATE OR REPLACE FUNCTION fn_get_available_floors()
RETURNS TABLE (floor INTEGER) AS $$
BEGIN
    RETURN QUERY SELECT DISTINCT r.floor FROM rooms r WHERE r.floor IS NOT NULL ORDER BY r.floor;
END;
$$ LANGUAGE plpgsql;

-- RPC to get all user floors map
CREATE OR REPLACE FUNCTION fn_get_all_user_floors_map()
RETURNS TABLE (user_id UUID, floors INTEGER[]) AS $$
BEGIN
    RETURN QUERY 
    SELECT uf.user_id, array_agg(uf.floor ORDER BY uf.floor)
    FROM user_floors uf
    GROUP BY uf.user_id;
END;
$$ LANGUAGE plpgsql;
