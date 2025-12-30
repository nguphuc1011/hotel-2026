import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

let firebaseConfig = {};
try {
  const configRaw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (configRaw) {
    // Nếu chuỗi không bắt đầu bằng '{', có thể Bệ Hạ đã dán thiếu dấu ngoặc
    const formattedConfig = configRaw.trim().startsWith('{') ? configRaw : `{${configRaw}}`;
    // Thử parse JSON, nếu thất bại (do thiếu dấu ngoặc kép ở key), chúng ta sẽ báo lỗi êm dịu hơn
    firebaseConfig = JSON.parse(formattedConfig);
  }
} catch {
  // Trong quá trình build, nếu config chưa có hoặc sai định dạng, ta bỏ qua để không làm gãy build
  if (process.env.NODE_ENV === 'production') {
    // Chỉ log cảnh báo, không làm crash ứng dụng
  }
}

const app =
  getApps().length > 0
    ? getApp()
    : Object.keys(firebaseConfig).length > 0
      ? initializeApp(firebaseConfig)
      : null;
const messaging = typeof window !== 'undefined' && app ? getMessaging(app) : undefined;

if (typeof window !== 'undefined' && app) {
  // Đăng ký Service Worker với config được truyền qua query parameter
  if ('serviceWorker' in navigator && Object.keys(firebaseConfig).length > 0) {
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
}

export const requestForToken = async () => {
  if (!messaging) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const currentToken = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      });
      if (currentToken) {
        return currentToken;
      } else {
        return null;
      }
    }
  } catch {
    return null;
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    if (!messaging) return;
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });

export { app, messaging };
