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
    <nav className="fixed bottom-0 left-0 right-0 z-[100] flex items-center bg-white/70 backdrop-blur-xl border-t border-white/40 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      {navLinks.map((link) => {
        const isActive = pathname.startsWith(link.href) && link.href !== '/' || pathname === link.href;
        const Icon = link.icon;
        
        return (
          <Link
            key={link.href}
            href={link.href}
            className="flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-1"
          >
            <div className={cn(
              "p-2 rounded-xl transition-all duration-300",
              isActive && link.href === '/' ? "bg-white/40 backdrop-blur-md shadow-sm ring-1 ring-white/50" : 
              isActive ? "bg-blue-50/50 text-blue-600 backdrop-blur-sm" : "text-slate-500"
            )}>

              <Icon className={cn(
                'h-6 w-6 transition-colors',
                isActive && link.href === '/' ? 'text-black fill-black/10' : ''
              )} />
            </div>
            <span className={cn(
              'text-[10px] font-bold uppercase tracking-tight transition-colors',
              isActive && link.href === '/' ? 'text-black font-black' :
              isActive ? 'text-blue-600 font-black' : 'text-slate-400'
            )}>
              {link.href === '/' ? 'Sơ đồ' : link.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}


