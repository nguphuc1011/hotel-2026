-- Bảng lưu trữ Token thông báo đẩy của người dùng
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    device_type TEXT, -- 'mobile', 'desktop'
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bật RLS
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Chính sách: Người dùng chỉ có thể xem/sửa token của chính mình
DROP POLICY IF EXISTS "Users can manage their own tokens" ON public.user_push_tokens;
CREATE POLICY "Users can manage their own tokens" 
    ON public.user_push_tokens 
    FOR ALL 
    TO authenticated 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Chỉ số để tìm kiếm nhanh theo user_id
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id ON public.user_push_tokens(user_id);
