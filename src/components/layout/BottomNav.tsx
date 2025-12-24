'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutGrid, Settings, FileText, Package } from 'lucide-react';

const navLinks = [
  { href: '/', label: 'Dashboard', icon: LayoutGrid },
  { href: '/services', label: 'Dịch vụ', icon: Package },
  { href: '/reports', label: 'Báo cáo', icon: FileText },
  { href: '/settings', label: 'Cài đặt', icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="glass fixed bottom-0 left-0 right-0 z-50 flex items-center border-t border-white/20 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
      {navLinks.map((link) => {
        const isActive = pathname.startsWith(link.href) && link.href !== '/' || pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className="flex flex-col items-center justify-center gap-1 text-xs font-medium text-zinc-500 flex-1 min-w-0 h-full"
          >
            <link.icon className={cn('h-6 w-6', isActive && 'text-blue-600')} />
            <span className={cn('truncate', isActive && 'text-blue-600 font-semibold')}>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
