'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: ('admin' | 'manager' | 'staff')[];
}

export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile) {
      if (!allowedRoles.includes(profile.role)) {
        toast.error('Bệ Hạ chưa ban quyền cho khanh vào địa bàn này!');
        router.push('/');
      }
    }
  }, [profile, loading, allowedRoles, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold animate-pulse">Đang kiểm tra lệnh bài...</p>
        </div>
      </div>
    );
  }

  if (!profile || !allowedRoles.includes(profile.role)) {
    return null;
  }

  return <>{children}</>;
}
