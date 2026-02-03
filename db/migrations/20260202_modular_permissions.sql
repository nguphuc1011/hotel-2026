
-- Tạo bảng mới để lưu trữ cấu trúc Modular Permission
CREATE TABLE IF NOT EXISTS permission_settings (
    module_id TEXT PRIMARY KEY, -- 'money', 'dashboard', 'report', etc.
    is_enabled BOOLEAN DEFAULT TRUE, -- Master Switch
    actions JSONB DEFAULT '{}'::jsonb, -- Cấu hình chi tiết hành động
    exceptions TEXT[] DEFAULT ARRAY[]::TEXT[], -- Danh sách User ID ngoại lệ (luôn được vào khi tắt)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bật RLS
ALTER TABLE permission_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Chỉ Admin và Manager được xem
CREATE POLICY "Allow view for authorized roles" ON permission_settings
    FOR SELECT
    USING (
        auth.role() = 'authenticated'
    );

-- Policy: Chỉ Admin được sửa
CREATE POLICY "Allow update for admin only" ON permission_settings
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM staff 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Insert dữ liệu mẫu ban đầu (Migration từ dữ liệu cũ)
INSERT INTO permission_settings (module_id, is_enabled, actions)
VALUES 
('money', TRUE, '{
    "view_money": {"default": "ALLOW", "roles": {"receptionist": "ALLOW", "manager": "ALLOW"}}, 
    "view_money_balance_cash": {"default": "DENY", "roles": {"manager": "ALLOW"}},
    "finance_manual_cash_out": {"default": "PIN", "roles": {"manager": "ALLOW"}}
}'::jsonb),
('dashboard', TRUE, '{
    "view_dashboard": {"default": "ALLOW", "roles": {"receptionist": "ALLOW", "manager": "ALLOW"}}
}'::jsonb),
('settings', TRUE, '{
    "view_settings": {"default": "DENY", "roles": {"manager": "ALLOW"}}
}'::jsonb)
ON CONFLICT (module_id) DO NOTHING;
