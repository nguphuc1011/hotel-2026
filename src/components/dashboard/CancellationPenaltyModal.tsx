'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Banknote, Wallet, CreditCard, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';
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
  bill,
  onConfirm,
  isLoading = false
}: CancellationPenaltyModalProps & { bill?: any }) {
  const [hasPenalty, setHasPenalty] = useState<boolean | null>(null);
  const [penaltyAmount, setPenaltyAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [reason, setReason] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  // Tính toán gợi ý số tiền phạt từ bill
  const suggestedPenalty = bill ? ((bill.room_charge || 0) + (bill.service_total || 0) + (bill.surcharge_total || 0) + (bill.custom_surcharge || 0)) : 0;
  
  // Debug log
  useEffect(() => {
    if (isOpen) {
        console.log("CancellationPenaltyModal OPENED with:", {
            bill,
            suggestedPenalty,
            roomName,
            customerName
        });
    }
  }, [isOpen, bill, suggestedPenalty, roomName, customerName]);

  useEffect(() => {
    setMounted(true);
    if (isOpen) {
        setHasPenalty(null);
        // Mặc định gợi ý số tiền phạt nếu có bill
        if (suggestedPenalty > 0) {
            setPenaltyAmount(suggestedPenalty);
        } else {
            setPenaltyAmount(0);
        }
        setPaymentMethod('cash');
        setReason('');
    }
  }, [isOpen, suggestedPenalty]);

  if (!isOpen || !mounted) return null;

  const handleConfirm = () => {
    if (!reason.trim()) {
        alert("Vui lòng nhập lý do hủy phòng!");
        return;
    }
    // Nếu có bill > 0 mà chọn "Không phạt" thì cảnh báo
    if (suggestedPenalty > 0 && hasPenalty === false) {
        if (!confirm(`Khách đã sử dụng ${formatMoney(suggestedPenalty)} dịch vụ/tiền phòng. Bạn có chắc chắn muốn HỦY mà KHÔNG THU tiền này không?`)) {
            return;
        }
    }

    if (hasPenalty === true) {
      onConfirm(penaltyAmount, paymentMethod, reason);
    } else {
      onConfirm(0, 'cash', reason);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[70000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className={cn(
          "w-full bg-white shadow-2xl overflow-hidden flex flex-col animate-in duration-300",
          "h-[92vh] mt-auto rounded-t-[40px] slide-in-from-bottom-full md:h-auto md:max-w-md md:rounded-[32px] md:zoom-in-95 md:max-h-[90vh] md:mt-0"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* --- HEADER --- */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 flex items-center justify-center shadow-lg shadow-rose-200">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 leading-none">Hủy phòng & Phạt</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">Phòng {roomName} • {customerName}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full transition-all active:scale-95 border border-slate-200 shadow-sm"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* --- BODY --- */}
        <div className="flex-1 p-6 space-y-6 bg-slate-50 relative overflow-y-auto custom-scrollbar">
          
          {suggestedPenalty > 0 && hasPenalty === null && (
            <div className="bg-amber-50 border border-amber-100 rounded-[32px] p-6 shadow-sm animate-in slide-in-from-top-2">
              <h4 className="font-bold text-amber-700 text-xs mb-4 flex items-center gap-2 uppercase tracking-widest">
                <AlertTriangle className="w-4 h-4" />
                Khoản cần thu (Gợi ý)
              </h4>
              <div className="space-y-3 text-sm text-amber-900">
                <div className="flex justify-between items-center">
                  <span className="font-medium opacity-70">Tiền phòng:</span>
                  <span className="font-bold font-mono">{formatMoney(bill?.room_charge || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium opacity-70">Dịch vụ:</span>
                  <span className="font-bold font-mono">{formatMoney(bill?.service_total || 0)}</span>
                </div>
                 {(bill?.surcharge_total > 0 || bill?.custom_surcharge > 0) && (
                    <div className="flex justify-between items-center">
                      <span className="font-medium opacity-70">Phụ thu:</span>
                      <span className="font-bold font-mono">{formatMoney((bill?.surcharge_total || 0) + (bill?.custom_surcharge || 0))}</span>
                    </div>
                 )}
                <div className="border-t border-amber-200 pt-4 mt-2 flex justify-between items-center font-black text-xl text-amber-800">
                  <span className="uppercase tracking-tighter text-sm">Tổng cộng</span>
                  <span className="font-mono">{formatMoney(suggestedPenalty)}</span>
                </div>
              </div>
            </div>
          )}

          {hasPenalty === null ? (
            <div className="space-y-6">
              <div className="text-center space-y-2 px-4">
                <h4 className="text-lg font-bold text-slate-800 leading-tight">Bạn có muốn thu phí phạt cho phòng hủy này không?</h4>
                <p className="text-xs text-slate-500 font-medium italic opacity-70 leading-relaxed">"Mọi sai lầm đều có thể quy đổi thành ngân lượng..."</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => {
                      setHasPenalty(true);
                      setPenaltyAmount(suggestedPenalty);
                  }}
                  className="p-6 rounded-[32px] bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col items-center gap-4 group"
                >
                  <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-all shadow-inner">
                    <Banknote className="w-7 h-7" />
                  </div>
                  <div className="text-center">
                    <span className="font-black text-slate-800 uppercase tracking-widest text-[10px]">CÓ PHẠT</span>
                    {suggestedPenalty > 0 && (
                        <div className="mt-2 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-full border border-rose-100">
                            {formatMoney(suggestedPenalty)}
                        </div>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => setHasPenalty(false)}
                  className="p-6 rounded-[32px] bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col items-center gap-4 group"
                >
                  <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all shadow-inner">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div className="text-center">
                    <span className="font-black text-slate-800 uppercase tracking-widest text-[10px]">KHÔNG PHẠT</span>
                    <div className="mt-2 text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-full border border-slate-100">
                        Hủy sạch
                    </div>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <>
              {hasPenalty === true ? (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
                    <label className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1">Số tiền phạt (VNĐ)</label>
                    <div className="relative">
                        <MoneyInput 
                            value={penaltyAmount}
                            onChange={setPenaltyAmount}
                            className="w-full py-6 px-4 bg-slate-50 rounded-[32px] text-4xl font-bold text-rose-600 focus:ring-0 border-none outline-none transition-all tracking-tight"
                            inputClassName="text-4xl font-bold tracking-tight text-center"
                            autoFocus
                            centered
                            align="center"
                        />
                    </div>
                     {suggestedPenalty > 0 && penaltyAmount !== suggestedPenalty && (
                        <div className="text-center">
                            <button 
                                onClick={() => setPenaltyAmount(suggestedPenalty)}
                                className="text-[10px] font-black text-amber-600 bg-amber-50 px-4 py-2 rounded-full border border-amber-100 hover:bg-amber-100 transition-all active:scale-95 uppercase tracking-widest shadow-sm"
                            >
                                Dùng gợi ý: {formatMoney(suggestedPenalty)}
                            </button>
                        </div>
                     )}
                  </div>

                  <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
                    <span className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1">Hình thức thu</span>
                    <div className="flex bg-slate-50 rounded-full p-1.5 shadow-sm border border-slate-100">
                      {[
                        { id: 'cash', label: 'TIỀN MẶT', icon: Banknote },
                        { id: 'bank', label: 'CHUYỂN KHOẢN', icon: Wallet },
                      ].map((m) => {
                        const isActive = paymentMethod === m.id;
                        const Icon = m.icon;
                        return (
                          <button
                            key={m.id}
                            onClick={() => setPaymentMethod(m.id as any)}
                            className={cn(
                                "flex-1 flex flex-col items-center justify-center py-3.5 rounded-full transition-all duration-300 relative overflow-hidden",
                                isActive 
                                    ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30" 
                                    : "text-slate-400 hover:bg-slate-100"
                            )}
                          >
                            <Icon className={cn("w-4 h-4 mb-1.5", isActive ? "text-white" : "text-slate-400")} />
                            <span className="text-[10px] font-bold tracking-widest uppercase">{m.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[40px] shadow-sm p-8 text-center animate-in slide-in-from-left-4 duration-300 border border-slate-100">
                  <div className="w-16 h-16 bg-slate-900 text-white rounded-[24px] flex items-center justify-center mx-auto mb-4 shadow-xl shadow-slate-200">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-800 leading-tight">Xác nhận hủy phòng MIỄN PHÍ</h4>
                  <p className="text-xs text-slate-500 mt-2 font-medium italic opacity-70">Hành động này sẽ xóa sạch toàn bộ công nợ và dịch vụ của phòng này.</p>
                </div>
              )}

              {/* Reason Input */}
              <div className="space-y-3 animate-in slide-in-from-bottom-4 duration-500">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1 flex items-center gap-2">
                    Lý do hủy <span className="text-[10px] bg-rose-100 px-2 py-0.5 rounded-full font-black text-rose-600">BẮT BUỘC</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Vì sao phòng này bị hủy?..."
                  className="w-full h-24 rounded-[32px] bg-white p-5 text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500 border-none outline-none transition-all resize-none shadow-sm"
                />
              </div>
            </>
          )}
        </div>

        {/* --- FOOTER --- */}
        <div className="p-6 bg-white border-t border-slate-100 flex items-center gap-4 shrink-0">
          {hasPenalty !== null && (
            <button 
              onClick={() => setHasPenalty(null)}
              className="flex-1 py-4 rounded-[24px] font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-wider"
            >
              QUAY LẠI
            </button>
          )}
          <button 
            onClick={handleConfirm}
            disabled={isLoading || (hasPenalty === true && penaltyAmount <= 0)}
            className={cn(
                "flex-[2] py-4 rounded-[24px] font-bold text-white uppercase tracking-wider shadow-lg transition-all flex items-center justify-center gap-3 active:scale-95",
                hasPenalty === true 
                    ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/30" 
                    : "bg-slate-900 hover:bg-black shadow-slate-900/30",
                (isLoading || (hasPenalty === true && penaltyAmount <= 0)) && "bg-slate-300 shadow-none cursor-not-allowed"
            )}
          >
            {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
                <span>XÁC NHẬN HỦY PHÒNG</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}