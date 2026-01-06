'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface Notification {
  id: string;
  message: string;
  type: NotificationType;
}

interface NotificationContextType {
  notification: Notification | null;
  showNotification: (message: string, type?: NotificationType) => void;
  hideNotification: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<Notification | null>(null);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const hideNotification = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setNotification(null);
  }, []);

  const showNotification = useCallback((message: string, type: NotificationType = 'success') => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const id = Math.random().toString(36).substring(2, 9);
    setNotification({ id, message, type });

    // Tự động ẩn sau 4 giây
    timeoutRef.current = setTimeout(() => {
      setNotification((current) => (current?.id === id ? null : current));
    }, 4000);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ notification, showNotification, hideNotification }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    // Return a dummy context for server-side rendering to avoid ReferenceError
    if (typeof window === 'undefined') {
      return {
        notification: null,
        showNotification: () => {},
        hideNotification: () => {},
      };
    }
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
