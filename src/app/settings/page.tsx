'use client';

import {
  Settings,
  Hotel,
  Users,
  UserCircle,
  BarChart3,
  Package,
  Wallet,
  ShieldAlert,
  LogOut,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useNotification } from '@/context/NotificationContext';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const router = useRouter();
  const { showNotification } = useNotification();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      showNotification('Đã đăng xuất thành công', 'info');
      router.push('/login');
      router.refresh();
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Logout error:', err);
      showNotification('Lỗi khi đăng xuất', 'error');
    }
  };

  const menuItems = [
    {
      id: 'profile',
      title: 'Hồ sơ cá nhân',
      description: 'Thông tin của Bệ Hạ & Đổi mật khẩu',
      icon: User,
      color: 'text-indigo-500',
      bg: 'bg-indigo-50',
      href: '/settings/profile',
    },
    {
      id: 'general',
      title: 'Cài đặt chung',
      description: 'Quy định giờ, Thuế, Phụ thu & AI',
      icon: Settings,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
      href: '/settings/general',
    },
    {
      id: 'rooms',
      title: 'Quản lý Phòng',
      description: 'Cấu hình danh sách phòng & giá',
      icon: Hotel,
      color: 'text-purple-500',
      bg: 'bg-purple-50',
      href: '/settings/rooms',
    },
    {
      id: 'services',
      title: 'Danh mục Dịch vụ',
      description: 'Thiết lập danh sách mặt hàng & đơn giá',
      icon: Package,
      color: 'text-orange-500',
      bg: 'bg-orange-50',
      href: '/settings/services',
    },
    {
      id: 'finance',
      title: 'Cấu hình Thu Chi',
      description: 'Quản lý danh mục & thiết lập tài chính',
      icon: Wallet,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50',
      href: '/settings/finance',
    },
    {
      id: 'staff',
      title: 'Nhân viên',
      description: 'Quản lý tài khoản & phân quyền',
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
      href: '/settings/staff',
    },
    {
      id: 'customers',
      title: 'Khách hàng',
      description: 'Quản lý danh sách & lịch sử khách',
      icon: UserCircle,
      color: 'text-rose-500',
      bg: 'bg-rose-50',
      href: '/settings/customers',
    },
  ];

  return (
    <RoleGuard allowedRoles={['admin', 'manager']}>
      <div className="min-h-screen bg-slate-50/50 p-6 lg:p-10 pb-32">
        <div className="max-w-4xl mx-auto space-y-10">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Cài đặt hệ thống</h1>
            <p className="text-slate-500 font-bold text-sm">Quản lý toàn bộ thông số vận hành</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {menuItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="group flex items-start gap-5 p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all duration-300"
              >
                <div className={cn("p-4 rounded-2xl shrink-0 transition-colors", item.bg, item.color)}>
                  <item.icon size={24} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-slate-900 group-hover:text-blue-600 transition-colors uppercase tracking-tight">
                    {item.title}
                  </h3>
                  <p className="text-slate-400 text-xs font-bold leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {/* Logout Section */}
          <div className="pt-10 border-t border-slate-200">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-3 p-6 bg-rose-50 text-rose-600 rounded-[2rem] font-black uppercase tracking-widest hover:bg-rose-100 transition-all"
            >
              <LogOut size={20} />
              Đăng xuất ngay
            </button>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
