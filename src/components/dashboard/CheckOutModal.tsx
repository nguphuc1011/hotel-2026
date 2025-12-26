
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  BedDouble, 
  Clock, 
  ArrowRight, 
  Sparkles, 
  Coins, 
  Receipt, 
  MinusCircle, 
  PlusCircle,
  CreditCard,
  Landmark,
  Wallet,
  MessageSquare,
  AlertTriangle,
  ChevronDown
} from 'lucide-react';
import { Room, PricingBreakdown, RentalType } from '@/types';
import { formatCurrency, formatDateTime, formatDuration } from '@/lib/utils';
import { cn } from '@/lib/utils';

// New interfaces aligned with the new design
export interface CheckoutData {
  discount: number;
  discountReason: string;
  paymentMethod: 'cash' | 'transfer' | 'card';
  finalAmount: number; // The actual collected amount
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  pricingBreakdown: PricingBreakdown | null;
  onConfirm: (data: CheckoutData) => void;
  isAdmin: boolean; // To show admin-specific info
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
        totalToCollect: 0,
      };
    }

    const roomCharge = pricingBreakdown.room_charge;
    const serviceCharge = pricingBreakdown.service_charge;
    const surcharges = pricingBreakdown.surcharge;
    
    const subTotal = roomCharge + serviceCharge + surcharges;
    const totalAfterDiscount = subTotal - discount;
    const totalToCollect = totalAfterDiscount - deposit;

    return {
      roomCharge,
      serviceCharge,
      surcharges,
      subTotal,
      totalToCollect,
    };
  }, [pricingBreakdown, discount, deposit]);
  
  const handleConfirm = () => {
    onConfirm({
      discount,
      discountReason,
      paymentMethod,
      note,
      finalAmount: totalCalculations.totalToCollect,
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
            <header className="flex-shrink-0 p-4 flex items-center justify-center relative border-b border-slate-200">
              <div className="text-center">
                <h2 className="font-bold text-slate-800 text-lg">Phòng {room.room_number}</h2>
                <p className="text-xs font-semibold text-slate-500">{getRentalTypeText(booking?.rental_type)}</p>
              </div>
              <button
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-200/70 flex items-center justify-center text-slate-600"
              >
                <X size={18} />
              </button>
            </header>

            {/* Body */}
            <main className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Stay Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-200/80">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-slate-500">Giờ vào</p>
                    <p className="font-bold text-slate-700 text-sm">{formatDateTime(booking?.check_in_at, 'HH:mm')}</p>
                     <p className="text-[10px] text-slate-400">{formatDateTime(booking?.check_in_at, 'dd/MM')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Giờ ra</p>
                    <p className="font-bold text-slate-700 text-sm">{formatDateTime(new Date().toISOString(), 'HH:mm')}</p>
                    <p className="text-[10px] text-slate-400">{formatDateTime(new Date().toISOString(), 'dd/MM')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Tổng thời gian</p>
                    <p className="font-bold text-slate-700 text-sm">{pricingBreakdown?.summary.duration_text || '...'}</p>
                  </div>
                </div>
              </div>

              {/* Room Charge Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-2">
                 <div className="flex justify-between items-center">
                    <p className="text-slate-600 font-medium flex items-center gap-2"><BedDouble size={16} className="text-blue-500"/> Tiền phòng</p>
                    <p className="font-bold text-slate-800">{formatCurrency(totalCalculations.roomCharge)}</p>
                </div>
                {pricingBreakdown?.surcharge_details && pricingBreakdown.surcharge_details.length > 0 && (
                    <div className="pl-6 space-y-1">
                    {pricingBreakdown.surcharge_details.map((s, i) => (
                        <div key={i} className="flex justify-between items-center text-xs">
                            <p className="text-amber-600 flex items-center gap-1"><PlusCircle size={12}/> {s.reason}</p>
                            <p className="font-semibold text-amber-700">+{formatCurrency(s.amount)}</p>
                        </div>
                    ))}
                    </div>
                )}
              </div>

              {/* Services Card */}
              {services.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200/80">
                    <div className="p-4 flex justify-between items-center cursor-pointer" onClick={() => setShowServices(!showServices)}>
                        <p className="text-slate-600 font-medium flex items-center gap-2"><Sparkles size={16} className="text-green-500"/> Dịch vụ</p>
                        <div className="flex items-center gap-3">
                            <p className="font-bold text-slate-800">{formatCurrency(totalCalculations.serviceCharge)}</p>
                            <ChevronDown size={18} className={cn("transition-transform", showServices && "rotate-180")} />
                        </div>
                    </div>
                    {showServices && (
                        <div className="px-4 pb-4 border-t border-slate-100 space-y-2 max-h-32 overflow-y-auto">
                            {services.map(s => (
                                <div key={s.id} className="flex justify-between items-center text-sm">
                                    <p className="text-slate-500">{s.name} <span className="text-xs">(x{s.quantity})</span></p>
                                    <p className="font-semibold text-slate-600">{formatCurrency(s.total)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
              )}

              {/* Payment Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex justify-between items-center">
                    <p className="text-slate-600 font-medium flex items-center gap-2"><MinusCircle size={16} className="text-red-500"/> Giảm giá</p>
                    <input 
                        type="number"
                        inputMode="decimal"
                        value={discount || ''}
                        onChange={(e) => setDiscount(Number(e.target.value))}
                        placeholder="0"
                        className="w-28 bg-slate-100 rounded-md px-2 py-1 text-right font-bold text-red-600 focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                </div>
                 <div className="flex justify-between items-center">
                    <p className="text-slate-600 font-medium flex items-center gap-2"><Coins size={16} className="text-emerald-500"/> Đã cọc</p>
                    <p className="font-bold text-emerald-600">-{formatCurrency(deposit)}</p>
                </div>
              </div>
              
              {/* Payment Method */}
              <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-3">
                <p className="text-slate-600 font-medium flex items-center gap-2"><CreditCard size={16} className="text-indigo-500"/> Phương thức</p>
                <div className="grid grid-cols-3 gap-2">
                    {[
                        {id: 'cash', label: 'Tiền mặt', icon: Wallet},
                        {id: 'transfer', label: 'Chuyển khoản', icon: Landmark},
                        {id: 'card', label: 'Thẻ', icon: CreditCard},
                    ].map(method => (
                        <button key={method.id} onClick={() => setPaymentMethod(method.id as any)} className={cn(
                            "flex flex-col items-center justify-center gap-1 p-2 rounded-lg border-2 transition-all",
                            paymentMethod === method.id ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-transparent bg-slate-100 text-slate-500"
                        )}>
                            <method.icon size={20}/>
                            <span className="text-xs font-bold">{method.label}</span>
                        </button>
                    ))}
                </div>
              </div>

              {/* Admin Insight */}
              {isAdmin && pricingBreakdown && (
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg flex items-center justify-between text-xs">
                    <p className="font-bold text-yellow-800 flex items-center gap-2"><AlertTriangle size={14}/> Đối soát AI</p>
                    <div className="text-right">
                        <p className="text-yellow-700">Gợi ý: <span className="font-bold">{formatCurrency(pricingBreakdown.total_amount)}</span></p>
                        <p className="text-yellow-700">Thực thu: <span className="font-bold">{formatCurrency(totalCalculations.totalToCollect)}</span></p>
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
