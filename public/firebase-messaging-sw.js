importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Tự động lấy config từ URL nếu có (truyền qua query param khi register)
const urlParams = new URLSearchParams(location.search);
const configParam = urlParams.get('config');

// CẤU HÌNH DỰ PHÒNG (Hardcoded cho Vercel)
const hardcodedConfig = {
  apiKey: "AIzaSyAKzIBtkOuAFUCTw2GR1KxX8rzVNcJzT1g",
  authDomain: "thaoai.firebaseapp.com",
  projectId: "thaoai",
  storageBucket: "thaoai.firebasestorage.app",
  messagingSenderId: "401527129236",
  appId: "1:401527129236:web:395efdd0a4c8291d5fa081"
};

let firebaseConfig = hardcodedConfig; 
if (configParam) {
  try {
    const dynamicConfig = JSON.parse(decodeURIComponent(configParam));
    if (dynamicConfig && dynamicConfig.apiKey) {
      firebaseConfig = dynamicConfig;
    }
  } catch (e) {
    console.error('Lỗi khi giải mã Firebase config trong Service Worker:', e);
  }
}

// Nếu không có config từ URL, hy vọng là nó đã được cache hoặc có cách khác
// Ở môi trường production, chúng ta nên đảm bảo config này chính xác
if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Nhận thông báo trong nền:', payload);
    
    const notificationTitle = payload.notification?.title || 'MẮT THẦN HÀNH QUÂN';
    const notificationOptions = {
      body: payload.notification?.body || 'Báo cáo Bệ Hạ, hỏa tiễn đã nổ!',
      icon: '/favicon.ico',
      tag: 'eye-of-god-alert',
      renotify: true,
      data: payload.data
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
  });
} else {
  console.warn('[firebase-messaging-sw.js] Không tìm thấy cấu hình Firebase. Thông báo nền có thể không hoạt động.');
}
