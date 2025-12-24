'use client';

import { 
  Settings,
  Hotel,
  Users,
  UserCircle,
  BarChart3,
  Package,
} from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const menuItems = [
    { 
      id: 'general', 
      title: 'Cài đặt chung', 
      description: 'Quy định giờ, Thuế, Phụ thu & AI',
      icon: Settings, 
      color: 'text-blue-500', 
      bg: 'bg-blue-50',
      href: '/settings/general'
    },
    { 
      id: 'rooms', 
      title: 'Quản lý Phòng', 
      description: 'Cấu hình danh sách phòng & giá',
      icon: Hotel, 
      color: 'text-purple-500', 
      bg: 'bg-purple-50',
      href: '/settings/rooms'
    },
    { 
      id: 'services', 
      title: 'Quản lý dịch vụ', 
      description: 'Danh mục dịch vụ & kho hàng',
      icon: Package, 
      color: 'text-orange-500', 
      bg: 'bg-orange-50',
      href: '/settings/services'
    },
    { 
      id: 'staff', 
      title: 'Nhân viên', 
      description: 'Quản lý tài khoản & phân quyền',
      icon: Users, 
      color: 'text-emerald-500', 
      bg: 'bg-emerald-50',
      href: '/settings/staff'
    },
    { 
      id: 'customers', 
      title: 'Khách hàng', 
      description: 'Danh sách & lịch sử khách hàng',
      icon: UserCircle, 
      color: 'text-sky-500', 
      bg: 'bg-sky-50',
      href: '/settings/customers'
    },
    { 
      id: 'reports', 
      title: 'Báo Cáo', 
      description: 'Cấu hình & xem báo cáo doanh thu',
      icon: BarChart3, 
      color: 'text-rose-500', 
      bg: 'bg-rose-50',
      href: '/settings/reports'
    },
  ];

  return (
    <div className="pt-4">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Cài đặt</h1>
        <p className="text-slate-500 text-sm">Quản lý cấu hình hệ thống của bạn</p>
      </header>
      
      <div className="grid grid-cols-2 gap-4 pb-24">
        {menuItems.map((item) => {
          const Content = (
            <div className="flex flex-col items-center justify-center p-6 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 transition-all active:scale-95 hover:shadow-md group h-full relative overflow-hidden">
              <div className={`p-4 rounded-[1.5rem] ${item.bg} mb-3 group-active:scale-110 transition-transform`}>
                <item.icon className={`h-8 w-8 ${item.color}`} />
              </div>
              <span className="text-sm font-bold text-slate-800 text-center leading-tight">{item.title}</span>
              <span className="text-[10px] text-slate-400 text-center mt-2 leading-tight px-2 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
                {item.description}
              </span>
              
              {item.href ? (
                <div className="absolute top-4 right-4">
                  <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                </div>
              ) : (
                <div className="absolute top-4 right-4">
                  <div className="text-[8px] font-black text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100 uppercase tracking-wider">
                    Sắp có
                  </div>
                </div>
              )}
            </div>
          );

          if (item.href) {
            return (
              <Link key={item.id} href={item.href} className="aspect-square">
                {Content}
              </Link>
            );
          }

          return (
            <div
              key={item.id}
              className="w-full aspect-square cursor-not-allowed opacity-80"
            >
              {Content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
