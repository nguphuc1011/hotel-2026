'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Phone, CreditCard, Clock, Calendar, Moon, Save, MessageSquare } from 'lucide-react';
import { Room, TimeRules } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';
import { suggestRentalType } from '@/lib/pricing';

interface CheckInModalProps {
  room: Room;
  timeRules?: TimeRules;
  onClose: () => void;
  onConfirm: (data: any) => void;
}

export function CheckInModal({ room, timeRules, onClose, onConfirm }: CheckInModalProps) {
  const [type, setType] = useState<'hourly' | 'daily' | 'overnight'>(() => {
    if (timeRules) {
      return suggestRentalType(new Date(), timeRules);
    }
    return 'hourly';
  });
  const [customer, setCustomer] = useState({ name: '', phone: '', idCard: '' });
  const [deposit, setDeposit] = useState<number>(0);
  const [note, setNote] = useState('');

  // Auto-suggest overnight logic on mount or when timeRules changes
  useEffect(() => {
    if (timeRules) {
      setType(suggestRentalType(new Date(), timeRules));
    }
  }, [timeRules]);

  // Calculate estimated price based on current selection (simplified preview)
  const currentPrice = type === 'hourly' ? (room.prices?.hourly || 0) : 
                      type === 'daily' ? (room.prices?.daily || 0) : 
                      (room.prices?.overnight || 0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        />

        {/* Modal Content - Slide Up Drawer */}
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative z-10 w-full max-w-2xl overflow-hidden rounded-t-[32px] bg-white shadow-2xl sm:rounded-[32px]"
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.2}
          onDragEnd={(e, { offset, velocity }) => {
            if (offset.y > 200 || velocity.y > 500) {
              onClose();
            }
          }}
        >
          {/* Mobile Drag Handle */}
          <div className="absolute left-1/2 top-3 h-1.5 w-12 -translate-x-1/2 rounded-full bg-zinc-200 sm:hidden" />

          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-100 p-6 pt-8 sm:pt-6">
            <div>
              <h2 className="text-2xl font-black text-zinc-900">
                Nhận phòng {room.room_number}
              </h2>
              <p className="text-sm text-zinc-500">{room.room_type} • {room.area}</p>
            </div>
            <button 
              onClick={onClose}
              className="hidden rounded-full bg-zinc-100 p-2 text-zinc-500 hover:bg-zinc-200 sm:block"
            >
              <X size={20} />
            </button>
          </div>

          <div className="max-h-[80vh] overflow-y-auto p-6">
            <div className="grid gap-8">
              {/* Type Selection */}
              <div className="grid grid-cols-3 gap-4">
                <TypeOption 
                  active={type === 'hourly'} 
                  onClick={() => setType('hourly')} 
                  icon={Clock} 
                  label="Theo giờ" 
                  color="blue"
                />
                <TypeOption 
                  active={type === 'daily'} 
                  onClick={() => setType('daily')} 
                  icon={Calendar} 
                  label="Theo ngày" 
                  color="indigo"
                />
                <TypeOption 
                  active={type === 'overnight'} 
                  onClick={() => setType('overnight')} 
                  icon={Moon} 
                  label="Qua đêm" 
                  color="purple"
                />
              </div>

              {/* Price Preview Box */}
              <div className="rounded-2xl bg-zinc-50 p-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-500">Đơn giá dự kiến</span>
                  <span className="text-3xl font-black tracking-tight text-zinc-900">
                    {formatCurrency(currentPrice)}
                  </span>
                </div>
              </div>

              {/* Customer & Deposit Inputs - Mobile Friendly (larger inputs) */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Thông tin khách & Đặt cọc</h3>
                <div className="grid gap-4">
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                    <input
                      type="text"
                      placeholder="Tên khách hàng"
                      value={customer.name}
                      onChange={e => setCustomer({...customer, name: e.target.value})}
                      className="h-14 w-full rounded-2xl border-0 bg-zinc-100 pl-12 pr-4 text-lg font-medium text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                      <input
                        type="tel"
                        placeholder="Số điện thoại"
                        value={customer.phone}
                        onChange={e => setCustomer({...customer, phone: e.target.value})}
                        className="h-14 w-full rounded-2xl border-0 bg-zinc-100 pl-12 pr-4 text-lg font-medium text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="relative">
                      <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                      <input
                        type="text"
                        placeholder="CMND / CCCD"
                        value={customer.idCard}
                        onChange={e => setCustomer({...customer, idCard: e.target.value})}
                        className="h-14 w-full rounded-2xl border-0 bg-zinc-100 pl-12 pr-4 text-lg font-medium text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="relative">
                    <Save className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                    <input
                      type="number"
                      placeholder="Tiền đặt cọc (VNĐ)"
                      value={deposit || ''}
                      onChange={e => setDeposit(Number(e.target.value))}
                      className="h-14 w-full rounded-2xl border-0 bg-zinc-100 pl-12 pr-4 text-lg font-bold text-blue-600 placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="relative">
                    <MessageSquare className="absolute left-4 top-4 text-zinc-400" size={20} />
                    <textarea
                      placeholder="Ghi chú thêm..."
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      className="h-24 w-full rounded-2xl border-0 bg-zinc-100 pl-12 pr-4 pt-4 text-lg font-medium text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons - Large Touch Targets */}
              <div className="grid gap-3 pt-4 sm:grid-cols-2">
                <button
                  onClick={onClose}
                  className="h-14 w-full rounded-2xl border-2 border-zinc-100 bg-white text-lg font-bold text-zinc-600 hover:bg-zinc-50"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={() => onConfirm({
                    rentalType: type,
                    price: currentPrice,
                    deposit,
                    customer,
                    note
                  })}
                  className="h-14 w-full rounded-2xl bg-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-[0.98]"
                >
                  Xác nhận (F10)
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function TypeOption({ active, onClick, icon: Icon, label, color }: any) {
  const colorStyles: any = {
    blue: "bg-blue-50 text-blue-600 ring-blue-500",
    indigo: "bg-indigo-50 text-indigo-600 ring-indigo-500",
    purple: "bg-purple-50 text-purple-600 ring-purple-500",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-2xl p-4 transition-all duration-200",
        active 
          ? `ring-2 ${colorStyles[color]} shadow-sm` 
          : "bg-white hover:bg-zinc-50"
      )}
    >
      <div className={cn(
        "flex h-12 w-12 items-center justify-center rounded-xl",
        active ? "bg-white/50" : "bg-zinc-100"
      )}>
        <Icon size={24} className={active ? "text-current" : "text-zinc-500"} />
      </div>
      <span className={cn(
        "text-sm font-bold",
        active ? "text-current" : "text-zinc-600"
      )}>
        {label}
      </span>
    </button>
  );
}
