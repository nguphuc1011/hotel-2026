'use client';

import { 
  LayoutDashboard, 
  ClipboardList, 
  Settings as SettingsIcon,
  LogOut,
  Users
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Toaster } from 'sonner';
import { GlobalDialogProvider } from '@/providers/GlobalDialogProvider';
import { cn } from '@/lib/utils';
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  const navItems = [
    { icon: <LayoutDashboard size={20} />, label: 'Sơ đồ', href: '/' },
    { icon: <ClipboardList size={20} />, label: 'Báo cáo', href: '/reports' },
    { icon: <SettingsIcon size={20} />, label: 'Cài Đặt - Quản lý', href: '/settings' },
  ];

  return (
    <html lang="vi">
      <body className="antialiased bg-system text-main overflow-hidden h-screen flex">
        <GlobalDialogProvider>
        
        {/* PC Sidebar - Airy Glassmorphism */}
        <aside className="hidden md:flex flex-col w-72 h-screen glass border-r border-white/40 z-50">
          <div className="p-10">
            <h1 className="text-2xl font-black-italic tracking-tighter flex items-center gap-2">
              1HOTEL <span className="text-[10px] bg-accent text-white px-2 py-0.5 rounded-full not-italic tracking-normal">V2</span>
            </h1>
          </div>
          
          <nav className="flex-1 px-6 space-y-2">
            {navItems.map((item) => (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-500 font-bold text-[15px]",
                  pathname === item.href 
                    ? "bg-accent text-white shadow-xl shadow-accent/20 scale-[1.02]" 
                    : "text-muted hover:bg-accent/5 hover:text-accent"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="p-8 border-t border-white/20">
            <button className="flex items-center gap-3 px-4 py-3 w-full text-muted font-bold text-[14px] hover:text-red-500 transition-colors">
              <LogOut size={18} />
              Đăng xuất
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 h-full overflow-auto relative no-scrollbar bg-white/40 pb-[max(8rem,env(safe-area-inset-bottom))] md:pb-0">
          <div className="animate-fade-in">
            {children}
          </div>
        </main>

        {/* Contrast Overlay under Mobile Nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-black/12 via-black/6 to-transparent pointer-events-none z-40" />

        {/* Mobile Bottom Nav - Updated Glassmorphism */}
        <nav className="md:hidden fixed bottom-6 left-4 right-4 h-20 bg-white/90 backdrop-blur-3xl border border-slate-300/80 rounded-[40px] shadow-[0_30px_70px_-10px_rgba(0,0,0,0.3)] z-50 flex justify-around items-center px-6 ring-1 ring-white/50 inset">
          {navItems.map((item) => (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 transition-all duration-500",
                pathname === item.href ? "text-accent scale-110" : "text-muted"
              )}
            >
              <div className={cn(
                "p-2.5 rounded-2xl transition-all",
                pathname === item.href ? "bg-accent text-white shadow-lg shadow-accent/20" : "bg-transparent"
              )}>
                {item.icon}
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span>
            </Link>
          ))}
        </nav>
        
        <Toaster position="top-right" richColors toastOptions={{
          style: {
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
            borderRadius: '16px',
            fontFamily: 'inherit',
          }
        }} />
        </GlobalDialogProvider>
      </body>
    </html>
  );
}
