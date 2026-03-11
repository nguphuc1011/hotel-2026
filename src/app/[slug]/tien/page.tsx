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
  FileWarning,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  Wallet as WalletIcon,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { customerService } from '@/services/customerService';
import type { Customer } from '@/services/customerService';
import { cashFlowService } from '@/services/cashFlowService';
import type { CashFlowTransaction, Wallet } from '@/services/cashFlowService';
import TransactionModal from '@/components/cash-flow/TransactionModal';
import WalletAdjustmentModal from './components/WalletAdjustmentModal';
import BookingHistoryModal from './components/BookingHistoryModal';
import CustomerDebtModal from './components/CustomerDebtModal';
import { formatMoney } from '@/utils/format';
import { cn } from '@/lib/utils';
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, setHours, setMinutes, isSameDay } from 'date-fns';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSION_KEYS } from '@/services/permissionService';
import { useSecurity } from '@/hooks/useSecurity';

// Định nghĩa các khoảng thời gian nhanh
const QUICK_RANGES = [
  { id: 'TODAY', label: 'Hôm nay' },
  { id: 'YESTERDAY', label: 'Hôm qua' },
  { id: 'WEEK', label: '7 ngày qua' },
  { id: 'MONTH', label: 'Tháng này' },
];

export default function MoneyPage() {
  const { can, user, isLoading: isAuthLoading } = usePermission();
  const { verify, SecurityModals } = useSecurity();
  const [transactions, setTransactions] = useState<CashFlowTransaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<CashFlowTransaction | null>(null);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [historyModal, setHistoryModal] = useState<{ open: boolean; bookingId: string | null }>({
    open: false,
    bookingId: null
  });

  const [customerDebt, setCustomerDebt] = useState(0);
  const [isCustomerDebtModalOpen, setIsCustomerDebtModalOpen] = useState(false);
  const [initialTransactionData, setInitialTransactionData] = useState<Partial<CashFlowTransaction> | undefined>(undefined);
  const [initialSearchTerm, setInitialSearchTerm] = useState<string | undefined>(undefined);
  
  // Filter States
  const [rangeType, setRangeType] = useState('TODAY');
  const [dateRange, setDateRange] = useState({
    start: startOfDay(new Date()),
    end: endOfDay(new Date())
  });

  // Balance Stats
  const [balanceStats, setBalanceStats] = useState({
    cash: { opening: 0, in: 0, out: 0, closing: 0 },
    bank: { opening: 0, in: 0, out: 0, closing: 0 },
    escrow: { opening: 0, in: 0, out: 0, closing: 0 },
    receivable: { opening: 0, in: 0, out: 0, closing: 0 },
    revenue: { opening: 0, in: 0, out: 0, closing: 0 }
  });

  const [showExtraFunds, setShowExtraFunds] = useState(false);

  // Permission Helpers
  
  const displayBalance = (amount: number) => {
    return formatMoney(amount);
  };
  
  const displayRawBalance = (amount: number) => {
    return formatMoney(amount).replace('₫', '');
  };

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
      // 1. Xác định thời gian thực tế
      let actualStart = new Date(dateRange.start);
      let actualEnd = new Date(dateRange.end);

      // 2. Lấy dữ liệu Ví hiện tại (để tính toán ngược)
      const currentWallets = await cashFlowService.getWallets();
      setWallets(currentWallets);

      // Fetch Debt Info
      try {
        const debtors = await customerService.getDebtors();
        const totalCustomerDebt = debtors.reduce((sum, d) => sum + Math.abs(d.balance), 0);
        setCustomerDebt(totalCustomerDebt);
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
      const cashWallet = currentWallets.find(w => w.id === 'CASH');
      const bankWallet = currentWallets.find(w => w.id === 'BANK');
      const escrowWallet = currentWallets.find(w => w.id === 'ESCROW');
      const receivableWallet = currentWallets.find(w => w.id === 'RECEIVABLE');
      const revenueWallet = currentWallets.find(w => w.id === 'REVENUE');

      if (cashWallet && bankWallet) {
        const [cashOpening, bankOpening, escrowOpening, receivableOpening, revenueOpening] = await Promise.all([
          cashFlowService.getWalletBalanceAt('CASH', actualStart),
          cashFlowService.getWalletBalanceAt('BANK', actualStart),
          escrowWallet ? cashFlowService.getWalletBalanceAt('ESCROW', actualStart) : 0,
          receivableWallet ? cashFlowService.getWalletBalanceAt('RECEIVABLE', actualStart) : 0,
          revenueWallet ? cashFlowService.getWalletBalanceAt('REVENUE', actualStart) : 0
        ]);

        // Tính biến động trong kỳ (từ data đã fetch)
        const cashTxs = data.filter(t => !t.payment_method_code || t.payment_method_code === 'cash');
        const bankTxs = data.filter(t => t.payment_method_code === 'bank' || t.payment_method_code === 'transfer' || t.payment_method_code === 'qr');

        // Helper: Tính toán đơn giản cho các quỹ phụ (Opening + Closing)
        const calcStats = (opening: number, closing: number) => {
             const net = closing - opening;
             return {
               opening,
               in: net > 0 ? net : 0,
               out: net < 0 ? -net : 0,
               closing
             };
        };
        
        // Helper: Tính toán chi tiết cho Cash/Bank từ transactions
        const calcDetailedStats = (opening: number, closing: number, txs: CashFlowTransaction[]) => {
             const totalIn = txs.filter(t => t.flow_type === 'IN').reduce((sum, t) => sum + t.amount, 0);
             const totalOut = txs.filter(t => t.flow_type === 'OUT').reduce((sum, t) => sum + t.amount, 0);
             return {
               opening,
               in: totalIn,
               out: totalOut,
               closing
             };
        };

        // Lấy Closing Balance tại thời điểm End
        const [cashClosing, bankClosing, escrowClosing, receivableClosing, revenueClosing] = await Promise.all([
             cashFlowService.getWalletBalanceAt('CASH', actualEnd),
             cashFlowService.getWalletBalanceAt('BANK', actualEnd),
             cashFlowService.getWalletBalanceAt('ESCROW', actualEnd),
             cashFlowService.getWalletBalanceAt('RECEIVABLE', actualEnd),
             cashFlowService.getWalletBalanceAt('REVENUE', actualEnd)
        ]);

        setBalanceStats({
          cash: calcDetailedStats(cashOpening, cashClosing, cashTxs),
          bank: calcDetailedStats(bankOpening, bankClosing, bankTxs),
          escrow: calcStats(escrowOpening, escrowClosing),
          receivable: calcStats(receivableOpening, receivableClosing),
          revenue: calcStats(revenueOpening, revenueClosing)
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
  }, [dateRange]); // Re-fetch khi đổi ngày
  
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!can(PERMISSION_KEYS.VIEW_MONEY)) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-slate-50">
         <div className="text-center">
           <ShieldCheck size={48} className="mx-auto text-slate-300 mb-4" />
           <h1 className="text-xl font-bold text-slate-700">Không có quyền truy cập</h1>
           <p className="text-slate-500">Vui lòng liên hệ quản lý.</p>
         </div>
       </div>
     );
  }

  const handleCompensate = (tx: CashFlowTransaction) => {
    const isIncome = tx.flow_type === 'IN';
    const newData: Partial<CashFlowTransaction> = {
        flow_type: isIncome ? 'OUT' : 'IN',
        category: 'Điều chỉnh',
        amount: tx.amount,
        description: `Điều chỉnh cho giao dịch: ${tx.description}`,
        payment_method_code: tx.payment_method_code,
    };
    setInitialTransactionData(newData);
    setInitialSearchTerm(tx.customer_name);
    setIsModalOpen(true);
  };

  const handleEdit = (tx: CashFlowTransaction) => {
    if (tx.is_auto) {
      toast.error('Không thể sửa giao dịch tự động từ hệ thống');
      return;
    }
    setSelectedTransaction(tx);
    setIsModalOpen(true);
  };

  const handleDelete = async (tx: CashFlowTransaction, verifiedStaff?: { id: string, name: string }) => {
    if (tx.is_auto) {
        toast.error('Không thể xóa giao dịch tự động từ hệ thống');
        return;
    }

    if (!verifiedStaff) {
      await verify('finance_delete_transaction', (staffId, staffName) => 
        handleDelete(tx, staffId ? { id: staffId, name: staffName || '' } : undefined)
      );
      return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa giao dịch này?`)) return;

    try {
      setLoading(true);
      await cashFlowService.deleteTransaction(tx.id, 'Xóa thủ công', verifiedStaff);
      toast.success('Đã xóa giao dịch');
      await fetchData();
    } catch (error) {
      console.error(error);
      toast.error('Có lỗi xảy ra khi xóa giao dịch');
    } finally {
      setLoading(false);
    }
  };

  const canViewExtraFunds = can(PERMISSION_KEYS.VIEW_MONEY_EXTRA_FUNDS) || can(PERMISSION_KEYS.VIEW_MONEY_EXTRA_FUNDS_RECEIVABLE);

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-8 pb-32 font-sans">
      {SecurityModals}
      <div className="space-y-8 animate-fade-in">
        
        {/* Header & Actions */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tighter text-slate-900 flex items-center gap-3">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700">Thu Chi</span>
              <span className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full font-bold tracking-wide border border-emerald-100 shadow-sm flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                LIVE
              </span>
            </h1>
            <p className="text-slate-500 font-medium text-base">
              Quản trị dòng tiền thông minh & minh bạch
            </p>
          </div>
          
          <div className="flex items-center gap-3 hidden md:flex">
            {canViewExtraFunds && (
              <button
                onClick={() => setShowExtraFunds(!showExtraFunds)}
                className={cn(
                  "px-4 py-3.5 rounded-2xl font-bold flex items-center gap-2 border active:scale-95 transition-all duration-300",
                  showExtraFunds 
                    ? "bg-slate-800 text-white border-slate-800 shadow-md" 
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                )}
              >
                {showExtraFunds ? <ToggleRight size={20} className="text-emerald-400" /> : <ToggleLeft size={20} />}
                <span>Quỹ mở rộng</span>
              </button>
            )}

            <button 
              onClick={() => setIsAdjustmentModalOpen(true)}
              className="bg-white hover:bg-slate-50 text-slate-700 px-6 py-3.5 rounded-2xl font-bold flex items-center gap-2 border border-slate-200 active:scale-95 transition-all duration-300"
            >
              <AlertTriangle size={18} className="text-amber-500" />
              <span>Điều chỉnh</span>
            </button>
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
        <div className="flex flex-col md:flex-row gap-4 md:items-center">
          {/* Quick Ranges - Mobile: Scrollable / Desktop: Grouped */}
          <div className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm flex overflow-x-auto no-scrollbar snap-x">
            {QUICK_RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => handleRangeChange(r.id)}
                className={cn(
                  "flex-1 min-w-[90px] px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all duration-300 whitespace-nowrap snap-center",
                  rangeType === r.id 
                    ? "bg-slate-900 text-white shadow-md shadow-slate-900/20" 
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* --- BENTO GRID REPORT --- */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* CASH WALLET - Primary Hero Card */}
          {can(PERMISSION_KEYS.VIEW_MONEY_BALANCE_CASH) && (
            <div className={cn(
              "bento-card p-8 bg-white border border-slate-100 relative overflow-hidden group hover:border-emerald-100 hover:shadow-xl hover:shadow-emerald-50 transition-all duration-500",
              can(PERMISSION_KEYS.VIEW_MONEY_BALANCE_BANK) ? "md:col-span-6" : "md:col-span-8"
            )}>
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
                        {displayRawBalance(balanceStats.cash.closing)}
                     </span>
                     <span className="text-2xl font-bold text-slate-300">₫</span>
                  </div>
                  <span className="text-sm font-medium text-slate-400 ml-1">Số dư khả dụng hiện tại</span>
                </div>

                {/* Stats Footer */}
                <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-50">
                   <div className="group/stat">
                     <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Tồn đầu kỳ</div>
                     <div className="font-bold text-lg text-slate-600">{displayBalance(balanceStats.cash.opening)}</div>
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
          )}

          {/* BANK WALLET - Secondary Card */}
          {can(PERMISSION_KEYS.VIEW_MONEY_BALANCE_BANK) && (
            <div className="md:col-span-3 bento-card p-8 bg-white border border-slate-100 relative overflow-hidden group hover:border-blue-100 hover:shadow-xl hover:shadow-blue-50 transition-all duration-500">
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
                        {displayRawBalance(balanceStats.bank.closing)}
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
          )}

          {/* DEBT CARDS - In-Row */}
          <div className={cn(
              "bento-card p-8 bg-white border border-slate-100 relative overflow-hidden group cursor-pointer hover:border-rose-100 hover:shadow-xl hover:shadow-rose-50 transition-all duration-500",
              can(PERMISSION_KEYS.VIEW_MONEY_BALANCE_BANK) ? "md:col-span-3" : "md:col-span-4"
          )}
               onClick={() => setIsCustomerDebtModalOpen(true)}>
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-rose-50 rounded-2xl text-rose-600 group-hover:scale-110 transition-transform duration-300">
                    <Users size={28} />
                  </div>
                  <div>
                    <span className="block font-bold uppercase tracking-widest text-xs text-slate-400 mb-1">Khách Nợ</span>
                    <span className="font-bold text-slate-700">Phải Thu</span>
                  </div>
                </div>
                
                <div className="flex items-baseline gap-1 text-rose-600">
                   <span className="text-4xl font-black tracking-tighter">
                      {formatMoney(Math.abs(customerDebt)).replace('₫', '')}
                   </span>
                   <span className="text-xl font-bold text-rose-300">₫</span>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-50 flex justify-between items-center">
                 <span className="text-sm font-bold text-slate-400 uppercase tracking-wider group-hover:text-rose-500 transition-colors">Xem chi tiết</span>
                 <div className="h-8 w-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-all duration-300">
                    <ArrowUpRight size={16} />
                 </div>
              </div>
            </div>
            
            <div className="absolute -right-8 -bottom-8 text-rose-500 opacity-[0.03] transform rotate-12 group-hover:rotate-0 transition-all duration-700">
              <Users size={200} strokeWidth={1} />
            </div>
          </div>

          {/* EXTRA FUNDS - TOGGLEABLE */}
          {showExtraFunds && (
            <>
              {/* ESCROW WALLET - Tạm Giữ */}
              {can(PERMISSION_KEYS.VIEW_MONEY_EXTRA_FUNDS) && (
                <div className="md:col-span-4 bento-card p-6 bg-white border border-slate-100 relative overflow-hidden group hover:border-purple-100 hover:shadow-xl hover:shadow-purple-50 transition-all duration-500">
                  <div className="relative z-10 flex flex-col h-full justify-between">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-purple-50 rounded-2xl text-purple-600">
                        <ShieldCheck size={24} />
                      </div>
                      <div>
                        <span className="block font-bold uppercase tracking-widest text-xs text-slate-400 mb-1">Quỹ Tạm Giữ</span>
                        <span className="font-bold text-slate-700">Tiền Cọc/Bảo Đảm</span>
                      </div>
                    </div>
                    <div className="flex items-baseline gap-1 text-slate-800">
                       <span className="text-3xl font-black tracking-tighter">
                          {displayRawBalance(balanceStats.escrow?.closing || 0)}
                       </span>
                       <span className="text-lg font-bold text-slate-300">₫</span>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-50 text-xs flex justify-between">
                       <span className="text-slate-400">Tồn đầu: {displayBalance(balanceStats.escrow?.opening || 0)}</span>
                       <span className={(balanceStats.escrow?.closing || 0) >= (balanceStats.escrow?.opening || 0) ? "text-emerald-500" : "text-rose-500"}>
                          {(balanceStats.escrow?.closing || 0) >= (balanceStats.escrow?.opening || 0) ? '+' : ''}{formatMoney((balanceStats.escrow?.closing || 0) - (balanceStats.escrow?.opening || 0))}
                       </span>
                    </div>
                  </div>
                </div>
              )}

              {/* RECEIVABLE WALLET - Công Nợ Tạm */}
              {(can(PERMISSION_KEYS.VIEW_MONEY_EXTRA_FUNDS) || can(PERMISSION_KEYS.VIEW_MONEY_EXTRA_FUNDS_RECEIVABLE)) && (
                <div className="md:col-span-4 bento-card p-6 bg-white border border-slate-100 relative overflow-hidden group hover:border-orange-100 hover:shadow-xl hover:shadow-orange-50 transition-all duration-500">
                  <div className="relative z-10 flex flex-col h-full justify-between">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-orange-50 rounded-2xl text-orange-600">
                        <WalletIcon size={24} />
                      </div>
                      <div>
                        <span className="block font-bold uppercase tracking-widest text-xs text-slate-400 mb-1">Công Nợ Tạm</span>
                        <span className="font-bold text-slate-700">Phải Thu Khách</span>
                      </div>
                    </div>
                    <div className="flex items-baseline gap-1 text-slate-800">
                       <span className="text-3xl font-black tracking-tighter">
                          {displayRawBalance(balanceStats.receivable?.closing || 0)}
                       </span>
                       <span className="text-lg font-bold text-slate-300">₫</span>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-50 text-xs flex justify-between">
                       <span className="text-slate-400">Tồn đầu: {displayBalance(balanceStats.receivable?.opening || 0)}</span>
                       <span className={(balanceStats.receivable?.closing || 0) >= (balanceStats.receivable?.opening || 0) ? "text-emerald-500" : "text-rose-500"}>
                          {(balanceStats.receivable?.closing || 0) >= (balanceStats.receivable?.opening || 0) ? '+' : ''}{formatMoney((balanceStats.receivable?.closing || 0) - (balanceStats.receivable?.opening || 0))}
                       </span>
                    </div>
                  </div>
                </div>
              )}

              {/* REVENUE WALLET - Sổ Doanh Thu */}
              {can(PERMISSION_KEYS.VIEW_MONEY_REVENUE) && (
                <div className="md:col-span-4 bento-card p-6 bg-white border border-slate-100 relative overflow-hidden group hover:border-indigo-100 hover:shadow-xl hover:shadow-indigo-50 transition-all duration-500">
                  <div className="relative z-10 flex flex-col h-full justify-between">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                        <TrendingUp size={24} />
                      </div>
                      <div>
                        <span className="block font-bold uppercase tracking-widest text-xs text-slate-400 mb-1">Sổ Doanh Thu</span>
                        <span className="font-bold text-slate-700">Tổng Hợp</span>
                      </div>
                    </div>
                    <div className="flex items-baseline gap-1 text-slate-800">
                       <span className="text-3xl font-black tracking-tighter">
                          {displayRawBalance(balanceStats.revenue?.closing || 0)}
                       </span>
                       <span className="text-lg font-bold text-slate-300">₫</span>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-50 text-xs flex justify-between">
                       <span className="text-slate-400">Tồn đầu: {displayBalance(balanceStats.revenue?.opening || 0)}</span>
                       <span className={(balanceStats.revenue?.closing || 0) >= (balanceStats.revenue?.opening || 0) ? "text-emerald-500" : "text-rose-500"}>
                          {(balanceStats.revenue?.closing || 0) >= (balanceStats.revenue?.opening || 0) ? '+' : ''}{formatMoney((balanceStats.revenue?.closing || 0) - (balanceStats.revenue?.opening || 0))}
                       </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}


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

                       {/* Actions disabled: Audit Only Policy */}
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
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTransaction(null);
          setInitialTransactionData(undefined);
          setInitialSearchTerm(undefined);
        }}
        onSuccess={() => fetchData()} 
        transaction={selectedTransaction}
        initialData={initialTransactionData}
        initialSearchTerm={initialSearchTerm}
      />

      <WalletAdjustmentModal 
        isOpen={isAdjustmentModalOpen}
        onClose={() => setIsAdjustmentModalOpen(false)}
        onSuccess={() => fetchData()}
        wallets={wallets}
      />

      {/* Floating Action Button for Mobile */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="md:hidden fixed bottom-24 right-4 z-50 w-12 h-12 bg-slate-900 text-white rounded-full shadow-xl shadow-slate-900/30 flex items-center justify-center active:scale-90 transition-all duration-300 hover:bg-slate-800"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      <CustomerDebtModal 
        isOpen={isCustomerDebtModalOpen} 
        onClose={() => setIsCustomerDebtModalOpen(false)} 
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
