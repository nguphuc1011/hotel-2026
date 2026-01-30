
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Wallet, Banknote, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { bookingService, BookingBill } from '@/services/bookingService';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { cn } from '@/lib/utils';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  bill?: BookingBill | null;
  onSuccess: () => void;
  verifiedStaff?: { id: string, name: string };
}

export default function DepositModal({ isOpen, onClose, bookingId, bill, onSuccess, verifiedStaff }: DepositModalProps) {
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [description, setDescription] = useState('Thanh toán trước');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const remainingAmount = bill ? (bill.amount_to_pay + (bill.customer_balance < 0 ? Math.abs(bill.customer_balance) : 0)) : 0;

  const handleSubmit = async () => {
    if (amount <= 0) {
      toast.error('Vui lòng nhập số tiền hợp lệ');
      return;
    }

    setIsSubmitting(true);
    try {
      await bookingService.addDeposit({
        bookingId,
        amount,
        paymentMethod,
        description,
        verifiedStaff
      });
      toast.success('Đã nhận tiền thành công');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi nhận tiền');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 leading-none">Thanh toán trước</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">Nạp tiền vào tài khoản phòng</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Amount Input */}
          <div className="space-y-2">
            {remainingAmount > 0 && (
                <div className="flex justify-between items-center bg-blue-50 p-3 rounded-xl border border-blue-100">
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">Cần thanh toán</span>
                    <div className="flex items-center gap-2">
                        <span className="font-black text-slate-800">{remainingAmount.toLocaleString()}</span>
                        <button 
                            onClick={() => setAmount(remainingAmount)}
                            className="text-[10px] bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-blue-700 shadow-sm shadow-blue-200 transition-all active:scale-95"
                        >
                            ĐIỀN SỐ
                        </button>
                    </div>
                </div>
            )}
            <label className="text-sm font-bold text-slate-700">Số tiền</label>
            <div className="bg-slate-50 rounded-2xl p-2 border border-slate-200">
                <MoneyInput
                    value={amount}
                    onChange={setAmount}
                    className="w-full text-center text-3xl font-black text-emerald-600 h-16 bg-transparent border-none focus:ring-0 p-0"
                    placeholder="0"
                />
            </div>
            <div className="flex gap-2">
                {[100000, 200000, 500000].map(val => (
                    <button
                        key={val}
                        onClick={() => setAmount(val)}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                    >
                        {val.toLocaleString()}
                    </button>
                ))}
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Hình thức thanh toán</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'cash', label: 'Tiền mặt', icon: Banknote, color: 'emerald' },
                { id: 'transfer', label: 'Chuyển khoản', icon: CreditCard, color: 'blue' },
                { id: 'card', label: 'Quẹt thẻ', icon: Wallet, color: 'purple' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id as any)}
                  className={cn(
                    "relative h-20 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all",
                    paymentMethod === m.id
                      ? `bg-white border-${m.color}-500 shadow-lg shadow-${m.color}-100 -translate-y-1`
                      : "bg-white border-slate-100 hover:border-slate-200 text-slate-400"
                  )}
                >
                  <m.icon className={cn(
                    "w-6 h-6",
                    paymentMethod === m.id ? `text-${m.color}-500` : "text-slate-300"
                  )} />
                  <span className={cn(
                    "text-[10px] font-bold",
                    paymentMethod === m.id ? "text-slate-800" : "text-slate-400"
                  )}>{m.label}</span>
                  {paymentMethod === m.id && (
                    <div className={`absolute top-2 right-2 w-2 h-2 rounded-full bg-${m.color}-500`} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Nội dung</label>
            <input
              type="text"
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || amount <= 0}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? 'Đang xử lý...' : 'Xác nhận thanh toán'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
