'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, CheckCircle, Info, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Types ---

type DialogType = 'alert' | 'confirm' | 'success' | 'error' | 'info';

interface DialogOptions {
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: DialogType;
  destructive?: boolean; // For red delete buttons
}

interface GlobalDialogContextType {
  confirm: (options: DialogOptions | string) => Promise<boolean>;
  alert: (options: DialogOptions | string) => Promise<void>;
}

const GlobalDialogContext = createContext<GlobalDialogContextType | undefined>(undefined);

export const useGlobalDialog = () => {
  const context = useContext(GlobalDialogContext);
  if (!context) {
    throw new Error('useGlobalDialog must be used within a GlobalDialogProvider');
  }
  return context;
};

// --- Component ---

export function GlobalDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<DialogOptions>({ message: '' });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  // Focus trap could be added here, but keeping it simple for now

  const confirm = useCallback((options: DialogOptions | string) => {
    return new Promise<boolean>((resolve) => {
      const opts = typeof options === 'string' ? { message: options, type: 'confirm' as const } : { type: 'confirm' as const, ...options };
      setConfig(opts);
      resolveRef.current = resolve;
      setIsOpen(true);
    });
  }, []);

  const alert = useCallback((options: DialogOptions | string) => {
    return new Promise<void>((resolve) => {
      const opts = typeof options === 'string' ? { message: options, type: 'alert' as const } : { type: 'alert' as const, ...options };
      setConfig(opts);
      resolveRef.current = () => resolve();
      setIsOpen(true);
    });
  }, []);

  const handleClose = (result: boolean) => {
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(result);
      resolveRef.current = null;
    }
  };

  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <GlobalDialogContext.Provider value={{ confirm, alert }}>
      {children}
      {isOpen && <DialogOverlay config={config} onClose={handleClose} />}
    </GlobalDialogContext.Provider>
  );
}

function DialogOverlay({ config, onClose }: { config: DialogOptions; onClose: (result: boolean) => void }) {
  // Determine icon and color based on type
  const getIcon = () => {
    switch (config.type) {
      case 'error': return <AlertTriangle className="text-red-500" size={32} />;
      case 'success': return <CheckCircle className="text-green-500" size={32} />;
      case 'info': return <Info className="text-blue-500" size={32} />;
      case 'confirm': return <HelpCircle className="text-blue-500" size={32} />; // Or HelpCircle
      default: return <Info className="text-slate-500" size={32} />;
    }
  };

  const isConfirm = config.type === 'confirm';
  const destructive = config.destructive || config.type === 'error';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity" 
        onClick={() => isConfirm ? onClose(false) : onClose(true)} 
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100 animate-scale-in border border-slate-100">
        
        {/* Header decoration */}
        <div className={cn("h-2 w-full", 
          config.type === 'error' || destructive ? "bg-red-500" : 
          config.type === 'success' ? "bg-green-500" :
          config.type === 'info' ? "bg-blue-500" :
          "bg-slate-800"
        )} />

        <div className="p-6">
          <div className="flex gap-4">
            <div className={cn("flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center", 
               config.type === 'error' || destructive ? "bg-red-50" : 
               config.type === 'success' ? "bg-green-50" :
               config.type === 'info' ? "bg-blue-50" :
               "bg-slate-50"
            )}>
              {getIcon()}
            </div>
            
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                {config.title || (
                  config.type === 'error' ? 'Lỗi' : 
                  config.type === 'success' ? 'Thành công' : 
                  config.type === 'confirm' ? 'Xác nhận' : 
                  'Thông báo'
                )}
              </h3>
              <div className="text-slate-600 leading-relaxed text-sm">
                {config.message}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
          {isConfirm && (
            <button
              onClick={() => onClose(false)}
              className="px-4 py-2.5 rounded-xl text-slate-600 font-semibold text-sm hover:bg-white hover:shadow-sm hover:text-slate-900 transition-all border border-transparent hover:border-slate-200"
            >
              {config.cancelLabel || 'Hủy bỏ'}
            </button>
          )}
          
          <button
            onClick={() => onClose(true)}
            className={cn(
              "px-6 py-2.5 rounded-xl text-white font-bold text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all active:translate-y-0",
              destructive
                ? "bg-red-500 hover:bg-red-600 shadow-red-500/30"
                : config.type === 'success' 
                  ? "bg-green-600 hover:bg-green-700 shadow-green-600/30"
                  : "bg-slate-900 hover:bg-slate-800 shadow-slate-900/30"
            )}
          >
            {config.confirmLabel || (isConfirm ? 'Đồng ý' : 'Đóng')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
