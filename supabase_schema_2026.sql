-- 1. Cập nhật bảng 'settings' (Cấu hình & Thuế)
DO $$ 
BEGIN
    -- Thêm các cột mới nếu chưa tồn tại
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='tax_code') THEN
        ALTER TABLE settings ADD COLUMN tax_code TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='tax_config') THEN
        ALTER TABLE settings ADD COLUMN tax_config JSONB DEFAULT '{"vat": 8, "service_fee": 5}'::jsonb;
    END IF;

    -- Đảm bảo cột 'key' là duy nhất để dùng lệnh upsert
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='key') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='settings' AND constraint_type='UNIQUE' AND constraint_name='settings_key_key') THEN
            ALTER TABLE settings ADD CONSTRAINT settings_key_key UNIQUE (key);
        END IF;
    END IF;
END $$;

-- 2. Cập nhật bảng 'services' (Kho & Phân loại Thuế)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='tax_type') THEN
        ALTER TABLE services ADD COLUMN tax_type TEXT CHECK (tax_type IN ('service', 'accommodation', 'goods')) DEFAULT 'service';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='keywords') THEN
        ALTER TABLE services ADD COLUMN keywords TEXT[] DEFAULT '{}';
    END IF;
END $$;

-- 3. Tạo bảng 'audit_logs' (Thám tử chống gian lận)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    entity_id TEXT,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    ip_address TEXT,
    suspicion_score FLOAT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Cập nhật bảng 'rooms' (Phòng & Giọng nói)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rooms' AND column_name='voice_alias') THEN
        ALTER TABLE rooms ADD COLUMN voice_alias TEXT;
    END IF;
END $$;

-- 5. Cập nhật bảng 'customers' (Khách & OCR)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='ocr_data') THEN
        ALTER TABLE customers ADD COLUMN ocr_data JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 6. Cấu hình Row Level Security (RLS)

-- Bật RLS cho tất cả các bảng
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Chính sách cho 'audit_logs': Nhân viên chỉ được xem và thêm, không được sửa/xóa
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON audit_logs;
CREATE POLICY "Enable read access for authenticated users" ON audit_logs
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON audit_logs;
CREATE POLICY "Enable insert for authenticated users" ON audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);

-- (Mặc định không có chính sách UPDATE/DELETE nghĩa là bị chặn hoàn toàn cho mọi role trừ service_role)

-- Chính sách cho 'settings': Chỉ Admin mới được sửa
DROP POLICY IF EXISTS "Enable read for all" ON settings;
CREATE POLICY "Enable read for all" ON settings
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Only admin can update settings" ON settings;
CREATE POLICY "Only admin can update settings" ON settings
    FOR UPDATE TO authenticated 
    USING ( (auth.jwt() ->> 'role') = 'admin' )
    WITH CHECK ( (auth.jwt() ->> 'role') = 'admin' );

-- Chính sách cho 'services', 'rooms', 'customers': Nhân viên được toàn quyền (theo thiết kế cũ)
DROP POLICY IF EXISTS "Enable all for authenticated" ON services;
CREATE POLICY "Enable all for authenticated" ON services FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable all for authenticated" ON rooms;
CREATE POLICY "Enable all for authenticated" ON rooms FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable all for authenticated" ON customers;
CREATE POLICY "Enable all for authenticated" ON customers FOR ALL TO authenticated USING (true);
