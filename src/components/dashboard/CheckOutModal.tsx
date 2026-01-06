
'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Receipt, 
  CircleMinus, 
  CheckCircle2, 
  Landmark, 
  Sparkles,
  MessageSquare,
  CreditCard,
  Wallet,
  AlertTriangle,
  Clock,
  ArrowRight
} from 'lucide-react';
import { NumericInput } from '@/components/ui/NumericInput';
import { Room, PricingBreakdown } from '@/types';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

// New interfaces aligned with the new design
export interface CheckoutData {
  discount: number;
  discountReason: string;
  paymentMethod: 'cash' | 'transfer' | 'card';
  totalToCollect: number;
  surcharge: number;
  isTaxEnabled: boolean;
  taxPercent: number;
  note: string;
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  pricingBreakdown: PricingBreakdown | null;
  onConfirm: (data: CheckoutData) => void;
  isAdmin: boolean;
}

export default function CheckoutModal({
  isOpen,
  onClose,
  room,
  pricingBreakdown,
  onConfirm,
  isAdmin,
}: CheckoutModalProps) {
  const [discount, setDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [isTaxEnabled, setIsTaxEnabled] = useState(false);
  const [taxPercent] = useState(10);
  const [note, setNote] = useState('');

  const booking = room.current_booking;
  const services = booking?.services_used || [];
  const deposit = booking?.deposit_amount || 0;

  const totalCalculations = useMemo(() => {
    if (!pricingBreakdown) {
      return {
        roomCharge: 0,
        serviceCharge: 0,
        surcharges: 0,
        subTotal: 0,
        taxAmount: 0,
        totalToCollect: 0,
      };
    }

    const roomCharge = pricingBreakdown.room_charge;
    const serviceCharge = pricingBreakdown.service_charge;
    const surcharges = pricingBreakdown.surcharge;
    
    const subTotal = roomCharge + serviceCharge + surcharges - discount;
    const taxAmount = isTaxEnabled ? (subTotal * taxPercent / 100) : 0;
    const totalToCollect = subTotal + taxAmount - deposit;

    return {
      roomCharge,
      serviceCharge,
      surcharges,
      subTotal,
      taxAmount,
      totalToCollect,
    };
  }, [pricingBreakdown, discount, deposit, isTaxEnabled, taxPercent]);
  
  const handleConfirm = () => {
    onConfirm({
      discount,
      discountReason,
      paymentMethod,
      totalToCollect: totalCalculations.totalToCollect,
      surcharge: totalCalculations.surcharges,
      isTaxEnabled,
      taxPercent,
      note,
    });
  };

  const modalVariants = {
    hidden: { opacity: 0, y: "-20%" },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: "-20%" },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-900/70 flex flex-col items-center justify-end md:justify-center">
          <motion.div
            key="checkout-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            onClick={onClose}
          />

          <motion.div
            key="checkout-modal"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="relative w-full h-full bg-slate-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <header className="sticky top-0 bg-white border-b border-slate-100 py-3 px-4 z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button 
                  onClick={onClose} 
                  className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center hover:bg-slate-100 transition-colors"
                >
                  <X size={18} className="text-slate-400" />
                </button>
                <div>
                  <h2 className="font-black text-lg text-slate-800 uppercase tracking-tight">Trả phòng</h2>
                  <p className="text-indigo-600 font-bold text-[10px] tracking-[0.1em] uppercase">
                    Phòng {room.room_number} • {pricingBreakdown?.summary?.duration_text || '...'}
                  </p>
                </div>
              </div>
              
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Tổng thu thực tế</p>
                <p className="text-xl font-black text-indigo-600 leading-none">{formatCurrency(totalCalculations.totalToCollect)}</p>
              </div>
            </header>

            {/* Body */}
            <main className="flex-1 overflow-hidden flex flex-col md:flex-row p-3 gap-3 bg-slate-50/50">
              {/* Left Column: Summary & Services */}
              <div className="flex-1 flex flex-col gap-3 min-h-0">
                {/* Stay Summary Card */}
                <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 shrink-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                        <Clock size={10}/> Thời gian lưu trú
                      </p>
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <span>{formatDateTime(booking?.check_in_at, 'HH:mm dd/MM')}</span>
                        <ArrowRight size={12} className="text-slate-300"/>
                        <span>{formatDateTime(new Date().toISOString(), 'HH:mm dd/MM')}</span>
                      </div>
                    </div>
                    <div className="text-right space-y-1 border-l border-slate-50 pl-4">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Tiền phòng</p>
                      <p className="font-black text-slate-800">{formatCurrency(totalCalculations.roomCharge)}</p>
                    </div>
                  </div>
                  
                  {/* Quick Surcharge Badges */}
                  {(pricingBreakdown?.summary?.early_checkin_surcharge || pricingBreakdown?.summary?.late_checkout_surcharge) && (
                    <div className="mt-2 pt-2 border-t border-slate-50 flex flex-wrap gap-2">
                      {pricingBreakdown?.summary?.early_checkin_surcharge ? (
                        <span className="text-[9px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100">
                          Sớm: +{formatCurrency(pricingBreakdown.summary.early_checkin_surcharge)}
                        </span>
                      ) : null}
                      {pricingBreakdown?.summary?.late_checkout_surcharge ? (
                        <span className="text-[9px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100">
                          Muộn: +{formatCurrency(pricingBreakdown.summary.late_checkout_surcharge)}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Services List - Scrollable */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden min-h-[150px]">
                  <div className="p-2 px-3 border-b border-slate-50 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-emerald-500" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dịch vụ & Phụ thu</span>
                    </div>
                    <p className="text-xs font-black text-slate-800">{formatCurrency(totalCalculations.serviceCharge + totalCalculations.surcharges)}</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {services.length > 0 ? (
                      services.map((s, idx) => (
                        <div key={s.id || `service-${idx}`} className="flex justify-between items-center py-1.5 px-2 hover:bg-slate-50 rounded-lg transition-colors">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                              {s.quantity}
                            </div>
                            <p className="text-xs text-slate-600 font-medium">{s.name}</p>
                          </div>
                          <p className="text-xs font-bold text-slate-600">{formatCurrency(s.total)}</p>
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex items-center justify-center italic text-[10px] text-slate-300">
                        Chưa có dịch vụ nào
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Payment Controls */}
              <div className="w-full md:w-[320px] flex flex-col gap-3 shrink-0">
                {/* Adjustments Card */}
                <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                    <Receipt size={14} className="text-indigo-500" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Điều chỉnh & Thuế</span>
                  </div>
                  
                  {/* Discount */}
                  <div className="flex justify-between items-center gap-2">
                    <div className="shrink-0">
                      <p className="text-[11px] text-slate-600 font-bold flex items-center gap-1.5">
                        <CircleMinus size={12} className="text-red-500"/> Giảm giá
                      </p>
                    </div>
                    <NumericInput
                      value={discount}
                      onChange={setDiscount}
                      className="w-24 bg-red-50/50 rounded-lg px-2 py-1.5 text-right font-black text-red-600 text-xs focus:ring-1 focus:ring-red-200"
                      suffix="đ"
                    />
                  </div>
                  {discount > 0 && (
                    <input 
                      type="text"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      placeholder="Lý do giảm..."
                      className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-[10px] focus:ring-1 focus:ring-slate-200"
                    />
                  )}

                  {/* VAT & Deposit Row */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className={cn(
                      "p-2 rounded-lg border transition-all cursor-pointer flex flex-col gap-1",
                      isTaxEnabled ? "bg-blue-50 border-blue-100" : "bg-slate-50 border-slate-100"
                    )} onClick={() => setIsTaxEnabled(!isTaxEnabled)}>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">VAT</p>
                      <div className="flex items-center justify-between">
                        <span className={cn("text-xs font-black", isTaxEnabled ? "text-blue-600" : "text-slate-400")}>
                          {isTaxEnabled ? `${taxPercent}%` : 'Tắt'}
                        </span>
                        <div className={cn("w-3 h-3 rounded-full", isTaxEnabled ? "bg-blue-500" : "bg-slate-300")} />
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 flex flex-col gap-1">
                      <p className="text-[9px] font-bold text-emerald-600/70 uppercase">Đã cọc</p>
                      <p className="text-xs font-black text-emerald-600">{formatCurrency(deposit)}</p>
                    </div>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Thanh toán bằng</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      {id: 'cash', label: 'Tiền mặt', icon: Wallet},
                      {id: 'transfer', label: 'C.Khoản', icon: Landmark},
                      {id: 'card', label: 'Thẻ/POS', icon: CreditCard},
                    ].map(method => (
                      <button 
                        key={method.id} 
                        onClick={() => setPaymentMethod(method.id as any)} 
                        className={cn(
                          "flex flex-col items-center justify-center gap-1.5 p-2 rounded-lg border-2 transition-all",
                          paymentMethod === method.id 
                            ? "border-indigo-500 bg-indigo-50 text-indigo-600" 
                            : "border-slate-50 bg-slate-50 text-slate-400"
                        )}
                      >
                        <method.icon size={16}/>
                        <span className="text-[9px] font-black uppercase whitespace-nowrap">{method.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Note */}
                <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 flex items-center gap-2">
                  <MessageSquare size={14} className="text-slate-400 shrink-0"/>
                  <input 
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ghi chú nhanh..."
                    className="flex-1 bg-transparent text-xs focus:outline-none"
                  />
                </div>

                {/* Confirm Button */}
                <button 
                  onClick={handleConfirm}
                  className="w-full h-12 bg-indigo-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200"
                >
                  <CheckCircle2 size={18} />
                  XÁC NHẬN TRẢ PHÒNG
                </button>
              </div>
            </main>

            {/* Admin Bar - Optional overlay at bottom */}
            {isAdmin && pricingBreakdown && (
              <div className="bg-amber-900 text-amber-100 px-4 py-1.5 flex justify-between items-center text-[10px] font-bold tracking-tight">
                <span className="flex items-center gap-1.5"><AlertTriangle size={10}/> ĐỐI SOÁT AI:</span>
                <div className="flex gap-4">
                  <span>Gợi ý: {formatCurrency(pricingBreakdown.total_amount)}</span>
                  <span>Chênh lệch: {formatCurrency(totalCalculations.totalToCollect - pricingBreakdown.total_amount)}</span>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
