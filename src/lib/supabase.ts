import { createClient } from '@supabase/supabase-js';

// Trong Next.js, biến NEXT_PUBLIC_ sẽ được nhúng vào client-side bundle lúc build.
// Nếu Bệ Hạ chưa dán biến môi trường lên Vercel trước khi build, chúng sẽ là undefined.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Kiểm tra và thông báo lỗi rõ ràng
if (typeof window !== 'undefined') {
  if (!supabaseUrl || !supabaseAnonKey) {
    // eslint-disable-next-line no-console
    console.warn(
      'CẢNH BÁO: Thiếu biến môi trường Supabase. Hãy kiểm tra lại Vercel Environment Variables và đảm bảo đã Redeploy.'
    );
  }
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);
