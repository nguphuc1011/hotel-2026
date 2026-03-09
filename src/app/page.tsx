'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // 1. Kiểm tra xem có người dùng đang đăng nhập không
    const storedUser = localStorage.getItem('1hotel_user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        if (user?.hotel_slug && user.hotel_slug !== 'undefined') {
          router.replace(`/${user.hotel_slug}`);
          return;
        }
      } catch (e) {}
    }

    // 2. Mặc định chuyển hướng về khách sạn 'default'
    router.replace('/default');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full"></div>
    </div>
  );
}
