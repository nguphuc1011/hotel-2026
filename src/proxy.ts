import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 🏛️ LAYER 1: GREAT WALL SECURITY (Proxy)
// Intercepts all requests before they hit the Page/Layout
export async function proxy(req: NextRequest) {
  const url = req.nextUrl.clone();
  console.log(`🛡️ Proxy: ${req.method} ${url.pathname}`);
  
  // 1. PUBLIC PATHS & ASSETS (Bỏ qua bảo mật cho tệp công khai)
  const publicPaths = ['/login', '/auth/callback', '/favicon.ico', '/manifest.json', '/sw.js', '/next.svg'];
  const isPublicPath = publicPaths.some(path => url.pathname === path || url.pathname.startsWith(path + '/'));
  
  // Check for tenant-specific login: /[slug]/login
  const isTenantLogin = /\/[^/]+\/login\/?$/.test(url.pathname);

  if (isPublicPath || isTenantLogin) {
    console.log(`✅ Proxy: Public/Login path allowed`);
    return NextResponse.next();
  }

  // 2. SAAS ADMIN SECURITY (Bảo vệ phòng điều khiển tổng)
  if (url.pathname.startsWith('/saas-admin')) {
    const hasAuthCookie = req.cookies.has('1hotel_session');
    const role = (req.cookies.get('1hotel_role')?.value || '').toLowerCase();
    
    if (!hasAuthCookie || (role !== 'admin' && role !== 'owner')) {
      console.log(`🚫 Proxy: SaaS Admin access denied, redirecting to /login`);
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // 3. TENANT AUTHENTICATION (Bảo vệ dữ liệu khách hàng)
  const hasAuthCookie = req.cookies.has('1hotel_session');

  if (!hasAuthCookie) {
    // Nếu chưa đăng nhập, đưa về trang login của khách sạn đó
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0 && pathParts[0] !== 'login' && pathParts[0] !== 'undefined') {
      const slug = pathParts[0];
      console.log(`🚫 Proxy: Unauthenticated access to /${slug}, redirecting to /${slug}/login`);
      url.pathname = `/${slug}/login`;
    } else {
      console.log(`🚫 Proxy: Unauthenticated access, redirecting to /login`);
      url.pathname = '/login';
    }
    return NextResponse.redirect(url);
  }

  console.log(`✅ Proxy: Authenticated path allowed`);
  return NextResponse.next();
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
