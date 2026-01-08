'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: ('admin' | 'manager' | 'staff')[];
}

export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    // Nếu đang load thì kiên nhẫn đợi, không làm gì cả
    if (loading || isRedirecting) return;

    // CHỐT CHẶN 1: Nếu thực sự không có profile sau khi đã load xong
    if (!profile) {
      setTimeout(() => {
        setIsRedirecting(true);
        // Kiểm tra xem có phải đang ở trang login không để tránh vòng lặp
        if (pathname !== '/login') {
          router.replace('/login');
        }
      }, 0);
      return;
    }

    // CHỐT CHẶN 2: Có profile nhưng sai quyền hạn
    if (!allowedRoles.includes(profile.role)) {
      setTimeout(() => {
        setIsRedirecting(true);
        toast.error('Bệ Hạ chưa ban quyền cho khanh vào địa bàn này!');
        router.replace('/');
      }, 0);
    }
  }, [profile, loading, allowedRoles, router, pathname, isRedirecting]);

  // TRẠNG THÁI CHỜ: Hiển thị khi đang load hoặc đang trong quá trình chuyển hướng
  if (loading || isRedirecting || (!profile && pathname !== '/login')) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold animate-pulse">Đang thẩm tra lệnh bài...</p>
        </div>
      </div>
    );
  }

  // Nếu không khớp quyền thì không hiển thị gì cả để bảo mật
  if (!profile || !allowedRoles.includes(profile.role)) {
    return null;
  }

  return <>{children}</>;
}
