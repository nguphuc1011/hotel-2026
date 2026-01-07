'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  CheckCircle2,
  Landmark,
  MessageSquare,
  CreditCard,
  Wallet,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { NumericInput } from '@/components/ui/NumericInput';
import { supabase } from '@/lib/supabase';
import { Room, PricingBreakdown } from '@/types';
import { formatCurrency, cn } from '@/lib/utils';
import { useCustomerBalance } from '@/hooks/useCustomerBalance';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

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
  actualPaid: number;
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  pricingBreakdown: PricingBreakdown | null;
  onConfirm: (data: CheckoutData) => void;
  isAdmin: boolean;
  isProcessing?: boolean;
}

export default function CheckoutModal({
  isOpen,
  onClose,
  room,
  pricingBreakdown,
  onConfirm,
  isAdmin,
  isProcessing = false,
}: CheckoutModalProps) {
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, _setDiscountReason] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<CheckoutData['paymentMethod']>('cash');
  const [isTaxEnabled, setIsTaxEnabled] = useState(false);
  const [taxPercent] = useState(10);
  const [note, setNote] = useState('');
  const [manualSurcharge, setManualSurcharge] = useState(0);
  const [_showServices, _setShowServices] = useState(true);
  const [actualPaid, setActualPaid] = useState(0);
  const [showDebtConfirm, setShowDebtConfirm] = useState(false);
  const [debtConfirmMessage, setDebtConfirmMessage] = useState('');

  const booking = room.current_booking;
  const services = booking?.services_used || [];
  const deposit = booking?.deposit_amount || 0;
  const [customerBalance, setCustomerBalance] = useState<number>(0);
  const { isDebt, _isCredit, absFormattedBalance, _label, _colorClass } =
    useCustomerBalance(customerBalance);

  // Derived discount amount
  const discount = useMemo(() => {
    if (discountType === 'amount') return discountValue;
    if (!pricingBreakdown) return 0;
    const baseForDiscount =
      (pricingBreakdown.base_price ?? pricingBreakdown.room_charge ?? 0) + 
      (pricingBreakdown.service_total ?? pricingBreakdown.service_charge ?? 0) + 
      ((pricingBreakdown.surcharge_early || 0) + (pricingBreakdown.surcharge_late || 0) + (pricingBreakdown.surcharge || 0));
    return Math.round((baseForDiscount * discountValue) / 100);
  }, [discountType, discountValue, pricingBreakdown]);

  // Fetch customer balance
  useEffect(() => {
    if (isOpen && booking?.customer_id) {
      const fetchBalance = async () => {
        const { data } = await supabase
          .from('customers')
          .select('balance')
          .eq('id', booking.customer_id)
          .single();
        if (data) setCustomerBalance(Number(data.balance || 0));
      };
      fetchBalance();
    }
  }, [isOpen, booking?.customer_id]);

  const totalCalculations = useMemo(() => {
    if (!pricingBreakdown || Object.keys(pricingBreakdown).length === 0) {
      return {
        roomCharge: 0,
        serviceCharge: 0,
        surcharges: 0,
        subTotal: 0,
        taxAmount: 0,
        totalToCollect: 0,
      };
    }

    // Single Source of Truth: Use RPC calculated total
    // RPC: total_final (hóa đơn + nợ cũ), booking_revenue (doanh thu đơn này)
    const rpcTotalToPay = Number(pricingBreakdown.total_final ?? pricingBreakdown.final_amount ?? 0);
    
    if (rpcTotalToPay === 0 && (pricingBreakdown.room_charge || pricingBreakdown.base_price)) {
        console.warn('[CheckoutModal] CẢNH BÁO: rpcTotalToPay bằng 0 dù có tiền phòng!', pricingBreakdown);
    }

    // Adjust for checkout-time modifiers
    const totalToCollect = rpcTotalToPay - discount + manualSurcharge;

    const rpcSurcharge = (Number(pricingBreakdown.early_surcharge) || 0) + (Number(pricingBreakdown.late_surcharge) || 0) + (Number(pricingBreakdown.custom_surcharge) || 0) + (Number(pricingBreakdown.surcharge) || 0);

    return {
      roomCharge: Number(pricingBreakdown.room_charge) || Number(pricingBreakdown.base_price) || 0,
      serviceCharge: Number(pricingBreakdown.service_charge) || Number(pricingBreakdown.service_total) || 0,
      surcharges: rpcSurcharge + manualSurcharge,
      subTotal: Number(pricingBreakdown.total_final ?? pricingBreakdown.booking_revenue ?? 0) - discount + manualSurcharge,
      taxAmount: (Number(pricingBreakdown.tax_details?.room_tax) || 0) + (Number(pricingBreakdown.tax_details?.service_tax) || 0),
      totalToCollect,
    };
  }, [
    pricingBreakdown,
    discount,
    manualSurcharge,
  ]);

  // Auto-update actualPaid when totalToCollect changes
  useEffect(() => {
    setActualPaid(Math.max(0, totalCalculations.totalToCollect));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCalculations.totalToCollect]);

  const performCheckout = () => {
    // Map payment method to backend code
    const paymentMethodMap: Record<string, string> = {
      cash: 'CASH',
      transfer: 'BANK_TRANSFER',
      card: 'CARD',
    };
    const backendPaymentMethod = paymentMethodMap[paymentMethod] || 'CASH';

    onConfirm({
      discount,
      discountReason,
      paymentMethod: backendPaymentMethod,
      totalToCollect: totalCalculations.totalToCollect,
      surcharge: manualSurcharge,
      isTaxEnabled,
      taxPercent,
      note,
      actualPaid,
    });
  };

  const handleConfirm = () => {
    if (isProcessing) return;

    if (actualPaid < totalCalculations.totalToCollect) {
      const currentBookingDebt = totalCalculations.totalToCollect - actualPaid;
      const totalPotentialDebt = customerBalance - currentBookingDebt;
      const customerName = booking?.customer?.full_name || 'Khách hàng';

      let message = `Khách hàng: ${customerName}\n\nCẢNH BÁO NỢ: Thanh toán thiếu ${formatCurrency(currentBookingDebt)}.`;
      if (customerBalance < 0) {
        message += `\nNợ cũ hiện tại: ${absFormattedBalance}.`;
        message += `\nTổng nợ sau khi trả phòng: ${formatCurrency(Math.abs(totalPotentialDebt))}.`;
      }
      message += `\n\nBạn có chắc chắn muốn cho khách NỢ số tiền này và hoàn tất trả phòng?`;

      setDebtConfirmMessage(message);
      setShowDebtConfirm(true);
      return;
    }

    performCheckout();
  };

  const modalVariants = {
    hidden: { opacity: 0, y: '-20%' },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: '-20%' },
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div
            key="checkout-modal-overlay"
            className="fixed inset-0 z-[10000] bg-slate-900/70 flex flex-col items-center justify-end md:justify-center"
          >
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
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="relative w-full h-full bg-slate-50 flex flex-col overflow-hidden"
            >
              {/* Header */}
              <header className="sticky top-0 bg-white border-b border-slate-100 py-4 px-6 z-30 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <button
                    onClick={onClose}
                    className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center hover:bg-slate-100 transition-colors"
                  >
                    <X size={20} className="text-slate-400" />
                  </button>
                  <div>
                    <h2 className="font-black text-xl text-slate-800 uppercase tracking-tight">
                      Thanh toán & Trả phòng
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[10px] font-black uppercase tracking-wider">
                        Phòng {room.room_number}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {pricingBreakdown?.duration_text ?? pricingBreakdown?.summary?.duration_text ?? '...'}
                      </span>
                    </div>
                  </div>
                </div>
              </header>

              {/* Body */}
              <main className="flex-1 overflow-y-auto bg-slate-50/50 p-4 md:p-6">
                {!pricingBreakdown || Object.keys(pricingBreakdown).length === 0 ?
                  <div className="flex flex-col items-center justify-center h-64 space-y-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Đang tính toán hóa đơn...</p>
                  </div>
                :
                  <div className="max-w-xl mx-auto space-y-4">
                  {/* Simplified Summary Card */}
                  <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-6 space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                            Tiền phòng
                          </span>
                          {(pricingBreakdown?.summary || pricingBreakdown?.duration_text) && (
                            <span className="text-[10px] text-slate-300 font-medium italic">
                              {pricingBreakdown.summary ? (
                                <>
                                  ({pricingBreakdown.summary.days
                                    ? `${pricingBreakdown.summary.days} ngày`
                                    : `${pricingBreakdown.summary.hours} giờ`}{' '}
                                  x {formatCurrency(pricingBreakdown.summary.base_price || 0)})
                                </>
                              ) : (
                                <>({pricingBreakdown.duration_text})</>
                              )}
                            </span>
                          )}
                        </div>
                        <span className="font-black text-slate-800 text-lg">
                          {formatCurrency(totalCalculations.roomCharge)}
                        </span>
                      </div>

                      {totalCalculations.serviceCharge + (pricingBreakdown?.surcharge || 0) > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                            Dịch vụ & Phụ thu mặc định
                          </span>
                          <span className="font-black text-slate-800 text-lg">
                            {formatCurrency(
                              totalCalculations.serviceCharge + (pricingBreakdown?.surcharge || 0)
                            )}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                          Phụ thu thêm
                        </span>
                        <NumericInput
                          value={manualSurcharge}
                          onChange={setManualSurcharge}
                          className="w-32 bg-slate-50 border-slate-100 rounded-xl px-3 h-9 text-right font-black text-slate-700 text-base"
                        />
                      </div>

                      {deposit > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-emerald-500 font-bold uppercase tracking-widest text-[10px]">
                            Đã đặt cọc
                          </span>
                          <span className="font-black text-emerald-600 text-lg">
                            -{formatCurrency(deposit)}
                          </span>
                        </div>
                      )}

                      {customerBalance !== 0 && (
                        <div className="flex justify-between items-center">
                          <span
                            className={cn(
                              'font-bold uppercase tracking-widest text-[10px]',
                              isDebt ? 'text-rose-500' : 'text-emerald-500'
                            )}
                          >
                            {isDebt ? 'Nợ cũ' : 'Tiền dư cũ'}
                          </span>
                          <span
                            className={cn(
                              'font-black text-lg',
                              isDebt ? 'text-rose-600' : 'text-emerald-600'
                            )}
                          >
                            {isDebt ? '+' : '-'}
                            {absFormattedBalance}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                            Giảm giá
                          </span>
                          <div className="flex bg-slate-100 p-0.5 rounded-lg scale-90">
                            <button
                              onClick={() => setDiscountType('amount')}
                              className={cn(
                                'px-2 py-0.5 rounded-md text-[9px] font-black transition-all',
                                discountType === 'amount'
                                  ? 'bg-white text-blue-600 shadow-sm'
                                  : 'text-slate-400'
                              )}
                            >
                              TIỀN
                            </button>
                            <button
                              onClick={() => setDiscountType('percent')}
                              className={cn(
                                'px-2 py-0.5 rounded-md text-[9px] font-black transition-all',
                                discountType === 'percent'
                                  ? 'bg-white text-blue-600 shadow-sm'
                                  : 'text-slate-400'
                              )}
                            >
                              %
                            </button>
                          </div>
                        </div>
                        <NumericInput
                          value={discountValue}
                          onChange={setDiscountValue}
                          className="w-32 bg-slate-50 border-slate-100 rounded-xl px-3 h-9 text-right font-black text-slate-700 text-base"
                          suffix={discountType === 'amount' ? '' : '%'}
                        />
                      </div>

                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                            Thuế VAT (10%)
                          </span>
                          <button
                            onClick={() => setIsTaxEnabled(!isTaxEnabled)}
                            className={cn(
                              'w-8 h-4 rounded-full relative transition-all duration-300 scale-90',
                              isTaxEnabled ? 'bg-blue-600' : 'bg-slate-200'
                            )}
                          >
                            <div
                              className={cn(
                                'absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-all duration-300',
                                isTaxEnabled && 'translate-x-4'
                              )}
                            />
                          </button>
                        </div>
                        <span
                          className={cn(
                            'font-black text-lg transition-all',
                            isTaxEnabled ? 'text-slate-800' : 'text-slate-300'
                          )}
                        >
                          {isTaxEnabled ? `+${formatCurrency(totalCalculations.taxAmount)}` : '0'}
                        </span>
                      </div>

                      <div className="pt-4 mt-1 border-t border-slate-100 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 font-black uppercase tracking-widest text-[11px]">
                            Tổng cộng
                          </span>
                          <span className="font-black text-rose-600 text-2xl">
                            {formatCurrency(totalCalculations.totalToCollect)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 font-black uppercase tracking-widest text-[11px]">
                            Khách thực trả
                          </span>
                          <div className="relative w-44">
                            <NumericInput
                              value={actualPaid}
                              onChange={setActualPaid}
                              className="w-full bg-blue-50 border-blue-100 rounded-[1.25rem] px-4 h-12 text-right font-black text-blue-600 text-xl focus:ring-4 focus:ring-blue-500/10 transition-all"
                            />
                          </div>
                        </div>

                        <AnimatePresence mode="wait">
                          {actualPaid !== totalCalculations.totalToCollect && (
                            <motion.div
                              key="settlement-diff"
                              initial={{ opacity: 0, height: 0, marginTop: 0 }}
                              animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                              exit={{ opacity: 0, height: 0, marginTop: 0 }}
                              className={cn(
                                'flex justify-between items-center p-3 rounded-2xl transition-all overflow-hidden',
                                actualPaid > totalCalculations.totalToCollect
                                  ? 'bg-emerald-50'
                                  : 'bg-rose-50'
                              )}
                            >
                              <span
                                className={cn(
                                  'font-bold uppercase tracking-widest text-[10px]',
                                  actualPaid > totalCalculations.totalToCollect
                                    ? 'text-emerald-600'
                                    : 'text-rose-600'
                                )}
                              >
                                {actualPaid > totalCalculations.totalToCollect
                                  ? 'Tiền thối lại'
                                  : 'Ghi nợ mới'}
                              </span>
                              <span
                                className={cn(
                                  'font-black text-lg',
                                  actualPaid > totalCalculations.totalToCollect
                                    ? 'text-emerald-700'
                                    : 'text-rose-700'
                                )}
                              >
                                {formatCurrency(
                                  Math.abs(actualPaid - totalCalculations.totalToCollect)
                                )}
                              </span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>

                  {/* Payment Methods */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-2">
                      <CreditCard size={12} className="text-slate-400" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Phương thức thanh toán
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {
                          id: 'cash',
                          label: 'Tiền mặt',
                          icon: Wallet,
                          color: 'amber',
                          activeClass: 'bg-amber-50 border-amber-200 shadow-amber-100',
                          iconClass: 'bg-amber-500',
                          textClass: 'text-amber-600',
                        },
                        {
                          id: 'transfer',
                          label: 'Chuyển khoản',
                          icon: Landmark,
                          color: 'blue',
                          activeClass: 'bg-blue-50 border-blue-200 shadow-blue-100',
                          iconClass: 'bg-blue-500',
                          textClass: 'text-blue-600',
                        },
                        {
                          id: 'card',
                          label: 'Thẻ / POS',
                          icon: CreditCard,
                          color: 'indigo',
                          activeClass: 'bg-indigo-50 border-indigo-200 shadow-indigo-100',
                          iconClass: 'bg-indigo-500',
                          textClass: 'text-indigo-600',
                        },
                      ].map((method) => (
                        <button
                          key={method.id}
                          onClick={() => setPaymentMethod(method.id as any)}
                          className={cn(
                            'group relative flex flex-col items-center gap-2 p-4 rounded-[2rem] transition-all border-2',
                            paymentMethod === method.id
                              ? `${method.activeClass} shadow-xl scale-105`
                              : 'bg-white border-slate-100 hover:border-slate-200 text-slate-400'
                          )}
                        >
                          <div
                            className={cn(
                              'w-10 h-10 rounded-2xl flex items-center justify-center transition-all',
                              paymentMethod === method.id
                                ? `${method.iconClass} text-white shadow-lg shadow-${method.color}-200`
                                : 'bg-slate-50 text-slate-300 group-hover:bg-slate-100'
                            )}
                          >
                            <method.icon size={20} />
                          </div>
                          <span
                            className={cn(
                              'text-[9px] font-black uppercase tracking-wider',
                              paymentMethod === method.id ? method.textClass : 'text-slate-400'
                            )}
                          >
                            {method.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Note Section - Moved to Bottom */}
                  <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-2">
                      <MessageSquare size={14} /> Ghi chú trả phòng
                    </label>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Thêm ghi chú nếu cần..."
                      className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500/10 placeholder:text-slate-300"
                    />
                  </div>
                </div>
              }
            </main>

              {/* Footer */}
              <footer className="sticky bottom-0 bg-white border-t border-slate-100 p-6 z-30 flex gap-4 shrink-0">
                <button
                  onClick={handleConfirm}
                  disabled={isProcessing}
                  className={cn(
                    'flex-1 h-16 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 transition-all active:scale-[0.98] group disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {isProcessing ? (
                    <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 size={24} className="text-emerald-400" />
                  )}
                  <span>{isProcessing ? 'Đang xử lý...' : 'Hoàn tất trả phòng'}</span>
                  {!isProcessing && (
                    <ArrowRight
                      size={20}
                      className="opacity-40 group-hover:translate-x-1 transition-transform"
                    />
                  )}
                </button>
              </footer>

              {/* Admin Bar - Optional overlay at bottom */}
              {isAdmin && pricingBreakdown && (
                <div className="bg-amber-900 text-amber-100 px-4 py-1.5 flex justify-between items-center text-[10px] font-bold tracking-tight">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle size={10} /> ĐỐI SOÁT AI:
                  </span>
                  <div className="flex gap-4">
                    <span>Gợi ý: {formatCurrency(pricingBreakdown.total_amount)}</span>
                    <span>
                      Chênh lệch:{' '}
                      {formatCurrency(
                        totalCalculations.totalToCollect - pricingBreakdown.total_amount
                      )}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={showDebtConfirm}
        title="Xác nhận nợ"
        description={debtConfirmMessage}
        confirmText="Xác nhận cho nợ"
        cancelText="Hủy"
        variant="danger"
        isProcessing={isProcessing}
        onConfirm={() => {
          setShowDebtConfirm(false);
          performCheckout();
        }}
        onCancel={() => setShowDebtConfirm(false)}
      />
    </>
  );
}
