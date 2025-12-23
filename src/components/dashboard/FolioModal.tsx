'use client';

import { Room, Setting } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Receipt, CreditCard, Clock, User, Phone, Info } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { calculateRoomPrice, PricingBreakdown } from '@/lib/pricing';
import { differenceInHours, differenceInMinutes } from 'date-fns';

interface FolioModalProps {
  room: Room | null;
  settings: Setting[];
  isOpen: boolean;
  onClose: () => void;
  onPayment: (amount: number) => void;
}

export function FolioModal({ room, settings, isOpen, onClose, onPayment }: FolioModalProps) {
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState<PricingBreakdown | null>(null);
  const [duration, setDuration] = useState('');

  useEffect(() => {
    if (room?.current_booking && settings) {
      const booking = room.current_booking;
      const checkIn = new Date(booking.check_in_at);
      const now = new Date();

      const result = calculateRoomPrice(
        checkIn,
        now,
        settings,
        room.prices,
        booking.rental_type
      );
      setPricing(result);

      const hours = differenceInHours(now, checkIn);
      const minutes = differenceInMinutes(now, checkIn) % 60;
      setDuration(`${hours}h ${minutes}p`);
    }
  }, [room, settings]);

  if (!room || !room.current_booking) return null;

  const booking = room.current_booking;
  const customer = booking?.customer;

  const handlePayment = async () => {
    if (!pricing) return;
    setLoading(true);
    onPayment(pricing.total_amount);
    setLoading(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && pricing && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]"
          >
            {/* Mobile Drag Handle */}
            <div className="absolute left-1/2 top-3 h-1.5 w-12 -translate-x-1/2 rounded-full bg-zinc-200 sm:hidden" />

            <div className="flex items-center justify-between border-b border-zinc-100 p-6 pt-8 sm:pt-6">
              <div>
                <h2 className="text-2xl font-black text-zinc-900">
                  Phòng {room.room_number}
                </h2>
                <p className="text-sm font-medium text-zinc-500">Chi tiết thanh toán 2026</p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full bg-zinc-100 p-2 text-zinc-500 hover:bg-zinc-200"
              >
                <X size={24} />
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto p-6">
              <div className="space-y-6">
                {/* Customer Info */}
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Khách hàng</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-zinc-900">
                      <User size={18} className="text-zinc-400" />
                      <span className="font-bold">{customer?.full_name || 'Khách vãng lai'}</span>
                    </div>
                    {customer?.phone && (
                      <div className="flex items-center gap-3 text-zinc-500">
                        <Phone size={18} className="text-zinc-400" />
                        <span className="text-sm">{customer.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Duration & Rental Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-blue-50 p-4">
                    <div className="flex items-center gap-2 text-blue-600">
                      <Clock size={16} />
                      <span className="text-[10px] font-bold uppercase">Thời gian ở</span>
                    </div>
                    <p className="mt-1 text-2xl font-black text-blue-700">{duration}</p>
                    <p className="text-[10px] font-medium text-blue-600/60 uppercase">
                      {pricing.summary.rental_type === 'hourly' ? 'Theo giờ' : pricing.summary.rental_type === 'daily' ? 'Theo ngày' : 'Qua đêm'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <Receipt size={16} />
                      <span className="text-[10px] font-bold uppercase">Tiền phòng</span>
                    </div>
                    <p className="mt-1 text-2xl font-black text-emerald-700">
                      {formatCurrency(pricing.room_charge)}
                    </p>
                    <p className="text-[10px] font-medium text-emerald-600/60 uppercase">
                      {pricing.summary.days ? `${pricing.summary.days} ngày` : `${pricing.summary.hours} giờ`}
                    </p>
                  </div>
                </div>

                {/* Tax & Surcharge Details (2026 AI Feature) */}
                <div className="rounded-2xl border border-zinc-100 p-4 space-y-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Chi tiết thuế & Phụ thu (2026)</h3>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Phụ thu trễ giờ</span>
                    <span className="font-bold text-orange-600">+{formatCurrency(pricing.surcharge)}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-500">Thuế lưu trú</span>
                      <Info size={12} className="text-zinc-300" />
                    </div>
                    <span className="font-bold text-zinc-900">{formatCurrency(pricing.tax_details.room_tax)}</span>
                  </div>

                  <div className="pt-2 border-t border-dashed border-zinc-100 flex justify-between items-center">
                    <span className="text-sm font-medium text-zinc-500">Tiền đặt cọc</span>
                    <span className="font-bold text-rose-500">-{formatCurrency(booking.deposit_amount || 0)}</span>
                  </div>
                </div>

                {/* Final Total */}
                <div className="rounded-3xl bg-zinc-900 p-6 text-white shadow-xl shadow-zinc-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold uppercase tracking-widest opacity-50">Tổng thanh toán</span>
                    <CreditCard size={20} className="opacity-50" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black">
                      {formatCurrency(Math.max(0, pricing.total_amount - (booking.deposit_amount || 0)))}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] font-medium opacity-40 italic">
                    * Đã bao gồm thuế lưu trú và phụ thu theo quy định 2026.
                  </p>
                </div>
              </div>

              <div className="mt-8 pb-4">
                <button
                  onClick={handlePayment}
                  disabled={loading}
                  className="flex h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-xl font-black text-white shadow-lg shadow-blue-200 active:scale-[0.98] disabled:opacity-50 transition-all"
                >
                  {loading ? (
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <CreditCard size={24} />
                      THANH TOÁN NGAY
                    </>
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="mt-3 w-full py-3 text-sm font-bold text-zinc-400 hover:text-zinc-600"
                >
                  Để sau
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
