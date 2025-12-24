import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

import Link from "next/link";


import { Toaster } from 'sonner';
import { BottomNav } from "@/components/layout/BottomNav";

const inter = Inter({ subsets: ["latin", "vietnamese"] });




export const metadata: Metadata = {
  title: "Hotel 2026",
  description: "Quản lý khách sạn đơn giản và hiệu quả",
  applicationName: "Hotel 2026",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Hotel 2026",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.json",
  icons: {
    apple: "https://cdn-icons-png.flaticon.com/512/2983/2983803.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
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
        {/* <Header /> */}

        {/* Main Content */}
        <main className="flex-1 pb-24 px-4 max-w-md mx-auto w-full">
          {children}
        </main>

        <BottomNav />
      </body>



    </html>
  );
}

