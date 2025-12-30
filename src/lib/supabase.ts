import { createClient } from '@supabase/supabase-js';

const getEnv = (key: string) => {
  if (typeof window !== 'undefined') {
    return window.process?.env?.[key] || process.env[key];
  }
  return process.env[key];
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  // Trong môi trường build/prerender của Next.js, biến môi trường có thể chưa có
  // Chúng ta sẽ log cảnh báo thay vì throw error ngay lập tức để tránh làm hỏng bản build
  // nếu trang đó không thực sự sử dụng supabase lúc build.
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.warn('Supabase environment variables are missing!');
  }
}

// Khởi tạo client với fallback để tránh crash module load
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);
