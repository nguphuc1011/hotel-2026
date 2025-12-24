import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

import Link from "next/link";


import { LayoutGrid, BarChart, Cog, UserCircle } from 'lucide-react';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: "Hotel Manager 2026",
  description: "High-end Hotel Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" data-theme="light" className="light">
      <body className={cn(inter.className, "min-h-screen bg-slate-50 selection:bg-blue-500/30 flex flex-col")}>
        <Toaster position="top-center" richColors />
        {/* Normal Header (Not Fixed) */}
        <header className="w-full h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 flex-shrink-0">
          <Link href="/" className="font-bold text-lg text-slate-800">
            Hotel 2026
          </Link>
          <button className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center">
            <UserCircle className="h-6 w-6 text-slate-500" />
          </button>
        </header>

        {/* Main Content */}
        <main className="flex-1 pb-24 px-4 max-w-md mx-auto w-full">
          {children}
        </main>

        {/* Custom Curved Bottom Nav (Apple Style) */}
        <nav className="fixed bottom-0 left-0 right-0 z-[100] h-20 pb-safe overflow-visible pointer-events-none">
          {/* SVG Background with Center Notch */}
          <div className="absolute inset-x-0 bottom-0 h-[72px] pointer-events-auto">
            <svg 
              viewBox="0 0 400 72" 
              className="absolute bottom-0 h-full w-full fill-white drop-shadow-[0_-15px_30px_rgba(0,0,0,0.06)]"
              preserveAspectRatio="none"
            >
              <path d="M0 24C0 10.7452 10.7452 0 24 0H145C155 0 160 5 165 15C172 35 185 45 200 45C215 45 228 35 235 15C240 5 245 0 255 0H376C389.255 0 400 10.7452 400 24V72H0V24Z" />
            </svg>

            {/* Content Container */}
            <div className="relative flex h-full items-center px-4 pt-2">
              {/* Left Side Items */}
              <div className="flex flex-1 items-center justify-around pr-16">
                <Link href="/reports" className="flex flex-col items-center justify-center gap-1 group">
                  <BarChart className="h-6 w-6 text-slate-600 group-hover:text-slate-900 transition-colors" />
                  <span className="text-[10px] font-bold text-slate-500 group-hover:text-slate-800 uppercase tracking-tighter">Báo cáo</span>
                </Link>
              </div>
              
              {/* Floating Button (Centered in Notch) */}
              <div className="absolute left-1/2 -translate-x-1/2 -top-5">
                <Link 
                  href="/" 
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-white shadow-[0_8px_20px_rgba(0,0,0,0.25)] active:scale-95 transition-all duration-300"
                >
                  <LayoutGrid className="h-7 w-7" />
                </Link>
              </div>

              {/* Right Side Items */}
              <div className="flex flex-1 items-center justify-around pl-16">
                <Link href="/settings" className="flex flex-col items-center justify-center gap-1 group">
                  <Cog className="h-6 w-6 text-slate-600 group-hover:text-slate-900 transition-colors" />
                  <span className="text-[10px] font-bold text-slate-500 group-hover:text-slate-800 uppercase tracking-tighter">Cài đặt</span>
                </Link>
              </div>
            </div>
          </div>
        </nav>
      </body>
    </html>
  );
}

