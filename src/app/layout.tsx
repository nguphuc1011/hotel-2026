import React from 'react';
import { Toaster } from 'sonner';
import { GlobalDialogProvider } from '@/providers/GlobalDialogProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import AppShell from '@/components/layout/AppShell';
import "./globals.css";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MANA PMS - Quản lý khách sạn',
  description: 'Hệ thống quản lý khách sạn chuyên nghiệp',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MANA PMS',
  },
  formatDetection: {
    telephone: false,
  },
};

// Component đăng ký Service Worker (Client-side)
import { PWAServiceWorker } from './pwa-sw';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased bg-system text-main overflow-hidden h-screen flex">
        <PWAServiceWorker />
        <AuthProvider>
          <GlobalDialogProvider>
            <AppShell>
              {children}
            </AppShell>
            
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
        </AuthProvider>
      </body>
    </html>
  );
}
