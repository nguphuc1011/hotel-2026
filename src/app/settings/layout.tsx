'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Cog, Bed, ShoppingBasket, Users, BookUser, BarChart3, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Tổng quan', href: '/settings', icon: Cog },
  { name: 'Cài đặt chung', href: '/settings/general', icon: Cog },
  { name: 'Quản lý Phòng', href: '/settings/rooms', icon: Bed },
  { name: 'Quản lý Dịch vụ', href: '/settings/services', icon: ShoppingBasket },
  { name: 'Nhân viên', href: '/settings/staff', icon: Users },
  { name: 'Khách hàng', href: '/settings/customers', icon: BookUser },
  { name: 'Báo cáo', href: '/settings/reports', icon: BarChart3 },
  { name: 'Thu Chi', href: '/settings/finance', icon: Wallet },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isRootSettings = pathname === '/settings';



  return (
    <div className="flex flex-col md:flex-row md:gap-8 h-full">
      {/* --- Sidebar Navigation (Desktop) --- */}
      <aside className="hidden md:block w-64 flex-shrink-0">
        <nav className="flex flex-col space-y-1 sticky top-24">
          <h2 className="px-4 pt-2 pb-3 text-lg font-bold text-slate-800">Quản Trị</h2>
          {navigation.map((item) => {
            if (item.href === '/settings') return null;
            
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold',
                  isActive
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-600 hover:bg-slate-200/60'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* --- Main Content --- */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
