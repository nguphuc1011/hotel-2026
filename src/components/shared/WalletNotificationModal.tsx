'use client';

import React, { useEffect, useState } from 'react';
import { X, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WalletChange {
  walletName: string;
  diff: number;
  newBalance: number;
  timestamp: number;
}

interface WalletNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  changes: WalletChange[];
}

export default function WalletNotificationModal({ isOpen, onClose, changes }: WalletNotificationModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
    }
  }, [isOpen]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300); // Wait for animation
  };

  if (!isOpen) return null;

  const formatMoney = (amount: number) => 
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  return (
    <div className={cn(
      "fixed inset-0 z-[100] flex items-start justify-center pt-20 transition-all duration-300 bg-black/40 backdrop-blur-sm",
      visible ? "opacity-100" : "opacity-0 pointer-events-none"
    )}>
      <div className={cn(
        "bg-white/90 backdrop-blur-xl border border-white/50 shadow-2xl rounded-2xl p-6 max-w-sm w-full mx-4 pointer-events-auto transform transition-all duration-300 relative overflow-hidden",
        visible ? "translate-y-0 scale-100" : "-translate-y-10 scale-95"
      )}>
        {/* Background Decoration */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between mb-4 relative z-10">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Wallet size={20} />
            </div>
            <h3 className="font-bold text-gray-900">Biến động số dư</h3>
          </div>
          <button 
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 relative z-10 max-h-[60vh] overflow-y-auto no-scrollbar">
          {changes.map((change, index) => {
            const isIncrease = change.diff > 0;
            return (
              <div 
                key={`${change.walletName}-${change.timestamp}-${index}`}
                className="flex items-center justify-between p-3 bg-gray-50/80 rounded-xl border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-full",
                    isIncrease ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                  )}>
                    {isIncrease ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{change.walletName}</p>
                    <p className="font-bold text-gray-900">{formatMoney(change.newBalance)}</p>
                  </div>
                </div>
                <div className={cn(
                  "font-bold text-sm",
                  isIncrease ? "text-emerald-600" : "text-rose-600"
                )}>
                  {isIncrease ? '+' : ''}{formatMoney(change.diff)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-2 relative z-10">
          <button 
            onClick={handleClose}
            className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-all active:scale-95 shadow-lg shadow-gray-200"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
