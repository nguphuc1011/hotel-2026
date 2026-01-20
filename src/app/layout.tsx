'use client';

import React from 'react';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Settings as SettingsIcon,
  LogOut,
  Users,
  Wallet
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
    { icon: <LayoutDashboard size={24} />, label: 'Sơ đồ', href: '/' },
    { icon: <Wallet size={24} />, label: 'Thu Chi', href: '/cash-flow' },
    { icon: <ClipboardList size={24} />, label: 'Báo cáo', href: '/reports' },
    { icon: <SettingsIcon size={24} />, label: 'Cài đặt', href: '/settings' },
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

        {/* Contrast Overlay under Mobile Nav - Subtle Blur Gradient */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white/90 via-white/50 to-transparent pointer-events-none z-40" />

        {/* Mobile Bottom Nav - Curved Cutout with Floating Center Button */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-24 pointer-events-none flex flex-col justify-end">
          
          {/* Main Bar Background with SVG Curve */}
          <div className="relative w-full h-[70px] pointer-events-auto flex items-end justify-between px-4 pb-2">
            
            {/* Background Layer using SVG for smooth curve */}
            <div className="absolute inset-0 flex items-end drop-shadow-[0_-15px_25px_rgba(0,0,0,0.15)] -z-10">
              <div className="flex-1 h-full bg-white rounded-tl-[24px]" />
              <svg width="170" height="70" viewBox="0 0 170 70" fill="none" xmlns="http://www.w3.org/2000/svg" className="block shrink-0">
                <path d="M 0 0 H 35 Q 45 0 45 10 A 40 40 0 0 0 125 10 Q 125 0 135 0 H 170 V 70 H 0 Z" fill="white"/>
              </svg>
              <div className="flex-1 h-full bg-white rounded-tr-[24px]" />
            </div>

            {/* Left Items */}
            <div className="flex-1 flex justify-evenly items-center h-full pb-1">
              <Link 
                href={navItems[1].href}
                className="flex flex-col items-center justify-center active:scale-95 transition-transform"
              >
                <div className={cn(
                  "p-2 rounded-2xl transition-all duration-300",
                  pathname === navItems[1].href ? "text-[#007AFF]" : "text-slate-400"
                )}>
                  {React.cloneElement(navItems[1].icon as any, { 
                    size: 24,
                    strokeWidth: pathname === navItems[1].href ? 2.5 : 2 
                  })}
                </div>
                <span className={cn(
                  "text-[10px] font-bold transition-colors duration-300",
                  pathname === navItems[1].href ? "text-[#007AFF]" : "text-slate-400"
                )}>
                  {navItems[1].label}
                </span>
              </Link>

              <Link 
                href={navItems[2].href}
                className="flex flex-col items-center justify-center active:scale-95 transition-transform"
              >
                <div className={cn(
                  "p-2 rounded-2xl transition-all duration-300",
                  pathname === navItems[2].href ? "text-[#007AFF]" : "text-slate-400"
                )}>
                  {React.cloneElement(navItems[2].icon as any, { 
                    size: 24,
                    strokeWidth: pathname === navItems[2].href ? 2.5 : 2 
                  })}
                </div>
                <span className={cn(
                  "text-[10px] font-bold transition-colors duration-300",
                  pathname === navItems[2].href ? "text-[#007AFF]" : "text-slate-400"
                )}>
                  {navItems[2].label}
                </span>
              </Link>
            </div>

            {/* Spacer for Center Button */}
            <div className="w-20" /> 

            {/* Right Items */}
            <div className="flex-1 flex justify-evenly items-center h-full pb-1">
              <Link 
                href={navItems[3].href}
                className="flex flex-col items-center justify-center active:scale-95 transition-transform"
              >
                <div className={cn(
                  "p-2 rounded-2xl transition-all duration-300",
                  pathname === navItems[3].href ? "text-[#007AFF]" : "text-slate-400"
                )}>
                  {React.cloneElement(navItems[3].icon as any, { 
                    size: 24,
                    strokeWidth: pathname === navItems[3].href ? 2.5 : 2 
                  })}
                </div>
                <span className={cn(
                  "text-[10px] font-bold transition-colors duration-300",
                  pathname === navItems[3].href ? "text-[#007AFF]" : "text-slate-400"
                )}>
                  {navItems[3].label}
                </span>
              </Link>

              {/* Placeholder for symmetry or future item */}
              <div className="w-12 opacity-0 pointer-events-none" />
            </div>
          </div>

          {/* Center Floating Button (Sơ đồ) - Positioned in the cutout */}
          <div className="absolute bottom-[25px] left-1/2 -translate-x-1/2 pointer-events-auto">
             <Link 
               href={navItems[0].href}
               className={cn(
                 "flex items-center justify-center w-[64px] h-[64px] rounded-full shadow-[0_8px_20px_rgba(0,122,255,0.3)] transition-all duration-300 active:scale-95 group",
                 pathname === navItems[0].href 
                   ? "bg-[#007AFF] text-white" 
                   : "bg-white text-slate-400 border border-slate-100"
               )}
             >
               {React.cloneElement(navItems[0].icon as any, { 
                  size: 28,
                  strokeWidth: 2.5,
                  className: "group-hover:scale-110 transition-transform"
               })}
             </Link>
          </div>
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
