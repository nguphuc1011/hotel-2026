import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, full_name, username, role, phone, permissions } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Hệ thống chưa cấu hình SUPABASE_SERVICE_ROLE_KEY trong môi trường.' },
        { status: 500 }
      );
    }

    // Sử dụng Admin SDK để tạo user mà không cần đăng xuất user hiện tại
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 1. Tạo tài khoản trong auth.users
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, username }
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = authData.user.id;

    // 2. Tạo profile trong public.profiles
    // Lưu ý: Nếu có trigger tự động tạo profile thì đoạn này có thể gây lỗi trùng ID
    // Nhưng chúng ta dùng upsert để an toàn
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        full_name,
        username,
        role,
        phone,
        permissions,
        created_at: new Date().toISOString()
      });

    if (profileError) {
      // Nếu lỗi tạo profile, có thể muốn xóa user auth vừa tạo, nhưng ở đây ta báo lỗi để admin biết
      return NextResponse.json({ error: 'Đã tạo tài khoản nhưng lỗi hồ sơ: ' + profileError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, user: authData.user });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
