import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';

// Hàm hỗ trợ parse config an toàn
const getSafeConfig = () => {
  const configRaw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!configRaw) return {};

  try {
    // Thử parse JSON chuẩn
    return JSON.parse(configRaw);
  } catch {
    try {
      // Nếu dán kiểu JS object (thiếu ngoặc kép ở key), thử bọc lại và parse
      // Lưu ý: Đây là giải pháp tình thế, tốt nhất vẫn là JSON chuẩn
      const formatted = configRaw.trim().startsWith('{') ? configRaw : `{${configRaw}}`;
      // Sử dụng Function thay vì eval để an toàn hơn một chút và tránh lỗi linter

      return new Function(`return ${formatted}`)();
    } catch {
      return {};
    }
  }
};

let app: FirebaseApp | null = null;
let messaging: Messaging | undefined = undefined;

// Chỉ khởi tạo trên trình duyệt để tránh lỗi Prerender/SSR
if (typeof window !== 'undefined') {
  const firebaseConfig = getSafeConfig();

  if (Object.keys(firebaseConfig).length > 0) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

    try {
      messaging = getMessaging(app);

      // Đăng ký Service Worker
      if ('serviceWorker' in navigator) {
        const configString = encodeURIComponent(JSON.stringify(firebaseConfig));
        navigator.serviceWorker
          .register(`/firebase-messaging-sw.js?config=${configString}`)
          .then(() => {
            // SW registered
          })
          .catch(() => {
            // SW registration failed
          });
      }
    } catch {
      // Messaging có thể không hỗ trợ trên một số trình duyệt
    }
  }
}

export const requestForToken = async () => {
  if (typeof window === 'undefined' || !messaging) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const currentToken = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      });
      return currentToken || null;
    }
    return null;
  } catch {
    return null;
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    if (typeof window === 'undefined' || !messaging) return;
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });

export { app, messaging };
