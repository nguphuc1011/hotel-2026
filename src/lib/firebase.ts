import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { supabase } from './supabase';

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
      // Làm sạch chuỗi: xóa các phần dư thừa như "const firebaseConfig =" hoặc dấu chấm phẩy
      let cleaned = configRaw.trim();

      // Nếu có dạng "const config = { ... }" hoặc "var config = { ... }"
      if (cleaned.includes('{')) {
        cleaned = cleaned.substring(cleaned.indexOf('{'));
      }
      if (cleaned.includes('}')) {
        cleaned = cleaned.substring(0, cleaned.lastIndexOf('}') + 1);
      }

      // Thử parse JSON chuẩn trước
      try {
        return JSON.parse(cleaned);
      } catch {
        // Nếu parse JSON thất bại (có thể do thiếu ngoặc kép ở key), dùng Function để eval an toàn
        return new Function(`return ${cleaned}`)();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Lỗi khi phân giải Firebase Config:', e);
      return {};
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

        // ĐĂNG KÝ SERVICE WORKER THỦ CÔNG ĐỂ TRUYỀN CONFIG
        const configString = encodeURIComponent(JSON.stringify(config));
        navigator.serviceWorker
          .register(`/firebase-messaging-sw.js?config=${configString}`, {
            scope: '/firebase-cloud-messaging-push-scope', // Đè lên scope mặc định của Firebase
            updateViaCache: 'none',
          })
          .then((registration) => {
            // eslint-disable-next-line no-console
            console.log('Mắt Thần đã gác cửa thành công với cấu hình chuẩn!');
            registration.update(); // Ép cập nhật ngay lập tức
          })
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.error('Lỗi khi triển khai Mắt Thần:', err);
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

      if (currentToken) {
        // TỰ ĐỘNG GỬI TOKEN LÊN SUPABASE
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('user_push_tokens').upsert(
              {
                user_id: user.id,
                token: currentToken,
                device_type: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                  navigator.userAgent
                )
                  ? 'mobile'
                  : 'desktop',
                last_seen: new Date().toISOString(),
              },
              { onConflict: 'token' }
            );
            // eslint-disable-next-line no-console
            console.log('Đã cập nhật Token lên Mật Sổ (Supabase)');
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Lỗi khi lưu Token lên Supabase:', e);
        }
      }

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
