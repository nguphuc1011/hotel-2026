
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Wallet, Banknote, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { bookingService, BookingBill } from '@/services/bookingService';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string | undefined;
  bill?: BookingBill | null;
  customerId?: string; // Add customerId to props
  onSuccess: () => void;
  verifiedStaff?: { id: string, name: string };
}

export default function DepositModal({ isOpen, onClose, bookingId, bill, customerId: propCustomerId, onSuccess, verifiedStaff }: DepositModalProps) {
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [description, setDescription] = useState('Thu trước');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const remainingAmount = bill ? (bill.amount_to_pay + (bill.customer_balance < 0 ? Math.abs(bill.customer_balance) : 0)) : 0;

  const handleSubmit = async () => {
    if (!bookingId) return;

    if (amount <= 0) {
      toast.error('Vui lòng nhập số tiền hợp lệ');
      return;
    }

    setIsSubmitting(true);
    try {
      await bookingService.addDeposit({
        bookingId: bookingId as string,
        amount,
        paymentMethod,
        description,
        customerId: propCustomerId || bill?.customer_id, // Use prop or bill
        verifiedStaff
      });
      toast.success('Đã nhận tiền thành công');
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi nhận tiền');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !bookingId) return null;

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
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 leading-none">Thu trước (Cọc)</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">Nạp tiền vào tài khoản phòng</p>
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
          
          {/* Amount Input Section */}
          <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">Số tiền thu</span>
                {remainingAmount > 0 && (
                    <button 
                        onClick={() => setAmount(remainingAmount)}
                        className="text-[10px] font-black bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-all active:scale-95 uppercase tracking-widest border border-blue-100"
                    >
                        Đủ: {formatMoney(remainingAmount)}
                    </button>
                )}
            </div>

            <div className="relative">
                <MoneyInput
                    value={amount}
                    onChange={setAmount}
                    className="w-full py-6 px-4 bg-slate-50 rounded-[32px] text-4xl font-bold text-emerald-600 focus:ring-0 border-none outline-none transition-all tracking-tight"
                    inputClassName="text-4xl font-bold tracking-tight text-center"
                    placeholder="0"
                    autoFocus
                    centered
                    align="center"
                />
            </div>

            <div className="flex gap-2 mt-2 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory">
                {[100000, 200000, 500000].map(val => (
                    <button
                        key={val}
                        onClick={() => setAmount(val)}
                        className="flex-1 py-3.5 rounded-2xl bg-slate-50 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-all active:scale-95 whitespace-nowrap px-4 shadow-sm border border-slate-100 snap-start"
                    >
                        {val/1000}k
                    </button>
                ))}
            </div>
          </div>

          {/* Payment Method (Pill Style) */}
          <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
              <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">Phương thức thanh toán</span>
              
              <div className="flex bg-slate-50 rounded-full p-1.5 shadow-sm relative z-10 border border-slate-100">
                  {[
                      { id: 'cash', label: 'TIỀN MẶT', icon: Banknote },
                      { id: 'transfer', label: 'CHUYỂN KHOẢN', icon: CreditCard },
                  ].map((m) => {
                      const isActive = paymentMethod === m.id;
                      const Icon = m.icon;
                      return (
                          <button
                              key={m.id}
                              onClick={() => setPaymentMethod(m.id as any)}
                              className={cn(
                                  "flex-1 flex flex-col items-center justify-center py-3.5 rounded-full transition-all duration-300 relative overflow-hidden",
                                  isActive ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30" : "text-slate-400 hover:bg-slate-50"
                              )}
                          >
                              <Icon className={cn("w-4 h-4 mb-1.5", isActive ? "text-white" : "text-slate-400")} />
                              <span className="text-[10px] font-bold tracking-widest uppercase">{m.label}</span>
                          </button>
                      );
                  })}
              </div>
          </div>

          {/* Description Section */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1">Nội dung thu</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú nội dung thu tiền..."
              className="w-full h-24 rounded-[32px] bg-white p-5 text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 border-none outline-none transition-all resize-none shadow-sm"
            />
          </div>

        </div>

        {/* --- FOOTER --- */}
        <div className="p-6 bg-white border-t border-slate-100 flex items-center gap-4 shrink-0">
          <button 
            onClick={onClose}
            className="flex-1 py-4 rounded-[24px] font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-wider"
          >
            Hủy bỏ
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || amount <= 0}
            className={cn(
                "flex-[2] py-4 rounded-[24px] font-bold text-white uppercase tracking-wider shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-3",
                isSubmitting || amount <= 0 ? "bg-slate-300 cursor-not-allowed shadow-none" : "bg-emerald-600 hover:bg-emerald-700 active:scale-95"
            )}
          >
            {isSubmitting ? 'Đang xử lý...' : 'Xác nhận thu tiền'}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
