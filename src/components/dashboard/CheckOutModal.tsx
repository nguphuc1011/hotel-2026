
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  BedDouble, 
  Coffee, 
  Zap, 
  Receipt, 
  CirclePlus, 
  CircleMinus, 
  CheckCircle2, 
  Landmark, 
  Database, 
  Calendar, 
  User, 
  AlertCircle,
  Sparkles,
  ChevronDown,
  Coins,
  MessageSquare,
  CreditCard,
  Wallet,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { NumericInput } from '@/components/ui/NumericInput';
import { Room, PricingBreakdown, RentalType } from '@/types';
import { formatCurrency, formatDateTime, formatDuration } from '@/lib/utils';
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

// Helper to get rental type text
const getRentalTypeText = (rentalType: RentalType | undefined) => {
  if (!rentalType) return '';
  switch (rentalType) {
    case 'hourly': return 'Theo giờ';
    case 'daily': return 'Theo ngày';
    case 'overnight': return 'Qua đêm';
    default: return 'Không xác định';
  }
};

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
  const [taxPercent, setTaxPercent] = useState(10);
  const [note, setNote] = useState('');
  const [showServices, setShowServices] = useState(true);

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
            className="relative bg-slate-50 w-full max-w-md h-[95vh] md:h-auto md:max-h-[90vh] rounded-t-3xl md:rounded-3xl flex flex-col"
          >
            {/* Header */}
            <header className="flex-shrink-0 p-4 flex items-center justify-center relative">
              <div className="w-[60%] bg-slate-200/50 py-2 px-4 rounded-2xl text-center">
                <h2 className="font-bold text-slate-800 text-lg leading-none">Phòng {room.room_number}</h2>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">{getRentalTypeText(booking?.rental_type)}</p>
              </div>
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-200/70 flex items-center justify-center text-slate-600"
              >
                <X size={18} />
              </button>
            </header>

            {/* Body */}
            <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
              {/* Card 1: Stay Info */}
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-50">
                  <Calendar size={16} className="text-indigo-500" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Thông tin lưu trú</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Giờ vào</p>
                    <p className="font-black text-slate-700 text-sm">{formatDateTime(booking?.check_in_at, 'HH:mm')}</p>
                    <p className="text-[10px] text-slate-400">{formatDateTime(booking?.check_in_at, 'dd/MM')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Giờ ra</p>
                    <p className="font-black text-slate-700 text-sm">{formatDateTime(new Date().toISOString(), 'HH:mm')}</p>
                    <p className="text-[10px] text-slate-400">{formatDateTime(new Date().toISOString(), 'dd/MM')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Thời gian</p>
                    <p className="font-black text-indigo-600 text-sm">{pricingBreakdown?.summary?.duration_text || '...'}</p>
                  </div>
                </div>
              </div>

              {/* Card 2: Room Charge */}
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                  <BedDouble size={16} className="text-blue-500" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tiền phòng</span>
                </div>
                <div className="flex justify-between items-center">
                    <p className="text-slate-600 font-medium">Tiền phòng gốc</p>
                    <p className="font-bold text-slate-800">{formatCurrency(totalCalculations.roomCharge)}</p>
                </div>
                {pricingBreakdown?.summary && (
                  <div className="space-y-2">
                    {pricingBreakdown.summary.early_checkin_surcharge ? (
                      <div className="flex justify-between items-center text-xs bg-amber-50 p-2 rounded-lg">
                        <p className="text-amber-700 flex items-center gap-1 font-medium"><CirclePlus size={12}/> Phụ phí nhận sớm</p>
                        <p className="font-bold text-amber-700">+{formatCurrency(pricingBreakdown.summary.early_checkin_surcharge)}</p>
                      </div>
                    ) : null}
                    {pricingBreakdown.summary.late_checkout_surcharge ? (
                      <div className="flex justify-between items-center text-xs bg-amber-50 p-2 rounded-lg">
                        <p className="text-amber-700 flex items-center gap-1 font-medium"><CirclePlus size={12}/> Phụ phí trả muộn</p>
                        <p className="font-bold text-amber-700">+{formatCurrency(pricingBreakdown.summary.late_checkout_surcharge)}</p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Card 3: Services */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 flex justify-between items-center cursor-pointer" onClick={() => setShowServices(!showServices)}>
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-emerald-500" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Dịch vụ</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <p className="font-bold text-slate-800">{formatCurrency(totalCalculations.serviceCharge)}</p>
                        <ChevronDown size={18} className={cn("transition-transform text-slate-400", showServices && "rotate-180")} />
                    </div>
                </div>
                <AnimatePresence>
                  {showServices && services.length > 0 && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="px-4 pb-4 border-t border-slate-50 space-y-2 max-h-48 overflow-y-auto pt-3"
                      >
                          {services.map(s => (
                              <div key={s.id} className="flex justify-between items-center text-sm">
                                  <p className="text-slate-500 font-medium">{s.name} <span className="text-xs text-slate-400">(x{s.quantity})</span></p>
                                  <p className="font-bold text-slate-600">{formatCurrency(s.total)}</p>
                              </div>
                          ))}
                      </motion.div>
                  )}
                  {showServices && services.length === 0 && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-4 pb-4 border-t border-slate-50 pt-3"
                    >
                      <p className="text-xs text-slate-400 italic text-center">Không có dịch vụ nào</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Card 4: Payment & Method */}
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
                  <Receipt size={16} className="text-indigo-500" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Thanh toán & Phương thức</span>
                </div>
                
                {/* Discount Section */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                      <p className="text-slate-600 font-medium flex items-center gap-2 text-sm"><CircleMinus size={14} className="text-red-500"/> Giảm giá</p>
                      <NumericInput
                          value={discount}
                          onChange={setDiscount}
                          placeholder="0"
                          className="w-28 bg-red-50 rounded-lg px-3 py-2 text-right font-black text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200"
                          suffix="đ"
                      />
                  </div>
                  <AnimatePresence>
                    {discount > 0 && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <input 
                            type="text"
                            value={discountReason}
                            onChange={(e) => setDiscountReason(e.target.value)}
                            placeholder="Lý do giảm giá..."
                            className="w-full bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs italic focus:outline-none focus:ring-1 focus:ring-slate-200"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* VAT Section */}
                <div className="flex justify-between items-center py-1">
                    <div className="flex items-center gap-2">
                      <p className="text-slate-600 font-medium text-sm flex items-center gap-2"><Database size={14} className="text-blue-500"/> Thuế VAT</p>
                      <button 
                        onClick={() => setIsTaxEnabled(!isTaxEnabled)}
                        className={cn(
                          "w-10 h-5 rounded-full relative transition-colors duration-200",
                          isTaxEnabled ? "bg-blue-500" : "bg-slate-200"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-200 shadow-sm",
                          isTaxEnabled ? "left-6" : "left-1"
                        )} />
                      </button>
                    </div>
                    {isTaxEnabled && (
                      <NumericInput 
                        value={taxPercent}
                        onChange={setTaxPercent}
                        className="w-16 bg-blue-50 rounded-lg px-2 py-1 text-center font-black text-blue-600 text-sm"
                        suffix="%"
                      />
                    )}
                </div>

                {/* Deposit Section */}
                <div className="flex justify-between items-center py-1">
                    <p className="text-slate-600 font-medium text-sm flex items-center gap-2"><Coins size={14} className="text-emerald-500"/> Đã đặt cọc</p>
                    <p className="font-black text-emerald-600">-{formatCurrency(deposit)}</p>
                </div>

                {/* Payment Methods */}
                <div className="pt-2 space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Phương thức thanh toán</p>
                  <div className="grid grid-cols-3 gap-2">
                      {[
                          {id: 'cash', label: 'Tiền mặt', icon: Wallet},
                          {id: 'transfer', label: 'Chuyển khoản', icon: Landmark},
                          {id: 'card', label: 'Thẻ / POS', icon: CreditCard},
                      ].map(method => (
                          <button key={method.id} onClick={() => setPaymentMethod(method.id as any)} className={cn(
                              "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all",
                              paymentMethod === method.id 
                                ? "border-indigo-500 bg-indigo-50 text-indigo-600 shadow-sm" 
                                : "border-slate-50 bg-slate-50 text-slate-400 grayscale opacity-70"
                          )}>
                              <method.icon size={20}/>
                              <span className="text-[10px] font-black uppercase">{method.label}</span>
                          </button>
                      ))}
                  </div>
                </div>

                {/* Notes Section */}
                <div className="pt-2">
                    <p className="text-slate-600 font-medium text-sm flex items-center gap-2 mb-2"><MessageSquare size={14} className="text-slate-400"/> Ghi chú</p>
                    <textarea 
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Thêm ghi chú thanh toán..."
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-200 min-h-[60px] resize-none"
                    />
                </div>
              </div>
              
              {/* Admin Insight */}
              {isAdmin && pricingBreakdown && (
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-200/50 flex items-center justify-center text-amber-700">
                        <AlertTriangle size={16}/>
                      </div>
                      <div>
                        <p className="font-black text-amber-900 uppercase tracking-tighter">Đối soát AI</p>
                        <p className="text-amber-700 opacity-70">Dựa trên quy định khách sạn</p>
                      </div>
                    </div>
                    <div className="text-right">
                        <p className="text-amber-700 font-medium">Gợi ý: <span className="font-black text-amber-900">{formatCurrency(pricingBreakdown.total_amount)}</span></p>
                        <p className="text-amber-700 font-medium">Thực thu: <span className="font-black text-amber-900">{formatCurrency(totalCalculations.totalToCollect)}</span></p>
                    </div>
                </div>
              )}
            </main>

            {/* Sticky Footer */}
            <footer className="flex-shrink-0 p-4 bg-white border-t-2 border-slate-200 sticky bottom-0">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-slate-600 font-semibold">Tổng thu thực tế</p>
                    <p className="text-2xl font-extrabold text-indigo-600">{formatCurrency(totalCalculations.totalToCollect)}</p>
                </div>
                <button 
                    onClick={handleConfirm}
                    className="w-full h-14 bg-indigo-600 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                    XÁC NHẬN THANH TOÁN
                </button>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
