"use client";

import { Customer, Booking } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, cn } from '@/lib/utils';
import { useCustomerBalance } from '@/hooks/useCustomerBalance';
import { Sparkles, History, Wallet, MessageSquare, X, ArrowRight, Star, Clock } from 'lucide-react';

interface Props {
  customer: Customer;
  bookings: Booking[];
  onClose: () => void;
}

const daysBetween = (date1: string, date2: string) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export default function CustomerInsightsModal({ customer, bookings, onClose }: Props) {
  const { isDebt, isCredit, absFormattedBalance } = useCustomerBalance(customer.balance || 0);
  const lastCompletedBooking = bookings.find(b => b.status === 'completed');

  const daysSinceLastVisit = lastCompletedBooking?.check_out_at 
    ? daysBetween(lastCompletedBooking.check_out_at, new Date().toISOString())
    : null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/20"
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 300 }}
        className="relative z-10 w-full sm:max-w-[500px] h-[100dvh] sm:h-[95vh] sm:max-h-[850px] bg-slate-50 shadow-2xl flex flex-col sm:rounded-[3rem] overflow-hidden"
      >
        {/* Header - Glassmorphism */}
        <div className="relative h-48 w-full flex-shrink-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-8 flex items-end overflow-hidden">
          <div className="absolute top-12 left-6 z-20">
            <button 
                onClick={onClose}
                className="p-2 bg-white/10 backdrop-blur-md rounded-full text-white/80 active:scale-90 transition-transform"
            >
                <X size={20} />
            </button>
          </div>
          
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Sparkles size={120} />
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                <Sparkles size={16} className="text-white" />
              </div>
              <span className="text-xs font-black uppercase tracking-[0.2em] text-blue-100">AI Customer Insights</span>
            </div>
            <h2 className="text-3xl font-black tracking-tight mb-1">Chào mừng trở lại!</h2>
            <p className="text-blue-100 font-medium opacity-90">Hệ thống đã nhận diện được khách hàng thân thiết</p>
            {isDebt && (
              <div className="mt-2 p-2 bg-rose-500/20 rounded-lg text-white text-sm font-bold">
                Cảnh báo: Khách hàng có nợ {absFormattedBalance}
              </div>
            )}
            {isCredit && (
              <div className="mt-2 p-2 bg-emerald-500/20 rounded-lg text-white text-sm font-bold">
                Khách có tiền dư: {absFormattedBalance}
              </div>
            )}
          </div>
        </div>

        <div className="p-8">
          {/* Main Profile Info */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-slate-100 text-slate-400">
              <div className="text-3xl font-black text-blue-600">
                {customer.full_name.charAt(0)}
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 leading-tight">{customer.full_name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black text-blue-600 uppercase tracking-wider border border-blue-100">
                  Lần thứ {customer.visit_count}
                </span>
                {customer.visit_count > 5 && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black text-amber-600 uppercase tracking-wider border border-amber-100">
                    <Star size={10} fill="currentColor" /> Khách VIP
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="rounded-[2rem] bg-slate-50 p-6 border border-slate-100">
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <History size={14} />
                <span className="text-[10px] font-black uppercase tracking-wider">Lần gần nhất</span>
              </div>
              <div className="text-lg font-black text-slate-800">
                {daysSinceLastVisit !== null ? `${daysSinceLastVisit} ngày trước` : 'Đầu tiên'}
              </div>
            </div>
            <div className="rounded-[2rem] bg-slate-50 p-6 border border-slate-100">
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <Wallet size={14} />
                <span className="text-[10px] font-black uppercase tracking-wider">Tổng chi tiêu</span>
              </div>
              <div className="text-lg font-black text-emerald-600">
                {formatCurrency(customer.total_spent)}
              </div>
            </div>
          </div>

          {/* AI Observation Card */}
          <div className="mb-8 rounded-[2rem] bg-blue-50/50 p-6 border border-blue-100/50">
            <div className="flex items-center gap-2 text-blue-600 mb-4">
              <MessageSquare size={16} />
              <span className="text-[10px] font-black uppercase tracking-[0.1em]">Ghi chú & Thói quen</span>
            </div>
            <p className="text-sm font-bold text-slate-700 leading-relaxed italic">
              "{customer.notes || 'Khách hàng chưa có ghi chú đặc biệt. Hãy ghi lại sở thích của khách sau lượt ở này!'}"
            </p>
          </div>

          {/* Action Button */}
          <button
            onClick={onClose}
            className="group relative flex h-16 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-slate-900 text-base font-black text-white transition-all active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative z-10 uppercase tracking-widest">Tiếp tục phục vụ</span>
            <ArrowRight size={20} className="relative z-10 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
