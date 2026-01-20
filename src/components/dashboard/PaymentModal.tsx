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
import { BookingBill, bookingService } from '@/services/bookingService';
import BillBreakdown from './BillBreakdown';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import { telegramService } from '@/services/telegramService';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { securityService, SecurityAction } from '@/services/securityService';
import PinValidationModal from '@/components/shared/PinValidationModal';

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
  const totalReceivable = bill.amount_to_pay;

  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER' | 'CARD'>('CASH');
  const [amountPaid, setAmountPaid] = useState<number>(totalReceivable);
  const [discount, setDiscount] = useState<number>(bill.discount_amount || 0);
  const [surcharge, setSurcharge] = useState<number>(bill.custom_surcharge || 0);
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Security states
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [securityAction, setSecurityAction] = useState<SecurityAction | null>(null);

  // Calculate dynamic totals
  const baseTotal = totalReceivable - (bill.custom_surcharge || 0) + (bill.discount_amount || 0);
  const currentTotal = baseTotal + surcharge - discount;
  const balanceDiff = amountPaid - currentTotal;
  const isDebt = balanceDiff < 0;

  // Hydration safety
  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-fill debt reason
  useEffect(() => {
    if (isDebt && !notes) {
      setNotes(`Khách nợ lại ${Math.abs(balanceDiff).toLocaleString()}đ`);
    } else if (!isDebt && notes.startsWith('Khách nợ lại')) {
      setNotes('');
    }
  }, [isDebt, balanceDiff]);

  // Update amountPaid if bill changes
  useEffect(() => {
    const nextTotal = bill.amount_to_pay;
    setAmountPaid(nextTotal);
    setDiscount(bill.discount_amount || 0);
    setSurcharge(bill.custom_surcharge || 0);
  }, [bill]);

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
                <span className="font-black text-slate-900 text-xl tracking-tight">{currentTotal.toLocaleString()}đ</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Khách trả</span>
                <span className="font-black text-blue-600 text-xl tracking-tight">{amountPaid.toLocaleString()}đ</span>
              </div>
              
              <div className="h-px bg-slate-200" />
              
              {balanceDiff < 0 ? (
                <div className="flex justify-between items-center p-4 bg-rose-500 text-white rounded-2xl shadow-lg shadow-rose-100">
                  <span className="font-black text-[10px] uppercase tracking-widest opacity-80">Ghi nợ</span>
                  <span className="font-black text-2xl tracking-tight">{Math.abs(balanceDiff).toLocaleString()}đ</span>
                </div>
              ) : balanceDiff > 0 ? (
                <div className="flex justify-between items-center p-4 bg-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-100">
                  <span className="font-black text-[10px] uppercase tracking-widest opacity-80">Tiền thừa</span>
                  <span className="font-black text-2xl tracking-tight">{balanceDiff.toLocaleString()}đ</span>
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

  const handleCheckout = async (verifiedStaff?: { id: string, name: string }) => {
    // Validate: If debt, require notes
    if (isDebt && !notes.trim()) {
        setError('Vui lòng ghi chú lý do nợ (Ví dụ: Khách quen, Thiếu tiền mặt...)');
        return;
    }

    // --- Security Checks ---
    if (!verifiedStaff) {
      // 1. Check Discount
      if (discount > 0) {
        const requiresPin = await securityService.checkActionRequiresPin('checkout_discount');
        if (requiresPin) {
          setSecurityAction('checkout_discount');
          setIsPinModalOpen(true);
          return;
        }
      }

      // 2. Check Custom Surcharge
      if (surcharge > 0 && surcharge !== (bill.custom_surcharge || 0)) {
        const requiresPin = await securityService.checkActionRequiresPin('checkout_custom_surcharge');
        if (requiresPin) {
          setSecurityAction('checkout_custom_surcharge');
          setIsPinModalOpen(true);
          return;
        }
      }

      // 3. Check Debt
      if (isDebt) {
        const requiresPin = await securityService.checkActionRequiresPin('checkout_mark_as_debt');
        if (requiresPin) {
          setSecurityAction('checkout_mark_as_debt');
          setIsPinModalOpen(true);
          return;
        }
      }

      // 4. Check Standard Payment (If no other checks triggered or as a final gate)
      // Note: If debt check passed (or wasn't debt), we still check standard payment if enabled
      if (!isDebt) {
        const requiresPin = await securityService.checkActionRequiresPin('checkout_payment');
        if (requiresPin) {
          setSecurityAction('checkout_payment');
          setIsPinModalOpen(true);
          return;
        }
      }
    }

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
        verifiedStaff: verifiedStaff
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

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex flex-col justify-end sm:justify-center items-center backdrop-blur-md bg-slate-900/60 p-0 sm:p-4">
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
            className="w-12 h-12 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-[18px] transition-all active:scale-90 group"
          >
            <X className="w-6 h-6 text-slate-400 group-hover:text-slate-600" />
          </button>
        </div>

        {/* --- BODY --- */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          
          {/* 1. BILL BREAKDOWN CARD */}
          <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 space-y-6">
            <div className="flex justify-between items-end">
              <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Tổng cộng cần thu</span>
              <span className="text-4xl font-black text-slate-900 tracking-tighter">
                {currentTotal.toLocaleString()}
                <span className="text-xl ml-1 text-slate-400">đ</span>
              </span>
            </div>
            
            <div className="h-px bg-slate-50" />
            
            <BillBreakdown bill={bill} />
          </div>

          {/* 2. PAYMENT METHOD */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest ml-2">Phương thức</h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                { id: 'CASH', label: 'Tiền mặt', icon: Banknote, color: 'emerald' },
                { id: 'TRANSFER', label: 'Chuyển khoản', icon: Wallet, color: 'blue' },
                { id: 'CARD', label: 'Quẹt thẻ', icon: CreditCard, color: 'indigo' },
              ].map((method) => {
                const isActive = paymentMethod === method.id;
                return (
                  <button
                    key={method.id}
                    onClick={() => setPaymentMethod(method.id as any)}
                    className={cn(
                      "flex flex-col items-center justify-center p-5 rounded-[28px] border-2 transition-all gap-3 relative overflow-hidden group",
                      isActive 
                        ? "border-slate-900 bg-white shadow-xl shadow-slate-200 -translate-y-1" 
                        : "border-transparent bg-white hover:bg-slate-50"
                    )}
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                      isActive ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                    )}>
                      <method.icon className="w-6 h-6" />
                    </div>
                    <span className={cn(
                      "text-[11px] font-black uppercase tracking-widest",
                      isActive ? "text-slate-900" : "text-slate-400"
                    )}>{method.label}</span>
                    {isActive && (
                      <div className="absolute top-2 right-2">
                        <div className="w-2 h-2 bg-slate-900 rounded-full" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. MAIN INPUT SECTION */}
          <div className="bg-white rounded-[40px] p-8 shadow-sm border border-slate-100 space-y-8">
            <div className="space-y-4 text-center">
              <label className="text-sm font-black text-slate-400 uppercase tracking-[0.2em]">Khách thanh toán</label>
              <MoneyInput
                value={amountPaid}
                onChange={setAmountPaid}
                className="w-full"
                inputClassName="text-5xl font-black tracking-tighter text-center w-full"
                centered
              />
            </div>

            {/* STATUS INDICATOR */}
            <div className={cn(
              "p-6 rounded-[32px] flex items-center justify-between transition-all duration-500",
              balanceDiff === 0 ? "bg-slate-900 text-white shadow-lg shadow-slate-200" :
              balanceDiff > 0 ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" : 
              "bg-rose-500 text-white shadow-lg shadow-rose-200"
            )}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                  {balanceDiff === 0 ? <CheckCircle2 className="w-5 h-5" /> : 
                   balanceDiff > 0 ? <PlusCircle className="w-5 h-5" /> : 
                   <AlertTriangle className="w-5 h-5" />}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Trạng thái</p>
                  <p className="text-sm font-bold">
                    {balanceDiff === 0 ? 'Thanh toán đủ' : 
                     balanceDiff > 0 ? 'Tiền thừa trả khách' : 
                     'Khách còn thiếu (Ghi nợ)'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black tracking-tight">{Math.abs(balanceDiff).toLocaleString()}đ</p>
              </div>
            </div>

            {/* SECONDARY INPUTS */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-[24px] p-4 space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <TicketPercent className="w-3 h-3" /> Giảm giá
                </label>
                <div className="flex items-center justify-between">
                   <input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="bg-transparent border-none p-0 w-full font-black text-slate-700 focus:ring-0 text-lg"
                  />
                  <span className="text-slate-400 font-bold">đ</span>
                </div>
              </div>
              <div className="bg-slate-50 rounded-[24px] p-4 space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <PlusCircle className="w-3 h-3" /> Phụ phí
                </label>
                <div className="flex items-center justify-between">
                  <input
                    type="number"
                    value={surcharge}
                    onChange={(e) => setSurcharge(Number(e.target.value))}
                    className="bg-transparent border-none p-0 w-full font-black text-slate-700 focus:ring-0 text-lg"
                  />
                  <span className="text-slate-400 font-bold">đ</span>
                </div>
              </div>
            </div>

            {/* NOTES */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4 flex items-center gap-2">
                <MessageSquare className="w-3 h-3" /> Ghi chú {balanceDiff < 0 && <span className="text-rose-500 font-black">*</span>}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={cn(
                  "w-full bg-slate-50 border-none rounded-[28px] px-6 py-4 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-slate-200 min-h-[100px] resize-none transition-all placeholder:font-medium placeholder:text-slate-300",
                  balanceDiff < 0 && !notes.trim() && "ring-2 ring-rose-100 bg-rose-50"
                )}
                placeholder={balanceDiff < 0 ? "Bắt buộc nhập lý do nợ..." : "Ghi chú thanh toán (nếu có)..."}
              />
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 text-rose-600 p-5 rounded-[24px] flex items-center gap-3 text-sm font-bold animate-in slide-in-from-top-2 border border-rose-100">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* --- FOOTER --- */}
        <div className="p-8 bg-white border-t border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
          <button
            onClick={() => handleCheckout()}
            disabled={isProcessing}
            className={cn(
              "w-full h-16 rounded-[24px] font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98]",
              isProcessing 
                ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                : balanceDiff < 0 
                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-xl shadow-rose-600/20"
                  : "bg-slate-900 hover:bg-black text-white shadow-xl shadow-slate-900/20"
            )}
          >
            {isProcessing ? (
              <>
                <div className="w-6 h-6 border-3 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                ĐANG XỬ LÝ...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-6 h-6" />
                {balanceDiff < 0 ? 'XÁC NHẬN GHI NỢ & TRẢ PHÒNG' : 'XÁC NHẬN THANH TOÁN'}
              </>
            )}
          </button>
        </div>
      </div>

      <PinValidationModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={(staffId, staffName) => {
          setIsPinModalOpen(false);
          handleCheckout({ id: staffId, name: staffName });
        }}
        actionName={securityAction || 'checkout_discount'}
      />
    </div>,
    document.body
  );
}
