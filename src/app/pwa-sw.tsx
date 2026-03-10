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

    // Fix for releasePointerCapture error in Next.js devtools or Radix UI
    const handlePointerUp = (e: PointerEvent) => {
      try {
        if (e.target instanceof Element && e.pointerId !== undefined) {
          // Check if the pointer is actually being captured before releasing
          if (e.target.hasPointerCapture(e.pointerId)) {
            e.target.releasePointerCapture(e.pointerId);
          }
        }
      } catch (err) {
        // Silently handle the "No active pointer with the given id" error
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pointerup', handlePointerUp, { capture: true });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pointerup', handlePointerUp, { capture: true });
    };
  }, []);

  return null;
}
