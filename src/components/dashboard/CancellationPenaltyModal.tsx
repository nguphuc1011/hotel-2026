'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Banknote, Wallet, CreditCard, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MoneyInput } from '@/components/ui/MoneyInput';

interface CancellationPenaltyModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  customerName: string;
  onConfirm: (penaltyAmount: number, paymentMethod: string, reason: string) => void;
  isLoading?: boolean;
}

export default function CancellationPenaltyModal({ 
  isOpen, 
  onClose, 
  roomName, 
  customerName, 
  onConfirm,
  isLoading = false
}: CancellationPenaltyModalProps) {
  const [hasPenalty, setHasPenalty] = useState<boolean | null>(null);
  const [penaltyAmount, setPenaltyAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [reason, setReason] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isOpen) {
        setHasPenalty(null);
        setPenaltyAmount(0);
        setPaymentMethod('cash');
        setReason('');
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const handleConfirm = () => {
    if (!reason.trim()) {
        alert("Vui lòng nhập lý do hủy phòng!");
        return;
    }
    if (hasPenalty === true) {
      onConfirm(penaltyAmount, paymentMethod, reason);
    } else {
      onConfirm(0, 'cash', reason);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[65000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-600 flex items-center justify-center shadow-lg shadow-rose-200">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 leading-none uppercase">Hủy phòng & Phạt</h3>
              <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-wider">Phòng {roomName} • {customerName}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full transition-all border border-slate-200 shadow-sm"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          {hasPenalty === null ? (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h4 className="text-lg font-bold text-slate-800">Bệ Hạ có muốn phạt cho phòng hủy này không?</h4>
                <p className="text-sm text-slate-500 font-medium italic">"Mọi sai lầm đều phải trả giá bằng tiền mặt hoặc chuyển khoản..."</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setHasPenalty(true)}
                  className="py-6 rounded-[24px] border-2 border-slate-100 hover:border-rose-500 hover:bg-rose-50 transition-all flex flex-col items-center gap-3 group"
                >
                  <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-all">
                    <Banknote className="w-6 h-6" />
                  </div>
                  <span className="font-black text-slate-700 uppercase tracking-widest text-xs">CÓ PHẠT</span>
                </button>
                <button
                  onClick={() => setHasPenalty(false)}
                  className="py-6 rounded-[24px] border-2 border-slate-100 hover:border-slate-900 hover:bg-slate-50 transition-all flex flex-col items-center gap-3 group"
                >
                  <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <span className="font-black text-slate-700 uppercase tracking-widest text-xs">KHÔNG PHẠT</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {hasPenalty === true ? (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Số tiền phạt (VNĐ)</label>
                    <MoneyInput 
                      value={penaltyAmount}
                      onChange={setPenaltyAmount}
                      className="h-20 text-3xl font-black text-rose-600 border-2 border-slate-100 focus:border-rose-500 rounded-[24px] bg-slate-50"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Hình thức thu</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setPaymentMethod('cash')}
                        className={cn(
                          "py-4 rounded-2xl border-2 flex items-center justify-center gap-2 font-bold transition-all",
                          paymentMethod === 'cash' 
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-lg shadow-emerald-100" 
                            : "border-slate-100 text-slate-400 hover:border-slate-200"
                        )}
                      >
                        <Banknote className="w-4 h-4" />
                        Tiền mặt
                      </button>
                      <button
                        onClick={() => setPaymentMethod('bank')}
                        className={cn(
                          "py-4 rounded-2xl border-2 flex items-center justify-center gap-2 font-bold transition-all",
                          paymentMethod === 'bank' 
                            ? "border-blue-500 bg-blue-50 text-blue-700 shadow-lg shadow-blue-100" 
                            : "border-slate-100 text-slate-400 hover:border-slate-200"
                        )}
                      >
                        <Wallet className="w-4 h-4" />
                        Chuyển khoản
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 animate-in slide-in-from-left-4 duration-300">
                  <div className="w-16 h-16 bg-slate-900 text-white rounded-[20px] flex items-center justify-center mx-auto mb-3 shadow-xl shadow-slate-200">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <p className="text-lg font-bold text-slate-800">Xác nhận hủy phòng không phạt</p>
                  <p className="text-sm text-slate-500 mt-1 font-medium italic">Hành động này sẽ đảo toàn bộ dòng tiền về 0.</p>
                </div>
              )}

              {/* Reason Input */}
              <div className="space-y-3 animate-in slide-in-from-bottom-4 duration-500">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Lý do hủy (Bắt buộc)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Nhập lý do hủy phòng..."
                  className="w-full p-4 text-sm font-bold text-slate-700 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-slate-900 focus:outline-none resize-none h-24"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
          {hasPenalty !== null && (
            <button 
              onClick={() => setHasPenalty(null)}
              className="flex-1 h-16 bg-white border border-slate-200 text-slate-600 font-black rounded-2xl hover:bg-slate-100 transition-all active:scale-95"
            >
              QUAY LẠI
            </button>
          )}
          <button 
            onClick={handleConfirm}
            disabled={isLoading || (hasPenalty === true && penaltyAmount <= 0)}
            className={cn(
                "flex-[2] h-16 text-white font-black rounded-2xl transition-all active:scale-95 shadow-xl flex items-center justify-center gap-3 disabled:opacity-50",
                hasPenalty === true ? "bg-rose-600 hover:bg-rose-700 shadow-rose-200" : "bg-slate-900 hover:bg-black shadow-slate-200"
            )}
          >
            {isLoading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
                <>XÁC NHẬN HỦY</>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}