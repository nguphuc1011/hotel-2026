'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '@/context/NotificationContext';
import { CheckCircle2, AlertCircle, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NotificationBanner() {
  const { notification, hideNotification } = useNotification();

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ y: -50, x: '-50%', opacity: 0 }}
          animate={{ y: 0, x: '-50%', opacity: 1 }}
          exit={{ y: -50, x: '-50%', opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          className="fixed top-6 left-1/2 z-[10001] w-[60%] min-w-[280px] pointer-events-none"
        >
          <div 
            onClick={hideNotification}
            className={cn(
              "pointer-events-auto cursor-pointer",
              "px-6 py-4 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.2)] flex items-center gap-4",
              "bg-white/80 backdrop-blur-2xl border-2",
              "scale-105 transition-transform active:scale-95",
              notification.type === 'success' && "border-emerald-400/50 text-emerald-900 shadow-emerald-500/20",
              notification.type === 'error' && "border-rose-400/50 text-rose-900 shadow-rose-500/20",
              notification.type === 'warning' && "border-amber-400/50 text-amber-900 shadow-amber-500/20",
              notification.type === 'info' && "border-blue-400/50 text-blue-900 shadow-blue-500/20",
            )}
          >
            <div className={cn(
              "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
              notification.type === 'success' && "bg-emerald-100",
              notification.type === 'error' && "bg-rose-100",
              notification.type === 'warning' && "bg-amber-100",
              notification.type === 'info' && "bg-blue-100",
            )}>
              {notification.type === 'success' && <CheckCircle2 size={22} className="text-emerald-600" />}
              {notification.type === 'error' && <XCircle size={22} className="text-rose-600" />}
              {notification.type === 'warning' && <AlertCircle size={22} className="text-amber-600" />}
              {notification.type === 'info' && <Info size={22} className="text-blue-600" />}
            </div>
            
            <p className="flex-1 text-[14px] font-black leading-tight tracking-tight">
              {notification.message}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
