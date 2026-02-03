'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cashFlowService, Wallet } from '@/services/cashFlowService';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';

interface WalletAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  wallets: Wallet[];
}

export default function WalletAdjustmentModal({ isOpen, onClose, onSuccess, wallets }: WalletAdjustmentModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string>('CASH');
  const [actualBalance, setActualBalance] = useState<number>(0);
  const [reason, setReason] = useState('');

  const currentWallet = wallets.find(w => w.id === selectedWalletId);
  const currentBalance = currentWallet ? currentWallet.balance : 0;
  
  // Update actual balance init when wallet changes or opens
  useEffect(() => {
    if (isOpen && currentWallet) {
        setActualBalance(currentWallet.balance);
    }
  }, [isOpen, selectedWalletId, currentWallet]);

  const diff = actualBalance - currentBalance;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (diff === 0) {
      toast.info('Số dư đã khớp, không cần điều chỉnh.');
      return;
    }

    if (!reason.trim()) {
      toast.error('Vui lòng nhập lý do điều chỉnh');
      return;
    }

    if (!confirm('Bạn có chắc chắn muốn điều chỉnh số dư không? Hành động này sẽ được ghi lại.')) {
        return;
    }

    setLoading(true);
    try {
      await cashFlowService.adjustWalletBalance({
        walletId: selectedWalletId,
        actualBalance,
        currentBalance,
        reason
      });
      toast.success('Điều chỉnh số dư thành công');
      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-400" />
            Điều chỉnh quỹ
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {/* Wallet Selection */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Chọn ví cần điều chỉnh</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedWalletId('CASH')}
                className={cn(
                  "px-4 py-3 rounded-xl border font-bold transition-all",
                  selectedWalletId === 'CASH' 
                    ? "bg-emerald-50 border-emerald-500 text-emerald-700" 
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                )}
              >
                Tiền mặt (Két)
              </button>
              <button
                type="button"
                onClick={() => setSelectedWalletId('BANK')}
                className={cn(
                  "px-4 py-3 rounded-xl border font-bold transition-all",
                  selectedWalletId === 'BANK' 
                    ? "bg-blue-50 border-blue-500 text-blue-700" 
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                )}
              >
                Ngân hàng
              </button>
            </div>
          </div>

          {/* Comparison */}
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1">
               <label className="text-xs font-bold text-slate-400 uppercase">Hiện tại (Hệ thống)</label>
               <div className="text-xl font-bold text-slate-700 font-mono bg-slate-50 py-2 px-3 rounded-lg border border-slate-100">
                 {formatMoney(currentBalance)}
               </div>
             </div>
             <div className="space-y-1">
               <label className="text-xs font-bold text-slate-400 uppercase">Chênh lệch</label>
               <div className={cn(
                 "text-xl font-bold font-mono py-2 px-3 rounded-lg border",
                 diff > 0 ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                 diff < 0 ? "bg-rose-50 text-rose-600 border-rose-100" :
                 "bg-slate-50 text-slate-400 border-slate-100"
               )}>
                 {diff > 0 ? '+' : ''}{formatMoney(diff)}
               </div>
             </div>
          </div>

          {/* Input Actual */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Số dư thực tế kiểm đếm</label>
            <MoneyInput
              value={actualBalance}
              onChange={setActualBalance}
              className="text-2xl font-black text-center py-6 h-auto"
              placeholder="0"
              autoFocus
            />
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Lý do chênh lệch</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 min-h-[80px] text-sm font-medium"
              placeholder="Ví dụ: Sai sót do quên ghi chép ngày..."
            />
          </div>

          {/* Actions */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || diff === 0}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-slate-900/20"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Check strokeWidth={3} />}
              Xác nhận điều chỉnh
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
