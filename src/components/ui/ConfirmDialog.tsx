'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
  variant?: 'danger' | 'info';
  showInput?: boolean;
  inputPlaceholder?: string;
  inputRequired?: boolean;
  isProcessing?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  onConfirm,
  onCancel,
  variant = 'info',
  showInput = false,
  inputPlaceholder = 'Nhập lý do...',
  inputRequired = false,
  isProcessing = false,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setInputValue('');
      setError(false);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (showInput && inputRequired && !inputValue.trim()) {
      setError(true);
      return;
    }
    onConfirm(inputValue);
  };
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-white p-6 shadow-2xl"
          >
            <div className="flex flex-col items-center text-center">
              <div className={cn(
                "mb-4 flex h-16 w-16 items-center justify-center rounded-2xl",
                variant === 'danger' ? "bg-rose-50 text-rose-500" : "bg-blue-50 text-blue-500"
              )}>
                <AlertCircle size={32} />
              </div>
              
              <h3 className="mb-2 text-xl font-black text-slate-800">{title}</h3>
              <p className="mb-6 text-sm font-medium text-slate-500">{description}</p>
              
              {showInput && (
                <div className="mb-6 w-full">
                  <textarea
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      if (error) setError(false);
                    }}
                    placeholder={inputPlaceholder}
                    className={cn(
                      "w-full min-h-[100px] rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700 outline-none transition-all placeholder:text-slate-300",
                      error ? "ring-2 ring-rose-500" : "focus:ring-2 focus:ring-blue-500"
                    )}
                  />
                  {error && (
                    <p className="mt-2 text-xs font-black text-rose-500 uppercase tracking-widest text-left px-2">
                      Vui lòng nhập lý do
                    </p>
                  )}
                </div>
              )}
              
              <div className="flex w-full gap-3">
                <button
                  onClick={onCancel}
                  disabled={isProcessing}
                  className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-500 transition-all hover:bg-slate-200 disabled:opacity-50"
                >
                  {cancelText}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isProcessing}
                  className={cn(
                    "flex-1 rounded-2xl py-3 text-sm font-black text-white transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50",
                    variant === 'danger' 
                      ? "bg-rose-500 hover:bg-rose-600 shadow-rose-100" 
                      : "bg-blue-600 hover:bg-blue-700 shadow-blue-100"
                  )}
                >
                  {isProcessing && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {isProcessing ? 'Đang xử lý...' : confirmText}
                </button>
              </div>
            </div>

            <button
              onClick={onCancel}
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
