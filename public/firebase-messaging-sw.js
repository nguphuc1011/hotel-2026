importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Tự động lấy config từ URL nếu có (truyền qua query param khi register)
const urlParams = new URLSearchParams(location.search);
const configParam = urlParams.get('config');

let firebaseConfig = {};
if (configParam) {
  try {
    firebaseConfig = JSON.parse(decodeURIComponent(configParam));
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
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
      body: payload.notification.body,
      icon: '/favicon.ico'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} else {
  console.warn('[firebase-messaging-sw.js] Không tìm thấy cấu hình Firebase. Thông báo nền có thể không hoạt động.');
}
