import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

import Link from "next/link";

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
      <body className={cn(inter.className, "min-h-screen selection:bg-blue-500/30")}>
        <div className="flex h-screen flex-col overflow-hidden">
          {/* Header - Glassmorphism */}
          <header className="glass sticky top-0 z-50 flex h-16 items-center justify-between px-4 sm:px-6 shadow-sm">
            <Link href="/" className="flex items-center gap-2 flex-shrink-0 min-w-0 cursor-pointer">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg flex-shrink-0" />
              <span className="text-lg sm:text-xl font-semibold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px] sm:max-w-none">
                Hotel<span className="opacity-50">2026</span>
              </span>
            </Link>
            <nav className="flex gap-3 sm:gap-6 text-xs sm:text-sm font-medium text-zinc-500 overflow-x-auto no-scrollbar">
              <Link href="/" className="text-zinc-900 transition hover:text-blue-600 whitespace-nowrap">Dashboard</Link>
              <Link href="#" className="transition hover:text-blue-600 whitespace-nowrap">Dịch vụ</Link>
              <Link href="#" className="transition hover:text-blue-600 whitespace-nowrap">Báo cáo</Link>
              <Link href="/settings" className="transition hover:text-blue-600 whitespace-nowrap">Cài đặt</Link>
            </nav>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-10">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
