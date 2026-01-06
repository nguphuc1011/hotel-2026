try {
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');
} catch (e) {
  console.error('[firebase-messaging-sw.js] Lỗi khi tải script Firebase:', e);
}

// Tự động lấy config từ URL nếu có
const urlParams = new URLSearchParams(location.search);
const configParam = urlParams.get('config');

// CẤU HÌNH DỰ PHÒNG
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
    const decoded = decodeURIComponent(configParam);
    const dynamicConfig = JSON.parse(decoded);
    if (dynamicConfig && dynamicConfig.apiKey) {
      firebaseConfig = dynamicConfig;
    }
  } catch (e) {
    console.error('[firebase-messaging-sw.js] Lỗi khi giải mã Firebase config:', e);
  }
}

// Khởi tạo Firebase nếu scripts đã được tải thành công
if (typeof firebase !== 'undefined' && firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Sử dụng setBackgroundMessageHandler cho compat version hoặc onBackgroundMessage nếu có
  const handleBackgroundMessage = (payload) => {
    console.log('[firebase-messaging-sw.js] Nhận thông báo trong nền:', payload);
    
    const title = payload.data?.title || payload.notification?.title || 'Thông báo mới';
    const body = payload.data?.body || payload.notification?.body || 'Bạn có thông báo mới từ hệ thống';
    const tag = payload.data?.tag || payload.notification?.tag || 'default-tag';
    const icon = payload.data?.icon || '/favicon.ico';
    
    const notificationOptions = {
      body: body,
      icon: icon,
      tag: tag,
      renotify: true,
      data: payload.data
    };

    return self.registration.showNotification(title, notificationOptions);
  };

  if (messaging.setBackgroundMessageHandler) {
    messaging.setBackgroundMessageHandler(handleBackgroundMessage);
  } else if (messaging.onBackgroundMessage) {
    messaging.onBackgroundMessage(handleBackgroundMessage);
  }
} else {
  console.warn('[firebase-messaging-sw.js] Firebase chưa được định nghĩa hoặc thiếu cấu hình.');
}
