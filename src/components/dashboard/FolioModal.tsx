'use client';

import { Room, TimeRules } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Receipt, CreditCard, Clock, Calendar, User, Phone } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { PricingLogic } from '@/lib/pricing';
import { differenceInHours, differenceInMinutes } from 'date-fns';

interface FolioModalProps {
  room: Room | null;
  timeRules?: TimeRules;
  isOpen: boolean;
  onClose: () => void;
  onPayment: (amount: number) => void;
}

export function FolioModal({ room, timeRules, isOpen, onClose, onPayment }: FolioModalProps) {
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState({ price: 0, note: '' });
  const [duration, setDuration] = useState('');

  useEffect(() => {
    if (room?.current_booking && timeRules) {
      const result = PricingLogic.calculate(room.current_booking, room, timeRules);
      setPricing(result);

      const start = new Date(room.current_booking.check_in_at);
      const now = new Date();
      const hours = differenceInHours(now, start);
      const minutes = differenceInMinutes(now, start) % 60;
      setDuration(`${hours}h ${minutes}p`);
    }
  }, [room, timeRules]);

  if (!room) return null;

  const handlePayment = async () => {
    setLoading(true);
    // Logic will be handled in parent via onPayment
    onPayment(pricing.price);
    setLoading(false);
    onClose();
  };

  const booking = room.current_booking;
  const customer = booking?.customer;

  return (
    <AnimatePresence>
      {isOpen && (
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
                <p className="text-sm font-medium text-zinc-500">Quản lý thanh toán</p>
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
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400">Khách hàng</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-zinc-900">
                      <User size={18} className="text-zinc-400" />
                      <span className="font-bold">{customer?.full_name || 'Khách vãng lai'}</span>
                    </div>
                    {customer?.phone && (
                      <div className="flex items-center gap-3 text-zinc-500">
                        <Phone size={18} className="text-zinc-400" />
                        <span>{customer.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pricing Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-blue-50 p-4">
                    <div className="flex items-center gap-2 text-blue-600">
                      <Clock size={16} />
                      <span className="text-xs font-bold uppercase">Thời gian</span>
                    </div>
                    <p className="mt-1 text-2xl font-black text-blue-700">
                      {duration}
                    </p>
                    <p className="text-[10px] font-medium text-blue-600/60 uppercase">
                      {booking?.rental_type === 'hourly' ? 'Theo giờ' : booking?.rental_type === 'daily' ? 'Theo ngày' : 'Qua đêm'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <Receipt size={16} />
                      <span className="text-xs font-bold uppercase">Tạm tính</span>
                    </div>
                    <p className="mt-1 text-2xl font-black text-emerald-700">
                      {formatCurrency(pricing.price)}
                    </p>
                    <p className="text-[10px] font-medium text-emerald-600/60 uppercase">
                      {pricing.note}
                    </p>
                  </div>
                </div>

                {/* Deposit & Prepayments */}
                {(booking?.deposit_amount || 0) > 0 && (
                  <div className="flex items-center justify-between rounded-2xl border-2 border-dashed border-zinc-100 p-4">
                    <span className="text-sm font-medium text-zinc-500">Tiền đặt cọc đã nhận</span>
                    <span className="font-bold text-rose-500">-{formatCurrency(booking?.deposit_amount || 0)}</span>
                  </div>
                )}

                {/* Final Amount */}
                <div className="rounded-2xl bg-zinc-900 p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-400">Tổng thanh toán</span>
                    <span className="text-3xl font-black tracking-tight text-white">
                      {formatCurrency(Math.max(0, pricing.price - (booking?.deposit_amount || 0)))}
                    </span>
                  </div>
                </div>

                {/* Action Button */}
                <button
                  onClick={handlePayment}
                  disabled={loading}
                  className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-blue-600 p-4 text-lg font-bold text-white transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <>
                      <CreditCard size={24} />
                      Xác nhận thanh toán
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
