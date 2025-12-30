import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';

const firebaseConfig = JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_CONFIG || '{}');

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let messaging: Messaging | undefined;

if (typeof window !== 'undefined') {
  messaging = getMessaging(app);

  // Đăng ký Service Worker với config được truyền qua query parameter
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
