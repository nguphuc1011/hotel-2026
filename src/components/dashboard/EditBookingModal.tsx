
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Clock, DollarSign, User, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import { NumericInput } from '@/components/ui/NumericInput';
import { Booking, Room, Customer } from '@/types';
import { HotelService } from '@/services/hotel';

interface EditBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: (Booking & { customer?: { full_name: string } }) | null;
  room: Room | null;
  onSave: (data: {
    check_in_at: string;
    initial_price: number;
    price_change_type: 'from_start' | 'from_today';
    customer_name: string;
  }) => Promise<void>;
}

export default function EditBookingModal({
  isOpen,
  onClose,
  booking,
  room,
  onSave
}: EditBookingModalProps) {
  const [checkInAt, setCheckInAt] = useState('');
  const [price, setPrice] = useState(0);
  const [priceChangeType, setPriceChangeType] = useState<'from_start' | 'from_today'>('from_start');
  const [customerName, setCustomerName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<Customer[]>([]);

  // Search khách hàng khi gõ tên
  useEffect(() => {
    const searchTimer = setTimeout(async () => {
      if (customerName && customerName.length >= 1 && isFocused) {
        const results = await HotelService.searchCustomers(customerName);
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    }, 300); // Debounce 300ms

    return () => clearTimeout(searchTimer);
  }, [customerName, isFocused]);

  useEffect(() => {
    if (isOpen && booking) {
      try {
        const date = booking.check_in_at ? parseISO(booking.check_in_at) : new Date();
        setCheckInAt(format(date, "yyyy-MM-dd'T'HH:mm"));
      } catch (error) {
        setCheckInAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      }
      setPrice(booking.initial_price || 0);
      setCustomerName(booking.customer?.full_name || '');
      setPriceChangeType('from_start');
    }
  }, [isOpen, booking]);

  const handleSelectCustomer = (selected: Customer) => {
    setCustomerName(selected.full_name);
    setIsFocused(false);
  };

  const handleSave = async () => {
    if (!booking) return;
    setIsSaving(true);
    try {
      await onSave({
        check_in_at: new Date(checkInAt).toISOString(),
        initial_price: price,
        price_change_type: priceChangeType,
        customer_name: customerName,
      });
      onClose();
    } catch (error) {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !booking) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <Calendar size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase">Sửa thông tin</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phòng {room?.room_number}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
            {/* Customer Name */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Tên khách hàng</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  value={customerName}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="Nhập tên khách hàng..."
                />
                
                {/* Customer Suggestions */}
                <AnimatePresence>
                  {searchResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute z-20 w-full bg-white/90 backdrop-blur-xl border border-slate-100 rounded-2xl mt-2 shadow-xl overflow-hidden divide-y divide-slate-50"
                    >
                      {searchResults.map((c: Customer) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCustomer(c)}
                          className="w-full px-4 py-3 text-left hover:bg-blue-50 flex items-center gap-3 transition-colors group"
                        >
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                            <User size={16} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm uppercase">{c.full_name}</p>
                            <p className="text-[10px] font-bold text-slate-400">{c.phone}</p>
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Check-in Time */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Thời gian vào</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                  <Clock size={18} />
                </div>
                <input
                  type="datetime-local"
                  value={checkInAt}
                  onChange={(e) => setCheckInAt(e.target.value)}
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Giá phòng</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                  <DollarSign size={18} />
                </div>
                <NumericInput
                  value={price}
                  onChange={setPrice}
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-slate-900 focus:ring-2 focus:ring-blue-500 transition-all"
                  suffix="đ"
                />
              </div>
            </div>

            {/* Price Change Type */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Áp dụng giá mới</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPriceChangeType('from_start')}
                  className={cn(
                    "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 text-center",
                    priceChangeType === 'from_start' 
                      ? "border-blue-500 bg-blue-50 text-blue-700" 
                      : "border-slate-100 bg-white text-slate-400"
                  )}
                >
                  <span className="font-black text-xs uppercase tracking-tight">Từ lúc vào</span>
                  <span className="text-[10px] font-bold opacity-60">Áp dụng cho toàn bộ bill</span>
                </button>
                <button
                  onClick={() => setPriceChangeType('from_today')}
                  className={cn(
                    "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 text-center",
                    priceChangeType === 'from_today' 
                      ? "border-blue-500 bg-blue-50 text-blue-700" 
                      : "border-slate-100 bg-white text-slate-400"
                  )}
                >
                  <span className="font-black text-xs uppercase tracking-tight">Từ hôm nay</span>
                  <span className="text-[10px] font-bold opacity-60">Tính lại giá từ thời điểm này</span>
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 bg-slate-50 border-t border-slate-100">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-blue-100 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang lưu...
                </>
              ) : (
                'Xác nhận cập nhật'
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
