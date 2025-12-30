import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';

// PHIÊN BẢN BẤT BIẾN: Hỗ trợ linh hoạt mọi phương thức cấu hình
const getFirebaseConfig = () => {
  // Ưu tiên 1: Các biến môi trường rời rạc (Chuẩn nhất, tránh lỗi JSON)
  const individualConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  if (individualConfig.apiKey && individualConfig.appId) {
    return individualConfig;
  }

  // Ưu tiên 2: Biến JSON tổng hợp (Nếu Bệ Hạ đã dán cả cục)
  const configRaw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (configRaw) {
    try {
      return JSON.parse(configRaw);
    } catch {
      try {
        const formatted = configRaw.trim().startsWith('{') ? configRaw : `{${configRaw}}`;

        return new Function(`return ${formatted}`)();
      } catch {
        return {};
      }
    }
  }

  return {};
};

let app: FirebaseApp | null = null;
let messaging: Messaging | undefined = undefined;

// Chỉ khởi tạo trên Client
if (typeof window !== 'undefined') {
  const config = getFirebaseConfig();

  if (config && (config as any).apiKey) {
    app = getApps().length > 0 ? getApp() : initializeApp(config);

    try {
      // Kiểm tra trình duyệt có hỗ trợ Messaging không
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        messaging = getMessaging(app);

        // Đăng ký Service Worker
        const configString = encodeURIComponent(JSON.stringify(config));
        navigator.serviceWorker
          .register(`/firebase-messaging-sw.js?config=${configString}`)
          .then(() => {
            /* Mắt Thần đã gác cửa */
          })
          .catch(() => {
            /* Lỗi tuần tra */
          });
      }
    } catch {
      // Trình duyệt không hỗ trợ hoặc lỗi khởi tạo
    }
  }
}

export const requestForToken = async () => {
  if (typeof window === 'undefined') return null;

  if (!messaging) {
    // eslint-disable-next-line no-console
    console.warn('Firebase Messaging chưa được khởi tạo. Kiểm tra Firebase Config.');
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey) {
        // eslint-disable-next-line no-console
        console.error('Thiếu NEXT_PUBLIC_FIREBASE_VAPID_KEY!');
      }
      const currentToken = await getToken(messaging, {
        vapidKey: vapidKey,
      });
      return currentToken || null;
    }
    return null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Lỗi lấy Token:', error);
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
