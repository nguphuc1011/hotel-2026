'use client';

import { useEffect } from 'react';

// Ghi nhớ sự kiện cài đặt vào một biến global để AppShell có thể lấy bất cứ lúc nào
if (typeof window !== 'undefined') {
  (window as any).deferredPWAInstallPrompt = null;
}

export function PWAServiceWorker() {
  useEffect(() => {
    // 1. Đăng ký Service Worker
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      (window.location.protocol === 'https:' || window.location.hostname === 'localhost')
    ) {
      const registerSW = () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('🚀 MANA PMS PWA: Sẵn sàng!', registration.scope);
          })
          .catch((err) => console.error('❌ PWA Error:', err));
      };

      if (document.readyState === 'complete') {
        registerSW();
      } else {
        window.addEventListener('load', registerSW);
      }
    }

    // 2. Bắt sự kiện 'beforeinstallprompt'
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      // Lưu vào biến global
      (window as any).deferredPWAInstallPrompt = e;
      // Thông báo cho các component khác
      window.dispatchEvent(new CustomEvent('pwa-install-available'));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  return null;
}
