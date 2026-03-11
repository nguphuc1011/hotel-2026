// 🚀 MANA PMS Service Worker
// Dùng để quản lý cache và hỗ trợ chạy mượt mà trên mobile

const CACHE_NAME = 'mana-pms-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/favicon.ico',
  '/manifest.json',
  '/next.svg'
];

// Cài đặt Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Kích hoạt ngay lập tức bản mới
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('✅ Đã mở cache MANA PMS');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Kích hoạt và dọn dẹp cache cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(), // Tiếp quản tất cả các tab ngay lập tức
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('🧹 Xóa cache cũ:', cacheName);
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
  // 1. Chỉ xử lý các yêu cầu GET và cùng domain (self.location.origin)
  // 2. Bỏ qua các yêu cầu _next/static, _next/data (thường gây lỗi khi HMR trong dev mode)
  // 3. Bỏ qua các yêu cầu API/Supabase (đã lọc ở trên bằng startsWith origin)
  
  const { request } = event;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' || 
    !request.url.startsWith(self.location.origin) ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.includes('/api/')
  ) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // Chiến lược: Ưu tiên mạng (Network First) cho các trang HTML/Data, 
      // và Cache First cho các tài nguyên tĩnh (Static Assets)
      
      const isStaticAsset = 
        url.pathname.endsWith('.png') || 
        url.pathname.endsWith('.jpg') || 
        url.pathname.endsWith('.svg') || 
        url.pathname.endsWith('.ico') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.js');

      if (isStaticAsset && cachedResponse) {
        return cachedResponse;
      }

      // Đối với các trang chính, luôn thử lấy từ mạng trước để tránh lỗi "Failed to fetch" do cache cũ
      return fetch(request)
        .then((networkResponse) => {
          // Chỉ cache các phản hồi hợp lệ (200 OK)
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Nếu mạng lỗi, mới trả về từ cache (nếu có)
          console.warn('⚠️ Network failed, falling back to cache for:', url.pathname);
          return cachedResponse || Response.error(); 
        });
    })
  );
});
