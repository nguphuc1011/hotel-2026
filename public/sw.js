// 🚀 MANA PMS Service Worker v2
// Quản lý cache và hỗ trợ cài đặt PWA trên máy tính và điện thoại

const CACHE_NAME = 'mana-pms-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

// Cài đặt Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('✅ Đã mở cache MANA PMS PWA');
      for (const asset of ASSETS_TO_CACHE) {
        try {
          await cache.add(asset);
        } catch (e) {
          // Bỏ qua nếu tài nguyên chưa sẵn sàng
        }
      }
    })
  );
});

// Kích hoạt và dọn dẹp cache cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('🧹 Xóa cache PWA cũ:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

// Xử lý các yêu cầu lấy dữ liệu (Fetch)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bỏ qua các yêu cầu không phải GET, API, hoặc Supabase
  if (
    request.method !== 'GET' || 
    !request.url.startsWith(self.location.origin) ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.includes('/api/')
  ) {
    return;
  }

  // Network First cho mọi trang HTML và API
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Khi mất mạng, fallback về Cache
        return caches.match(request).then((cachedResponse) => {
          return cachedResponse || Response.error();
        });
      })
  );
});
