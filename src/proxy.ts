import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 🏛️ LAYER 1: GREAT WALL SECURITY (Proxy)
// Intercepts all requests before they hit the Page/Layout
export async function proxy(req: NextRequest) {
  const res = NextResponse.next();
  const url = req.nextUrl.clone();
  
  // 1. PUBLIC PATHS & ASSETS (Bỏ qua bảo mật cho tệp công khai)
  const publicPaths = ['/login', '/auth/callback', '/favicon.ico', '/manifest.json', '/sw.js', '/next.svg'];
  const isPublicPath = publicPaths.some(path => url.pathname === path || url.pathname.startsWith(path + '/'));
  
  // Check for tenant-specific login: /[slug]/login
  const isTenantLogin = /\/[^/]+\/login\/?$/.test(url.pathname);

  if (isPublicPath || isTenantLogin) {
    return res;
  }

  // 2. SAAS ADMIN SECURITY (Bảo vệ phòng điều khiển tổng)
  if (url.pathname.startsWith('/saas-admin')) {
    const hasAuthCookie = req.cookies.has('1hotel_session');
    const role = (req.cookies.get('1hotel_role')?.value || '').toLowerCase();
    
    // Chỉ Admin/Owner mới được vào SaaS Admin
    if (!hasAuthCookie || (role !== 'admin' && role !== 'owner')) {
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return res;
  }

  // 3. TENANT AUTHENTICATION (Bảo vệ dữ liệu khách hàng)
  const hasAuthCookie = req.cookies.has('1hotel_session');

  if (!hasAuthCookie) {
    // Nếu chưa đăng nhập, đưa về trang login của khách sạn đó
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0 && pathParts[0] !== 'login' && pathParts[0] !== 'undefined') {
      const slug = pathParts[0];
      url.pathname = `/${slug}/login`;
    } else {
      url.pathname = '/login';
    }
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes (optional: might want to protect them too)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
