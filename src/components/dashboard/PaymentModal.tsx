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
  PlusCircle,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';
import { BookingBill, bookingService } from '@/services/bookingService';
import { customerService } from '@/services/customerService';
import BillBreakdown from './BillBreakdown';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import { telegramService } from '@/services/telegramService';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { securityService, SecurityAction } from '@/services/securityService';
import { useSecurity } from '@/hooks/useSecurity';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: BookingBill;
  onSuccess: () => void;
}

export default function PaymentModal({ isOpen, onClose, bill, onSuccess }: PaymentModalProps) {
  const [mounted, setMounted] = useState(false);
  const customerBalance = bill.customer_balance ?? 0;
  const oldDebt = customerBalance < 0 ? Math.abs(customerBalance) : 0;
  // Tự động cộng nợ cũ vào tổng cộng cần thu
  const totalReceivable = bill.amount_to_pay + oldDebt;

  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER' | 'CARD'>('CASH');
  const [amountPaid, setAmountPaid] = useState<number>(totalReceivable);
  const [discount, setDiscount] = useState<number>(bill.discount_amount || 0);
  const [surcharge, setSurcharge] = useState<number>(bill.custom_surcharge || 0);
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefundConfirmed, setIsRefundConfirmed] = useState(false);

  // Security
  const { verify, SecurityModals } = useSecurity();
  const [walkInCustomerId, setWalkInCustomerId] = useState<string | null>(null);

  // Calculate dynamic totals
  const baseTotal = totalReceivable - (bill.custom_surcharge || 0) + (bill.discount_amount || 0);
  const currentTotal = baseTotal + surcharge - discount;
  const balanceDiff = amountPaid - currentTotal;
  const isDebt = balanceDiff < 0;

  // Hydration safety
  useEffect(() => {
    setMounted(true);
    // Fetch Walk-in Customer ID
    const fetchWalkInId = async () => {
      const walkIn = await customerService.getOrCreateWalkInCustomer();
      if (walkIn) {
        setWalkInCustomerId(walkIn.id);
      }
    };
    fetchWalkInId();
  }, []);

  // Auto-fill debt reason
  useEffect(() => {
    if (isDebt && !notes) {
      setNotes(`Khách nợ lại ${formatMoney(Math.abs(balanceDiff))}đ`);
    } else if (!isDebt && notes.startsWith('Khách nợ lại')) {
      setNotes('');
    }
  }, [isDebt, balanceDiff]);

  // Update amountPaid if bill changes
  useEffect(() => {
    const nextTotal = bill.amount_to_pay + oldDebt;
    setAmountPaid(nextTotal);
    setDiscount(bill.discount_amount || 0);
    setSurcharge(bill.custom_surcharge || 0);
  }, [bill, oldDebt]);

  if (!isOpen || !mounted) return null;

  if (isSuccess) {
    return createPortal(
      <div className="fixed inset-0 z-[60000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300 p-4">
        <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
          <div className="p-10 text-center space-y-8">
            <div className="w-24 h-24 bg-emerald-500 text-white rounded-[32px] flex items-center justify-center mx-auto shadow-xl shadow-emerald-200 rotate-3">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">Thành công!</h2>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Phòng {bill.room_number} • {bill.customer_name}</p>
            </div>

            <div className="bg-slate-50 rounded-[32px] p-8 space-y-6 border border-slate-100 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
              
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Tổng cộng</span>
                <span className="font-black text-slate-900 text-xl tracking-tight">{formatMoney(currentTotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Khách trả</span>
                <span className="font-black text-blue-600 text-xl tracking-tight">{formatMoney(amountPaid)}</span>
              </div>
              
              <div className="h-px bg-slate-200" />
              
              {balanceDiff < 0 ? (
                <div className="flex justify-between items-center p-4 bg-rose-500 text-white rounded-2xl shadow-lg shadow-rose-100">
                  <span className="font-black text-[10px] uppercase tracking-widest opacity-80">Ghi nợ</span>
                  <span className="font-black text-2xl tracking-tight">{formatMoney(Math.abs(balanceDiff))}</span>
                </div>
              ) : balanceDiff > 0 ? (
                <div className="flex justify-between items-center p-4 bg-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-100">
                  <span className="font-black text-[10px] uppercase tracking-widest opacity-80">Tiền thừa</span>
                  <span className="font-black text-2xl tracking-tight">{formatMoney(balanceDiff)}</span>
                </div>
              ) : (
                <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-lg shadow-slate-100 text-center">
                  <span className="font-black text-sm uppercase tracking-widest">Đã thanh toán đủ</span>
                </div>
              )}

              {notes && (
                <div className="text-left space-y-2">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ghi chú</span>
                   <div className="text-sm font-bold text-slate-600 bg-white p-4 rounded-2xl border border-slate-100 italic leading-relaxed">
                      "{notes}"
                   </div>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="w-full h-16 bg-slate-900 hover:bg-black text-white rounded-[24px] font-black text-lg transition-all active:scale-[0.98] shadow-xl shadow-slate-200"
            >
              HOÀN TẤT
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  const processPayment = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const result = await bookingService.processCheckout({
        bill, // Pass full bill
        paymentMethod,
        amountPaid,
        discount,
        surcharge,
        notes,
        // verifiedStaff is handled by useSecurity flow now implicitly (or rather, we don't need it because we only get here if allowed)
        // Wait, bookingService might need to record WHO verified it.
        // But for now, let's assume the backend or service just records the current user.
        // If we need to record "Approved by Manager X", that's part of the Approval Request log.
      });

      if (result.success) {
        setIsSuccess(true);
        onSuccess();
        
        // Gửi thông báo Telegram nếu có cấu hình
        const msg = telegramService.formatCheckoutMessage(bill, amountPaid, balanceDiff, notes);
        telegramService.sendMessage(msg);
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi xử lý thanh toán');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckout = () => {
    // Validate: If debt, require notes
    if (isDebt && !notes.trim()) {
        setError('Vui lòng ghi chú lý do nợ (Ví dụ: Khách quen, Thiếu tiền mặt...)');
        return;
    }

    // Validate: Block Walk-in Debt
    if (isDebt && walkInCustomerId && bill.customer_id === walkInCustomerId) {
        setError('KHÁCH VÃNG LAI KHÔNG ĐƯỢC PHÉP GHI NỢ. Vui lòng tạo hồ sơ khách hàng trước khi thanh toán.');
        return;
    }

    // Validate: If refund (excess payment), require confirmation
    if (balanceDiff > 0 && !isRefundConfirmed) {
        setError('Vui lòng xác nhận đã hoàn trả tiền thừa cho khách!');
        return;
    }

    // Chain of Responsibility for Security Checks
    
    // 4. Standard Payment Check (Final Step)
    const step4_Payment = () => {
      if (!isDebt) {
        verify('checkout_payment', processPayment, { 
          amount: amountPaid,
          room_number: bill.room_number,
          customer_name: bill.customer_name
        });
      } else {
        processPayment(); // Skip payment check if it's a debt case (handled by step 3)
      }
    };

    // 3. Debt Check
    const step3_Debt = () => {
      if (isDebt) {
        verify('checkout_mark_as_debt', processPayment, { 
          debt_amount: Math.abs(balanceDiff),
          room_number: bill.room_number,
          customer_name: bill.customer_name,
          reason: notes
        });
      } else {
        step4_Payment();
      }
    };

    // 2. Custom Surcharge Check
    const step2_Surcharge = () => {
      if (surcharge > 0 && surcharge !== (bill.custom_surcharge || 0)) {
        verify('checkout_custom_surcharge', step3_Debt, { 
          surcharge_amount: surcharge,
          room_number: bill.room_number,
          customer_name: bill.customer_name
        });
      } else {
        step3_Debt();
      }
    };

    // 1. Discount Check (Start)
    if (discount > 0) {
      verify('checkout_discount', step2_Surcharge, { 
        discount_amount: discount,
        room_number: bill.room_number,
        customer_name: bill.customer_name
      });
    } else {
      step2_Surcharge();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex flex-col justify-end sm:justify-center items-center backdrop-blur-md bg-slate-900/60 p-0 sm:p-4">
      {SecurityModals}
      
      {/* Modal Container */}
      <div className="w-full h-[95vh] sm:h-auto sm:max-h-[90vh] sm:max-w-xl bg-white rounded-t-[40px] sm:rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-300">
        
        {/* --- HEADER --- */}
        <div className="h-20 flex justify-between items-center px-8 bg-white z-50 shrink-0 shadow-sm border-b border-slate-100/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-[18px] flex items-center justify-center shadow-lg shadow-slate-200">
              <Calculator className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">THANH TOÁN</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Phòng {bill.room_number} • {bill.customer_name}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-all"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* --- BODY --- */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/50">
          
          {/* 1. BILL BREAKDOWN CARD */}
          <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 space-y-6">
            <div className="flex justify-between items-end">
              <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Tổng cộng cần thu</span>
              <span className="text-4xl font-black text-slate-900 tracking-tighter">
                {formatMoney(currentTotal)}
              </span>
            </div>
            
            {oldDebt > 0 && (
              <div className="flex justify-between items-center p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-white">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold text-amber-800">Bao gồm nợ cũ:</span>
                </div>
                <span className="font-bold text-amber-900">{formatMoney(oldDebt)}</span>
              </div>
            )}
            
            <BillBreakdown 
              bill={bill} 
              discount={discount} 
              onDiscountChange={setDiscount}
              surcharge={surcharge}
              onSurchargeChange={setSurcharge}
            />
          </div>

          {/* 2. PAYMENT METHODS */}
          <div className="space-y-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Phương thức thanh toán</span>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'CASH', label: 'Tiền mặt', icon: Banknote, color: 'emerald' },
                { id: 'TRANSFER', label: 'Chuyển khoản', icon: CreditCard, color: 'blue' },
                { id: 'CARD', label: 'Quẹt thẻ', icon: Wallet, color: 'purple' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id as any)}
                  className={cn(
                    "relative h-24 rounded-[24px] border-2 flex flex-col items-center justify-center gap-2 transition-all duration-300",
                    paymentMethod === m.id
                      ? `bg-white border-${m.color}-500 shadow-xl shadow-${m.color}-100 -translate-y-1`
                      : "bg-white border-transparent hover:bg-slate-50 text-slate-400"
                  )}
                >
                  <m.icon className={cn(
                    "w-8 h-8 transition-colors",
                    paymentMethod === m.id ? `text-${m.color}-500` : "text-slate-300"
                  )} />
                  <span className={cn(
                    "text-xs font-bold transition-colors",
                    paymentMethod === m.id ? "text-slate-800" : "text-slate-400"
                  )}>{m.label}</span>
                  
                  {paymentMethod === m.id && (
                    <div className={`absolute top-2 right-2 w-2 h-2 rounded-full bg-${m.color}-500`} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 3. AMOUNT INPUT */}
          <div className="space-y-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Số tiền khách đưa</span>
            <div className="bg-white rounded-[32px] p-2 shadow-sm border border-slate-100">
               <MoneyInput
                  value={amountPaid}
                  onChange={setAmountPaid}
                  className="w-full text-center text-4xl font-black text-slate-800 h-20 bg-transparent border-none focus:ring-0 p-0"
                  placeholder="0"
                />
            </div>
            
            <div className="flex gap-2 px-2">
                <button 
                    onClick={() => setAmountPaid(currentTotal)}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                >
                    Đúng số tiền
                </button>
                <button 
                    onClick={() => setAmountPaid(Math.ceil(currentTotal / 100000) * 100000)}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                >
                    Làm tròn 100k
                </button>
                 <button 
                    onClick={() => setAmountPaid(Math.ceil(currentTotal / 500000) * 500000)}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                >
                    Làm tròn 500k
                </button>
            </div>
          </div>

          {/* 4. BALANCE / DEBT STATUS */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             {balanceDiff < 0 ? (
                <div className="p-6 bg-rose-50 rounded-[32px] border border-rose-100 space-y-4">
                  <div className="flex items-center gap-4 text-rose-600">
                    <AlertCircle className="w-8 h-8" />
                    <div>
                      <h4 className="font-bold">Khách còn thiếu</h4>
                      <p className="text-xs opacity-80">Sẽ được ghi vào công nợ khách hàng</p>
                    </div>
                  </div>
                  <div className="text-3xl font-black text-rose-600 text-center">
                    {formatMoney(Math.abs(balanceDiff))}
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Nhập lý do nợ (Bắt buộc)..."
                    className="w-full bg-white border-2 border-rose-100 rounded-2xl p-4 text-sm font-medium focus:border-rose-400 focus:ring-4 focus:ring-rose-100 outline-none transition-all"
                    rows={2}
                  />
                </div>
              ) : balanceDiff > 0 ? (
                 <div className="p-6 bg-emerald-50 rounded-[32px] border border-emerald-100 space-y-4">
                  <div className="flex items-center gap-4 text-emerald-600">
                    <Wallet className="w-8 h-8" />
                    <div>
                      <h4 className="font-bold">Tiền thừa trả khách</h4>
                      <p className="text-xs opacity-80">Vui lòng trả lại tiền thừa cho khách</p>
                    </div>
                  </div>
                  <div className="text-3xl font-black text-emerald-600 text-center">
                    {formatMoney(balanceDiff)}
                  </div>
                   <label className="flex items-center justify-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-emerald-100/50 transition-colors">
                    <div className={cn(
                        "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                        isRefundConfirmed ? "bg-emerald-500 border-emerald-500" : "border-emerald-300"
                    )}>
                        {isRefundConfirmed && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </div>
                    <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={isRefundConfirmed}
                        onChange={(e) => setIsRefundConfirmed(e.target.checked)}
                    />
                    <span className="text-sm font-bold text-emerald-800 select-none">Đã hoàn tiền cho khách</span>
                  </label>
                </div>
              ) : (
                <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100 text-center">
                    <span className="font-bold text-slate-400">Đã thanh toán đủ</span>
                </div>
              )}
          </div>
          
           {/* Notes if not debt */}
           {!isDebt && (
             <div className="space-y-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Ghi chú thêm</span>
                <div className="bg-white rounded-[24px] p-2 shadow-sm border border-slate-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                        <MessageSquare className="w-5 h-5" />
                    </div>
                    <input 
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ghi chú hóa đơn (tùy chọn)..."
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 placeholder:text-slate-300"
                    />
                </div>
             </div>
           )}

        </div>

        {/* --- FOOTER --- */}
        <div className="p-6 bg-white border-t border-slate-100">
          {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold flex items-center gap-3 animate-in slide-in-from-bottom-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
            </div>
          )}
          
          <button
            onClick={handleCheckout}
            disabled={isProcessing}
            className={cn(
                "w-full h-16 rounded-[24px] font-black text-lg flex items-center justify-center gap-3 shadow-xl transition-all active:scale-[0.98]",
                isProcessing ? "bg-slate-100 text-slate-400 cursor-wait" : "bg-slate-900 text-white hover:bg-black shadow-slate-200"
            )}
          >
            {isProcessing ? (
                <>Đang xử lý...</>
            ) : (
                <>
                    XÁC NHẬN THANH TOÁN
                    <ChevronRight className="w-6 h-6 opacity-60" />
                </>
            )}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
