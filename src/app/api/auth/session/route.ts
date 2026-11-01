import { NextRequest, NextResponse } from 'next/server';
import { signSessionJwt, verifySessionJwt } from '@/lib/jwt';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user, slug } = body;

    if (!user || !user.hotel_id) {
      return NextResponse.json({ error: 'Thông tin người dùng không hợp lệ hoặc thiếu hotel_id' }, { status: 400 });
    }

    const hotelSlug = slug || user.hotel_slug || 'default';

    const token = await signSessionJwt({
      sub: String(user.id || user.username),
      username: user.username || '',
      role: user.role || 'staff',
      hotel_id: user.hotel_id,
      hotel_slug: hotelSlug,
    });

    const res = NextResponse.json({ success: true, token });

    // Cấu hình cookie an toàn HttpOnly
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      path: '/',
      sameSite: 'lax' as const,
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60, // 7 ngày
    };

    // Cookie JWT có chữ ký số
    res.cookies.set('1hotel_jwt', token, {
      ...cookieOptions,
      httpOnly: true,
    });

    // Cookie trạng thái phiên
    res.cookies.set('1hotel_session', '1', cookieOptions);
    res.cookies.set('1hotel_slug', hotelSlug, cookieOptions);
    res.cookies.set('1hotel_role', user.role || 'staff', cookieOptions);
    res.cookies.set('1hotel_id', user.hotel_id, cookieOptions);

    return res;
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Lỗi xử lý phiên làm việc' }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  const clearOptions = {
    path: '/',
    maxAge: 0,
  };

  res.cookies.set('1hotel_jwt', '', clearOptions);
  res.cookies.set('1hotel_session', '', clearOptions);
  res.cookies.set('1hotel_slug', '', clearOptions);
  res.cookies.set('1hotel_role', '', clearOptions);
  res.cookies.set('1hotel_id', '', clearOptions);

  return res;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('1hotel_jwt')?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const payload = await verifySessionJwt(token);
  if (!payload) {
    return NextResponse.json({ authenticated: false, error: 'Token không hợp lệ hoặc đã hết hạn' }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true, session: payload });
}
