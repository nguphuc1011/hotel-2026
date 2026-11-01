import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionJwt } from '@/lib/jwt';

// 🏛️ LAYER 1: GREAT WALL SECURITY (Edge Middleware)
// Chặn và kiểm tra toàn diện tất cả các requests trước khi render Layout/Page
export async function proxy(req: NextRequest) {
  const url = req.nextUrl.clone();
  
  // 1. PUBLIC PATHS & ASSETS (Bỏ qua cho tệp công khai và API auth)
  const publicPaths = [
    '/login',
    '/auth/callback',
    '/api/auth/session',
    '/favicon.ico',
    '/manifest.json',
    '/sw.js',
    '/next.svg'
  ];
  const isPublicPath = publicPaths.some(path => url.pathname === path || url.pathname.startsWith(path + '/'));
  
  // Check for tenant-specific login: /[slug]/login
  const isTenantLogin = /\/[^/]+\/login\/?$/.test(url.pathname);

  if (isPublicPath || isTenantLogin) {
    return NextResponse.next();
  }

  // 2. VERIFY SIGNED SESSION JWT (Xác thực chữ ký số)
  const jwtToken = req.cookies.get('1hotel_jwt')?.value;
  const legacySession = req.cookies.get('1hotel_session')?.value;
  
  let sessionPayload = null;
  if (jwtToken) {
    sessionPayload = await verifySessionJwt(jwtToken);
  }

  // Nếu không có token hợp lệ và cũng không có session cookie
  if (!sessionPayload && !legacySession) {
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0 && pathParts[0] !== 'login' && pathParts[0] !== 'undefined') {
      const slug = pathParts[0];
      url.pathname = `/${slug}/login`;
    } else {
      url.pathname = '/login';
    }
    return NextResponse.redirect(url);
  }

  // Lấy role và slug từ JWT (nếu có) hoặc cookie fallback
  const userRole = (sessionPayload?.role || req.cookies.get('1hotel_role')?.value || '').toLowerCase();
  const userSlug = (sessionPayload?.hotel_slug || decodeURIComponent(req.cookies.get('1hotel_slug')?.value || '')).toLowerCase();

  // 3. SAAS ADMIN SECURITY (Bảo vệ phòng điều khiển tổng)
  if (url.pathname.startsWith('/saas-admin')) {
    if (userRole !== 'admin' && userRole !== 'owner') {
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // 4. PREVENT CROSS-TENANT ACCESS (Chặn truy cập chéo giữa các khách sạn)
  const pathParts = url.pathname.split('/').filter(Boolean);
  if (pathParts.length > 0 && pathParts[0] !== 'login' && pathParts[0] !== 'undefined' && userSlug) {
    const requestedSlug = pathParts[0].toLowerCase();
    
    // Nếu truy cập khác slug và không phải admin/owner hệ thống -> chuyển hướng về đúng khách sạn của mình
    if (requestedSlug !== userSlug && userRole !== 'admin' && userRole !== 'owner') {
      url.pathname = `/${userSlug}`;
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

// Next.js middleware entry point
export async function middleware(req: NextRequest) {
  return proxy(req);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
