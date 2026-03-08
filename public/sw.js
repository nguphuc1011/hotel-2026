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
  );
});

// Xử lý các yêu cầu lấy dữ liệu (Fetch)
self.addEventListener('fetch', (event) => {
  // Bỏ qua các yêu cầu không phải GET hoặc yêu cầu từ Supabase/API bên ngoài
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Nếu có trong cache thì trả về, không thì đi lấy từ mạng
      return response || fetch(event.request);
    })
  );
});
