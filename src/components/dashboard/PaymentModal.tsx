'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Banknote, 
  CreditCard, 
  Wallet, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Calculator,
  MessageSquare,
  TicketPercent,
  PlusCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BookingBill, bookingService } from '@/services/bookingService';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: BookingBill;
  onSuccess: () => void;
}

export default function PaymentModal({ isOpen, onClose, bill, onSuccess }: PaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER' | 'CARD'>('CASH');
  const [amountPaid, setAmountPaid] = useState<number>(bill.amount_to_pay);
  const [discount, setDiscount] = useState<number>(bill.discount_amount || 0);
  const [surcharge, setSurcharge] = useState<number>(bill.custom_surcharge || 0);
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update amountPaid if bill changes or discount/surcharge changes
  // Note: We don't do complex math here, just a simple UI preview if needed, 
  // but the RPC is the final judge.
  useEffect(() => {
    setAmountPaid(bill.amount_to_pay);
    setDiscount(bill.discount_amount || 0);
    setSurcharge(bill.custom_surcharge || 0);
  }, [bill]);

  if (!isOpen) return null;

  const handleCheckout = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const result = await bookingService.processCheckout({
        bookingId: bill.booking_id,
        paymentMethod,
        amountPaid,
        discount,
        surcharge,
        notes
      });

      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi xử lý thanh toán');
    } finally {
      setIsProcessing(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200 p-4">
      <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">Xác nhận thanh toán</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary Card */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">Phòng:</span>
              <span className="font-bold text-slate-900">{bill.room_number}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">Khách hàng:</span>
              <span className="font-bold text-slate-900">{bill.customer_name}</span>
            </div>
            <div className="h-px bg-slate-200 my-2" />
            <div className="flex justify-between items-center">
              <span className="text-slate-600 font-bold">Tổng thanh toán:</span>
              <span className="text-2xl font-black text-blue-600">
                {bill.amount_to_pay.toLocaleString()}đ
              </span>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 ml-1">Phương thức thanh toán</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'CASH', label: 'Tiền mặt', icon: Banknote },
                { id: 'TRANSFER', label: 'Chuyển khoản', icon: Wallet },
                { id: 'CARD', label: 'Thẻ / POS', icon: CreditCard },
              ].map((method) => (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id as any)}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all gap-2",
                    paymentMethod === method.id 
                      ? "border-blue-500 bg-blue-50 text-blue-600" 
                      : "border-slate-100 bg-white text-slate-400 hover:border-slate-200"
                  )}
                >
                  <method.icon className="w-6 h-6" />
                  <span className="text-[10px] font-bold uppercase tracking-tight">{method.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Inputs */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-slate-700 ml-1 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-slate-400" />
                Số tiền khách trả
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Number(e.target.value))}
                  className="w-full bg-slate-50 border-none rounded-xl px-4 h-12 font-bold text-lg text-slate-900 focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="0"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">đ</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1.5">
                  <TicketPercent className="w-3.5 h-3.5" />
                  Giảm giá thêm
                </label>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-full bg-slate-50 border-none rounded-xl px-3 h-10 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 ml-1 flex items-center gap-1.5">
                  <PlusCircle className="w-3.5 h-3.5" />
                  Phụ phí thêm
                </label>
                <input
                  type="number"
                  value={surcharge}
                  onChange={(e) => setSurcharge(Number(e.target.value))}
                  className="w-full bg-slate-50 border-none rounded-xl px-3 h-10 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-bold text-slate-700 ml-1 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                Ghi chú thanh toán
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-none"
                placeholder="Ví dụ: Khách quên trả tiền nước, đã tính gộp..."
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl flex items-center gap-2 text-sm font-medium animate-in slide-in-from-top-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={handleCheckout}
            disabled={isProcessing}
            className={cn(
              "w-full h-14 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg",
              isProcessing 
                ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25 active:scale-[0.98]"
            )}
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ĐANG XỬ LÝ...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-6 h-6" />
                XÁC NHẬN THANH TOÁN
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
