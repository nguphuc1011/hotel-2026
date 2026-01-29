'use client';

import React, { useEffect, useState } from 'react';
import { 
  Banknote, 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownRight, 
  Plus, 
  Calendar as CalendarIcon,
  Filter,
  Search,
  User,
  Clock,
  History,
  FileText,
  Users,
  FileWarning
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { customerService } from '@/services/customerService';
import { cashFlowService, CashFlowTransaction, Wallet } from '@/services/cashFlowService';
import TransactionModal from '../cash-flow/components/TransactionModal';
import BookingHistoryModal from '../cash-flow/components/BookingHistoryModal';
import CustomerDebtModal from '../cash-flow/components/CustomerDebtModal';
import ExternalDebtModal from '../cash-flow/components/ExternalDebtModal';
import { formatMoney } from '@/utils/format';
import { cn } from '@/lib/utils';
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, setHours, setMinutes, isSameDay } from 'date-fns';

// Định nghĩa các ca làm việc
const SHIFTS = [
  { id: 'ALL', label: 'Cả ngày', start: 0, end: 24 },
  { id: 'MORNING', label: 'Ca Sáng (6h-14h)', start: 6, end: 14 },
  { id: 'AFTERNOON', label: 'Ca Chiều (14h-22h)', start: 14, end: 22 },
  { id: 'NIGHT', label: 'Ca Đêm (22h-6h)', start: 22, end: 30 }, // 30 = 6h sáng hôm sau (xử lý logic riêng)
];

// Định nghĩa các khoảng thời gian nhanh
const QUICK_RANGES = [
  { id: 'TODAY', label: 'Hôm nay' },
  { id: 'YESTERDAY', label: 'Hôm qua' },
  { id: 'WEEK', label: '7 ngày qua' },
  { id: 'MONTH', label: 'Tháng này' },
];

export default function MoneyPage() {
  const [transactions, setTransactions] = useState<CashFlowTransaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [historyModal, setHistoryModal] = useState<{ open: boolean; bookingId: string | null }>({
    open: false,
    bookingId: null
  });

  const [customerDebt, setCustomerDebt] = useState(0);
  const [externalDebt, setExternalDebt] = useState(0);
  const [isCustomerDebtModalOpen, setIsCustomerDebtModalOpen] = useState(false);
  const [isExternalDebtModalOpen, setIsExternalDebtModalOpen] = useState(false);
  
  // Filter States
  const [rangeType, setRangeType] = useState('TODAY');
  const [shiftId, setShiftId] = useState('ALL');
  const [dateRange, setDateRange] = useState({
    start: startOfDay(new Date()),
    end: endOfDay(new Date())
  });

  // Balance Stats
  const [balanceStats, setBalanceStats] = useState({
    cash: { opening: 0, in: 0, out: 0, closing: 0 },
    bank: { opening: 0, in: 0, out: 0, closing: 0 }
  });

  // --- Logic xử lý thời gian ---
  const handleRangeChange = (type: string) => {
    setRangeType(type);
    const now = new Date();
    let start = new Date();
    let end = new Date();

    switch (type) {
      case 'TODAY':
        start = startOfDay(now);
        end = endOfDay(now);
        break;
      case 'YESTERDAY':
        const yesterday = subDays(now, 1);
        start = startOfDay(yesterday);
        end = endOfDay(yesterday);
        break;
      case 'WEEK':
        start = subDays(now, 7);
        end = endOfDay(now);
        break;
      case 'MONTH':
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
    }
    setDateRange({ start, end });
  };

  // --- Data Fetching ---
  const fetchData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      // 1. Xác định thời gian thực tế dựa trên Ca trực (nếu chọn Today/Yesterday)
      let actualStart = new Date(dateRange.start);
      let actualEnd = new Date(dateRange.end);

      if (shiftId !== 'ALL' && (rangeType === 'TODAY' || rangeType === 'YESTERDAY')) {
        const shift = SHIFTS.find(s => s.id === shiftId);
        if (shift) {
          actualStart = setHours(setMinutes(actualStart, 0), shift.start);
          if (shift.id === 'NIGHT') {
             // Ca đêm vắt qua ngày hôm sau (hoặc từ hôm trước)
             // Logic đơn giản: 22h hôm nay -> 6h sáng mai
             actualEnd = setHours(setMinutes(new Date(actualStart), 0), 6);
             actualEnd.setDate(actualEnd.getDate() + 1);
          } else {
             actualEnd = setHours(setMinutes(actualStart, 0), shift.end);
          }
        }
      }

      // 2. Lấy dữ liệu Ví hiện tại (để tính toán ngược)
      const currentWallets = await cashFlowService.getWallets();
      setWallets(currentWallets);

      // Fetch Debt Info
      try {
        const debtors = await customerService.getDebtors();
        const totalCustomerDebt = debtors.reduce((sum, d) => sum + Math.abs(d.balance), 0);
        setCustomerDebt(totalCustomerDebt);

        const payables = await cashFlowService.getExternalPayables();
        const totalExternalDebt = (payables as any[]).reduce((sum, p) => sum + p.amount, 0);
        setExternalDebt(totalExternalDebt);
      } catch (err) {
        console.error('Error fetching debt info:', err);
      }

      // 3. Lấy giao dịch trong khoảng thời gian đã chọn
      // Lọc bỏ các loại thanh toán "ảo" (credit, deposit_transfer) để chỉ lấy tiền thực
      const { data } = await cashFlowService.getTransactions(1, 1000, { // Lấy nhiều để tính toán client-side cho chính xác
        startDate: actualStart,
        endDate: actualEnd,
        excludePaymentMethod: ['credit', 'deposit_transfer']
      });
      setTransactions(data);

      // 4. Tính toán "Tồn đầu - Biến động - Tồn cuối"
      // Đây là logic "Mắt thần": 
      // Tồn đầu = Số dư hiện tại - Tổng biến động từ (Start -> Hiện tại)
      // Nhưng để chính xác và nhanh, ta dùng hàm getWalletBalanceAt đã viết trong service
      
      // Tuy nhiên, để tối ưu hiệu năng, ta có thể tính dựa trên tập giao dịch đã tải về 
      // nếu khoảng thời gian gần. Nhưng để "Bằng chứng thép", ta gọi service tính toán.
      
      const cashWallet = currentWallets.find(w => w.id === 'CASH');
      const bankWallet = currentWallets.find(w => w.id === 'BANK');

      if (cashWallet && bankWallet) {
        const [cashOpening, bankOpening] = await Promise.all([
          cashFlowService.getWalletBalanceAt('CASH', actualStart),
          cashFlowService.getWalletBalanceAt('BANK', actualStart)
        ]);

        // Tính biến động trong kỳ (từ data đã fetch)
        const cashTxs = data.filter(t => !t.payment_method_code || t.payment_method_code === 'cash');
        const bankTxs = data.filter(t => t.payment_method_code === 'bank' || t.payment_method_code === 'transfer' || t.payment_method_code === 'qr');

        const calcStats = (opening: number, txs: CashFlowTransaction[]) => {
          const totalIn = txs.filter(t => t.flow_type === 'IN').reduce((sum, t) => sum + t.amount, 0);
          const totalOut = txs.filter(t => t.flow_type === 'OUT').reduce((sum, t) => sum + t.amount, 0);
          return {
            opening,
            in: totalIn,
            out: totalOut,
            closing: opening + totalIn - totalOut
          };
        };

        setBalanceStats({
          cash: calcStats(cashOpening, cashTxs),
          bank: calcStats(bankOpening, bankTxs)
        });
      }

    } catch (error) {
      console.error(error);
      if (!isBackground) toast.error('Không thể tải dữ liệu');
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Realtime subscription setup...
    const channel = supabase
    .channel('money-page-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_flow' }, () => fetchData(true))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wallets' }, () => fetchData(true))
    .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [dateRange, shiftId]); // Re-fetch khi đổi ngày hoặc đổi ca

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-8 pb-32 font-sans">
      <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
        
        {/* Header & Actions */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tighter text-slate-900 flex items-center gap-3">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700">Sổ Tiền</span>
              <span className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full font-bold tracking-wide border border-emerald-100 shadow-sm flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                LIVE
              </span>
            </h1>
            <p className="text-slate-500 font-medium text-base">
              Quản trị dòng tiền thông minh & minh bạch
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsModalOpen(true)}
              className="group bg-slate-900 hover:bg-slate-800 text-white px-6 py-3.5 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-slate-200 active:scale-95 transition-all duration-300"
            >
              <div className="bg-white/20 p-1 rounded-lg group-hover:rotate-90 transition-transform duration-500">
                <Plus size={18} />
              </div>
              <span>Tạo phiếu mới</span>
            </button>
          </div>
        </div>

        {/* --- BỘ LỌC BENTO --- */}
        <div className="glass p-2 rounded-[24px] shadow-sm flex flex-col md:flex-row items-center gap-2 overflow-x-auto no-scrollbar">
          {/* Quick Ranges */}
          <div className="flex bg-slate-100/50 p-1.5 rounded-2xl shrink-0 gap-1">
            {QUICK_RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => handleRangeChange(r.id)}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap",
                  rangeType === r.id 
                    ? "bg-white text-slate-900 shadow-[0_2px_10px_rgba(0,0,0,0.05)] scale-100" 
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 scale-95 hover:scale-100"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-slate-200 hidden md:block mx-4"></div>

          {/* Shift Filter */}
          {(rangeType === 'TODAY' || rangeType === 'YESTERDAY') && (
             <div className="flex items-center gap-2 shrink-0 overflow-x-auto p-1">
               {SHIFTS.map((s) => (
                 <button
                   key={s.id}
                   onClick={() => setShiftId(s.id)}
                   className={cn(
                     "px-4 py-2.5 rounded-xl text-xs font-bold border transition-all duration-300 whitespace-nowrap flex items-center gap-2",
                     shiftId === s.id 
                       ? "bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm" 
                       : "bg-transparent border-transparent text-slate-500 hover:bg-slate-50 hover:border-slate-200"
                   )}
                 >
                   <Clock size={14} className={cn(shiftId === s.id ? "text-indigo-500" : "text-slate-400")} />
                   {s.label}
                 </button>
               ))}
             </div>
          )}
        </div>

        {/* --- BENTO GRID REPORT --- */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* CASH WALLET - Primary Hero Card */}
          <div className="md:col-span-8 bento-card p-8 bg-white border border-slate-100 relative overflow-hidden group hover:border-emerald-100 hover:shadow-xl hover:shadow-emerald-50 transition-all duration-500">
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 group-hover:scale-110 transition-transform duration-300">
                    <Banknote size={28} />
                  </div>
                  <div>
                    <span className="block font-bold uppercase tracking-widest text-xs text-slate-400 mb-1">Tổng Tiền Mặt</span>
                    <span className="font-bold text-slate-700">Két Khách Sạn</span>
                  </div>
                </div>
                <div className="bg-emerald-50 px-3 py-1 rounded-full text-xs font-bold text-emerald-600 border border-emerald-100">
                  VNĐ
                </div>
              </div>
              
              <div className="mt-8 mb-8">
                <div className="flex items-baseline gap-1 text-slate-800">
                   <span className="text-6xl font-black tracking-tighter">
                      {formatMoney(balanceStats.cash.closing).replace('₫', '')}
                   </span>
                   <span className="text-2xl font-bold text-slate-300">₫</span>
                </div>
                <span className="text-sm font-medium text-slate-400 ml-1">Số dư khả dụng hiện tại</span>
              </div>

              {/* Stats Footer */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-50">
                 <div className="group/stat">
                   <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Tồn đầu kỳ</div>
                   <div className="font-bold text-lg text-slate-600">{formatMoney(balanceStats.cash.opening)}</div>
                 </div>
                 <div className="group/stat">
                   <div className="text-[10px] uppercase font-bold text-emerald-500 mb-1">Tổng thu</div>
                   <div className="font-bold text-lg text-emerald-600">+{formatMoney(balanceStats.cash.in)}</div>
                 </div>
                 <div className="group/stat">
                   <div className="text-[10px] uppercase font-bold text-rose-400 mb-1">Tổng chi</div>
                   <div className="font-bold text-lg text-rose-500">-{formatMoney(balanceStats.cash.out)}</div>
                 </div>
              </div>
            </div>
            
            {/* Artistic Decor */}
            <div className="absolute -right-12 -bottom-12 text-emerald-500 opacity-[0.03] transform rotate-12 group-hover:rotate-0 transition-all duration-700">
              <Banknote size={280} strokeWidth={1} />
            </div>
          </div>

          {/* BANK WALLET - Secondary Card */}
          <div className="md:col-span-4 bento-card p-8 bg-white border border-slate-100 relative overflow-hidden group hover:border-blue-100 hover:shadow-xl hover:shadow-blue-50 transition-all duration-500">
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-blue-50 rounded-2xl text-blue-600 group-hover:scale-110 transition-transform duration-300">
                    <CreditCard size={28} />
                  </div>
                  <div>
                     <span className="block font-bold uppercase tracking-widest text-xs text-slate-400 mb-1">Ngân Hàng</span>
                     <span className="font-bold text-slate-700">Tài Khoản Chính</span>
                  </div>
                </div>
                
                <div className="flex items-baseline gap-1 text-slate-800">
                   <span className="text-4xl font-black tracking-tighter">
                      {formatMoney(balanceStats.bank.closing).replace('₫', '')}
                   </span>
                   <span className="text-xl font-bold text-slate-300">₫</span>
                </div>
              </div>

              <div className="space-y-3 mt-8 pt-6 border-t border-slate-50">
                 <div className="flex justify-between items-center text-sm">
                   <span className="text-slate-400 font-medium">Thu trong kỳ</span>
                   <span className="font-bold text-blue-600">+{formatMoney(balanceStats.bank.in)}</span>
                 </div>
                 <div className="flex justify-between items-center text-sm">
                   <span className="text-slate-400 font-medium">Chi trong kỳ</span>
                   <span className="font-bold text-rose-500">-{formatMoney(balanceStats.bank.out)}</span>
                 </div>
              </div>
            </div>

            <div className="absolute -right-8 -bottom-8 text-blue-500 opacity-[0.03] transform rotate-12 group-hover:rotate-0 transition-all duration-700">
              <CreditCard size={200} strokeWidth={1} />
            </div>
          </div>

          {/* DEBT CARDS - Split Row */}
          <div className="md:col-span-6 bento-card p-6 bg-white border border-slate-100 relative overflow-hidden group cursor-pointer hover:shadow-lg hover:shadow-rose-100/50 transition-all duration-300"
               onClick={() => setIsCustomerDebtModalOpen(true)}>
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="p-3 bg-rose-50 rounded-2xl text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-colors duration-300">
                    <Users size={24} />
                 </div>
                 <div>
                    <div className="font-bold uppercase tracking-widest text-xs text-slate-400 mb-1">Khách Nợ</div>
                    <div className="text-3xl font-black tracking-tighter text-rose-600">
                      {formatMoney(Math.abs(customerDebt))}
                    </div>
                 </div>
              </div>
              <div className="h-10 w-10 rounded-full bg-white border border-rose-100 flex items-center justify-center text-rose-400 group-hover:bg-rose-600 group-hover:text-white group-hover:border-rose-600 transition-all duration-300 shadow-sm">
                 <ArrowUpRight size={20} />
              </div>
            </div>
            <div className="absolute -right-4 -bottom-4 text-rose-500 opacity-[0.03] transform rotate-12">
              <Users size={120} strokeWidth={1.5} />
            </div>
          </div>

          <div className="md:col-span-6 bento-card p-6 bg-white border border-slate-100 relative overflow-hidden group cursor-pointer hover:shadow-lg hover:shadow-amber-100/50 transition-all duration-300"
               onClick={() => setIsExternalDebtModalOpen(true)}>
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="p-3 bg-amber-50 rounded-2xl text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors duration-300">
                    <FileWarning size={24} />
                 </div>
                 <div>
                    <div className="font-bold uppercase tracking-widest text-xs text-slate-400 mb-1">Nợ Ngoài</div>
                    <div className="text-3xl font-black tracking-tighter text-amber-600">
                      {formatMoney(externalDebt)}
                    </div>
                 </div>
              </div>
              <div className="h-10 w-10 rounded-full bg-white border border-amber-100 flex items-center justify-center text-amber-400 group-hover:bg-amber-600 group-hover:text-white group-hover:border-amber-600 transition-all duration-300 shadow-sm">
                 <ArrowUpRight size={20} />
              </div>
            </div>
            <div className="absolute -right-4 -bottom-4 text-amber-500 opacity-[0.03] transform rotate-12">
              <FileWarning size={120} strokeWidth={1.5} />
            </div>
          </div>

        </div>

        {/* --- TRANSACTION LIST --- */}
        <div className="glass rounded-[32px] shadow-sm border border-slate-100/60 overflow-hidden min-h-[500px] flex flex-col">
          <div className="p-6 md:p-8 border-b border-slate-50 flex items-center justify-between bg-white/50 backdrop-blur-sm">
            <div>
               <h3 className="font-black text-xl text-slate-800 flex items-center gap-3">
                 <div className="bg-slate-100 p-2 rounded-xl text-slate-500">
                   <History size={20} />
                 </div>
                 Chi tiết dòng tiền
               </h3>
               <p className="text-slate-400 text-sm font-medium mt-1 ml-11">
                 Danh sách giao dịch thu chi trong kỳ
               </p>
            </div>
            <div className="px-4 py-2 bg-slate-100 rounded-full text-xs font-bold text-slate-500">
              {transactions.length} giao dịch
            </div>
          </div>

          <div className="flex-1 bg-white/40">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-slate-300 gap-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500"></div>
                <span className="text-sm font-medium">Đang đồng bộ dữ liệu...</span>
              </div>
            ) : transactions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-slate-300 gap-4">
                <div className="p-6 bg-slate-50 rounded-full">
                  <Search size={48} className="opacity-40" />
                </div>
                <p className="font-medium text-slate-400">Chưa phát sinh giao dịch nào</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {transactions.map((tx) => {
                  const dateObj = new Date(tx.occurred_at);
                  const timeStr = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
                  const dateStr = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }); // Short date for list

                  return (
                  <div
                    key={tx.id}
                    onClick={() => tx.ref_id ? setHistoryModal({ open: true, bookingId: tx.ref_id }) : null}
                    className="group bg-white rounded-2xl border border-slate-100 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-50/50 transition-all duration-300 cursor-pointer overflow-hidden flex items-stretch min-h-[72px]"
                  >
                    
                    {/* Left: Time & Flow Indicator */}
                    <div className="flex items-stretch">
                       <div className={cn(
                         "w-[6px] transition-colors duration-300",
                         tx.flow_type === 'IN' ? "bg-emerald-500 group-hover:bg-emerald-400" : "bg-rose-500 group-hover:bg-rose-400"
                       )} />
                       
                       <div className="px-4 flex flex-col justify-center items-center bg-slate-50/50 border-r border-slate-100 min-w-[80px]">
                          <span className="text-sm font-black text-slate-700 leading-none mb-1">{timeStr}</span>
                          <span className="text-[10px] font-bold text-slate-400 leading-none uppercase">{dateStr}</span>
                       </div>
                    </div>

                    {/* Middle: Content */}
                    <div className="flex-1 px-5 py-3 flex flex-col justify-center min-w-0">
                      <div className="mb-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {tx.category}
                        </span>
                      </div>
                      
                      <div className="flex items-center">
                        <span className="font-bold text-slate-800 text-[14px] leading-snug line-clamp-2 group-hover:text-emerald-700 transition-colors">
                            {(() => {
                              const parts = [];
                              if (tx.customer_name) parts.push(tx.customer_name);
                              if (tx.room_name) parts.push(`P.${tx.room_name}`);
                              
                              let action = tx.description || '';
                              // Simplify Booking actions
                              if (tx.category === 'Tiền phòng' || tx.category === 'Tiền cọc') {
                                 if (action.toLowerCase().includes('checkout') || action.toLowerCase().includes('thanh toán phòng')) action = 'Trả phòng';
                                 else if (action.toLowerCase().includes('cọc')) action = 'Cọc phòng';
                                 else if (action.toLowerCase().includes('nhận phòng')) action = 'Nhận phòng';
                              }
                              
                              // Remove redundant room info from description if we already have room_name
                              if (tx.room_name) {
                                 action = action.replace(new RegExp(`Phòng ${tx.room_name}`, 'gi'), '')
                                                .replace(new RegExp(`${tx.room_name}`, 'gi'), '')
                                                .replace(/\(\)/g, '')
                                                .trim();
                              }
                              
                              // Append action
                              if (action && action !== tx.category) {
                                parts.push(action);
                              } else if (parts.length === 0) {
                                parts.push(tx.description || tx.category);
                              } else {
                                parts.push(tx.category); // Fallback if action is empty but we have room/customer
                              }
                              
                              return parts.join(' - ');
                            })()}
                        </span>
                      </div>
                    </div>
                    
                    {/* Right: Amount & Payment Method */}
                    <div className="px-5 py-3 flex flex-col justify-center items-end border-l border-slate-50 min-w-[140px] bg-slate-50/30">
                       <div className="flex items-center gap-2">
                         <span className={cn(
                           "font-black tracking-tighter text-lg",
                           tx.flow_type === 'IN' ? "text-emerald-600" : "text-rose-600"
                         )}>
                           {tx.flow_type === 'IN' ? '+' : '-'}{formatMoney(tx.amount)}
                         </span>
                       </div>
                       
                       <div className="mt-1 flex items-center gap-2 justify-end w-full">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 truncate max-w-[80px]">
                            <User size={10} />
                            <span className="truncate">{tx.staff_name || tx.verified_by_staff_name || 'Hệ thống'}</span>
                          </div>
                          
                          <span className={cn(
                             "text-[10px] uppercase font-bold px-2 py-0.5 rounded text-center border inline-block min-w-[36px]",
                             (!tx.payment_method_code || tx.payment_method_code?.toLowerCase() === 'cash') 
                               ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                               : "bg-blue-50 text-blue-700 border-blue-100"
                           )}>
                             {(() => {
                               const code = (tx.payment_method_code || 'cash').toLowerCase();
                               if (code === 'cash') return 'TM';
                               if (code === 'pos') return 'POS';
                               if (code === 'credit') return 'CN';
                               return 'CK';
                             })()}
                           </span>
                       </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      <TransactionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => fetchData()} 
      />

      <CustomerDebtModal 
        isOpen={isCustomerDebtModalOpen} 
        onClose={() => setIsCustomerDebtModalOpen(false)} 
      />

      <ExternalDebtModal 
        isOpen={isExternalDebtModalOpen} 
        onClose={() => setIsExternalDebtModalOpen(false)} 
      />

      {historyModal.bookingId && (
        <BookingHistoryModal
          isOpen={historyModal.open}
          onClose={() => setHistoryModal({ open: false, bookingId: null })}
          bookingId={historyModal.bookingId}
        />
      )}
    </div>
  );
}
