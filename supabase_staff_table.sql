-- 1. Tạo bảng 'profiles' để lưu trữ thông tin nhân viên
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff')),
    phone TEXT,
    permissions TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bật Row Level Security (RLS) cho bảng 'profiles'
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Xóa các chính sách cũ (nếu có) để tránh xung đột
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles." ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view their own profile." ON public.profiles;

-- 4. Tạo các chính sách RLS mới

-- CHÍNH SÁCH 1: Quản trị viên ('admin') có thể thực hiện mọi thao tác trên bảng.
CREATE POLICY "Admins can manage all profiles."
    ON public.profiles
    FOR ALL
    TO authenticated
    USING ( (auth.jwt() ->> 'role') = 'admin' )
    WITH CHECK ( (auth.jwt() ->> 'role') = 'admin' );

-- CHÍNH SÁCH 2: Người dùng đã xác thực có thể xem hồ sơ của chính họ.
CREATE POLICY "Authenticated users can view their own profile."
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING ( auth.uid() = id );

-- 5. Tạo một hàm để tự động tạo hồ sơ khi một người dùng mới được tạo trong auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, role)
  VALUES (new.id, new.email, 'New User', 'staff');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Tạo một trình kích hoạt để gọi hàm handle_new_user sau mỗi lần chèn vào auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
