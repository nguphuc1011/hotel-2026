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
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { customerService } from '@/services/customerService';
import type { Customer } from '@/services/customerService';
import { cashFlowService } from '@/services/cashFlowService';
import type { CashFlowTransaction, Wallet } from '@/services/cashFlowService';
import TransactionModal from '@/components/cash-flow/TransactionModal';
import WalletAdjustmentModal from './components/WalletAdjustmentModal';
import ReceivableDetailModal from '@/components/cash-flow/ReceivableDetailModal';
import BookingHistoryModal from './components/BookingHistoryModal';
import CustomerDebtModal from './components/CustomerDebtModal';
import { formatMoney } from '@/utils/format';
import { cn } from '@/lib/utils';
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, setHours, setMinutes, isSameDay } from 'date-fns';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSION_KEYS } from '@/services/permissionService';
import { useSecurity } from '@/hooks/useSecurity';

// Định nghĩa các khoảng thời gian nhanh
const QUICK_RANGES = [
  { id: 'TODAY', label: 'Hôm nay' },
  { id: 'YESTERDAY', label: 'Hôm qua' },
  { id: 'WEEK', label: '7 ngày' },
  { id: 'MONTH', label: 'Tháng này' },
  { id: 'LAST_MONTH', label: 'Tháng trước' },
  { id: 'YEAR', label: 'Năm nay' },
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
  const [isReceivableModalOpen, setIsReceivableModalOpen] = useState(false);
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
    receivable: { opening: 0, in: 0, out: 0, closing: 0 },
    debt: { opening: 0, in: 0, out: 0, closing: 0 },
    revenue: { opening: 0, in: 0, out: 0, closing: 0 }
  });

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
      case 'LAST_MONTH':
        const lastMonth = subMonths(now, 1);
        start = startOfMonth(lastMonth);
        end = endOfMonth(lastMonth);
        break;
      case 'YEAR':
        start = startOfYear(now);
        end = endOfYear(now);
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
      const receivableWallet = currentWallets.find(w => w.id === 'RECEIVABLE');
      const debtWallet = currentWallets.find(w => w.id === 'DEBT');
      const revenueWallet = currentWallets.find(w => w.id === 'REVENUE');

      if (cashWallet && bankWallet) {
        const [cashOpening, bankOpening, receivableOpening, debtOpening, revenueOpening] = await Promise.all([
          cashFlowService.getWalletBalanceAt('CASH', actualStart),
          cashFlowService.getWalletBalanceAt('BANK', actualStart),
          receivableWallet ? cashFlowService.getWalletBalanceAt('RECEIVABLE', actualStart) : 0,
          debtWallet ? cashFlowService.getWalletBalanceAt('DEBT', actualStart) : 0,
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
        const [cashClosing, bankClosing, receivableClosing, debtClosing, revenueClosing] = await Promise.all([
             cashFlowService.getWalletBalanceAt('CASH', actualEnd),
             cashFlowService.getWalletBalanceAt('BANK', actualEnd),
             cashFlowService.getWalletBalanceAt('RECEIVABLE', actualEnd),
             cashFlowService.getWalletBalanceAt('DEBT', actualEnd),
             cashFlowService.getWalletBalanceAt('REVENUE', actualEnd)
        ]);

        setBalanceStats({
          cash: calcDetailedStats(cashOpening, cashClosing, cashTxs),
          bank: calcDetailedStats(bankOpening, bankClosing, bankTxs),
          receivable: calcStats(receivableOpening, receivableClosing),
          debt: calcStats(debtOpening, debtClosing),
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

  // Render helper for the Bento grid
  const renderWalletCard = (walletId: string, type: 'large' | 'medium' = 'medium') => {
    const wallet = wallets.find(w => w.id === walletId);
    if (!wallet) return null;

    const stats = walletId === 'CASH' ? balanceStats.cash : 
                  walletId === 'BANK' ? balanceStats.bank : 
                  walletId === 'DEBT' ? balanceStats.debt : 
                  walletId === 'RECEIVABLE' ? balanceStats.receivable : 
                  balanceStats.revenue;
    
    const isBank = walletId === 'BANK';
    const isDebt = walletId === 'DEBT';
    const isReceivable = walletId === 'RECEIVABLE';
    const isRevenue = walletId === 'REVENUE';

    // UI config based on wallet type
    const walletConfigs: Record<string, { icon: React.ReactNode; label: string; subLabel: string; color: string; gradient: string }> = {
      CASH: {
        icon: <div className="p-4 bg-emerald-500/10 text-emerald-600 rounded-[24px] backdrop-blur-md border border-emerald-500/20"><Banknote size={32} strokeWidth={2.5} /></div>,
        label: 'Tiền mặt',
        subLabel: 'Két an toàn',
        color: 'emerald',
        gradient: 'from-emerald-50 to-white'
      },
      BANK: {
        icon: <div className="p-3 bg-blue-500/10 text-blue-600 rounded-[20px] backdrop-blur-md border border-blue-500/20"><CreditCard size={24} strokeWidth={2.5} /></div>,
        label: 'Ngân hàng',
        subLabel: 'Tài khoản',
        color: 'blue',
        gradient: 'from-blue-50 to-white'
      },
      DEBT: {
        icon: <div className="p-3 bg-rose-500/10 text-rose-600 rounded-[20px] backdrop-blur-md border border-rose-500/20"><Users size={24} strokeWidth={2.5} /></div>,
        label: 'Công nợ khách',
        subLabel: 'Khách đã trả phòng',
        color: 'rose',
        gradient: 'from-rose-50 to-white'
      },
      RECEIVABLE: {
        icon: <div className="p-3 bg-amber-500/10 text-amber-600 rounded-[20px] backdrop-blur-md border border-amber-500/20"><Lock size={24} strokeWidth={2.5} /></div>,
        label: 'Công nợ tạm',
        subLabel: 'Khách đang ở',
        color: 'amber',
        gradient: 'from-amber-50 to-white'
      },
      REVENUE: {
        icon: <div className="p-3 bg-indigo-500/10 text-indigo-600 rounded-[20px] backdrop-blur-md border border-indigo-500/20"><TrendingUp size={24} strokeWidth={2.5} /></div>,
        label: 'Doanh thu',
        subLabel: 'Doanh thu thuần',
        color: 'indigo',
        gradient: 'from-indigo-50 to-white'
      }
    };

    const config = walletConfigs[walletId] || { icon: null, label: walletId, subLabel: '', color: 'slate', gradient: 'from-slate-50 to-white' };

    if (type === 'large') {
      return (
        <div className={cn(
          "bg-white rounded-[40px] p-8 md:p-14 border border-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.03)] hover:shadow-[0_25px_60px_rgba(0,0,0,0.08)] transition-all duration-700 group relative overflow-hidden h-full flex flex-col justify-between",
          "before:absolute before:inset-0 before:bg-gradient-to-br before:opacity-30 before:transition-opacity",
          config.gradient
        )}>
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 p-8 md:p-16 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-1000 pointer-events-none rotate-12 group-hover:rotate-0">
            <Banknote className="w-48 h-48 md:w-80 md:h-80" strokeWidth={1} />
          </div>

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-10 md:mb-16">
              <div className="flex items-center gap-5 md:gap-8">
                <div className="scale-110 md:scale-125">
                  {config.icon}
                </div>
                <div>
                  <h3 className="text-[17px] md:text-[14px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1.5">{config.label}</h3>
                  <p className="text-[17px] md:text-2xl font-black text-slate-900 tracking-tight opacity-40">{config.subLabel}</p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="px-4 py-1.5 md:px-6 md:py-2 bg-white/90 backdrop-blur-md text-slate-900 text-[13px] md:text-[12px] font-black rounded-full shadow-sm border border-slate-100 uppercase tracking-widest">VNĐ</span>
              </div>
            </div>

            <div className="mb-10 md:mb-16">
              <div className="flex items-baseline gap-3 md:gap-6 overflow-hidden">
                <span className="text-5xl md:text-[80px] font-black text-slate-900 tracking-[-0.06em] leading-none truncate">
                  {displayRawBalance(stats.closing)}
                </span>
                <span className="text-2xl md:text-4xl font-black text-slate-200 tracking-tighter uppercase mb-1 md:mb-2">₫</span>
              </div>
              <p className="text-sm md:text-lg font-bold text-slate-400 mt-6 md:mt-10 flex items-center gap-3">
                <span className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
                Số dư thực tế trong két
              </p>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-6 md:gap-12 pt-8 md:pt-14 border-t border-slate-100/50">
            <div className="space-y-2">
              <p className="text-[13px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest">Tồn đầu</p>
              <p className="text-lg md:text-3xl font-black text-slate-800 tracking-tight truncate">{formatMoney(stats.opening)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-[13px] md:text-[11px] font-black text-emerald-500/70 uppercase tracking-widest">Tổng thu</p>
              <p className="text-lg md:text-3xl font-black text-emerald-600 tracking-tight truncate">+{formatMoney(stats.in)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-[13px] md:text-[11px] font-black text-rose-500/70 uppercase tracking-widest">Tổng chi</p>
              <p className="text-lg md:text-3xl font-black text-rose-600 tracking-tight truncate">-{formatMoney(stats.out)}</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div 
        className={cn(
          "bg-white rounded-[32px] md:rounded-[40px] p-6 md:p-10 border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.06)] hover:scale-[1.01] transition-all duration-500 group relative overflow-hidden h-full flex flex-col justify-between cursor-pointer",
          config.gradient
        )}
        onClick={() => {
          if (walletId === 'DEBT') setIsCustomerDebtModalOpen(true);
          if (walletId === 'RECEIVABLE') setIsReceivableModalOpen(true);
        }}
      >
        <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none -rotate-12 group-hover:rotate-0">
          {isBank && <CreditCard className="w-36 h-32 md:w-48 md:h-44" strokeWidth={1} />}
          {isDebt && <Users className="w-36 h-32 md:w-48 md:h-44" strokeWidth={1} />}
          {isReceivable && <Lock className="w-36 h-32 md:w-48 md:h-44" strokeWidth={1} />}
          {isRevenue && <TrendingUp className="w-36 h-32 md:w-48 md:h-44" strokeWidth={1} />}
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-4 md:gap-6 mb-8 md:mb-10">
            <div className="scale-90 md:scale-100 origin-left">
              {config.icon}
            </div>
            <div>
              <h3 className="text-[17px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1 leading-none">{config.label}</h3>
              <p className="text-[17px] md:text-sm font-black text-slate-900 tracking-tight opacity-30 leading-none">{config.subLabel}</p>
            </div>
          </div>

          <div className="mb-6 md:mb-10">
            <div className="flex items-baseline gap-1 md:gap-2">
              <span className={cn(
                "text-5xl md:text-[42px] font-black tracking-tighter leading-none",
                stats.closing < 0 ? "text-rose-600" : "text-slate-900"
              )}>
                {displayRawBalance(stats.closing)}
              </span>
              <span className="text-xl md:text-xl font-black text-slate-200 tracking-tighter uppercase">₫</span>
            </div>
          </div>
        </div>

          <div className="relative z-10 pt-6 md:pt-8 border-t border-slate-100/50">
            {isDebt || isReceivable ? (
              <div className={cn(
                "w-full flex items-center justify-between group/btn",
                isDebt ? "text-rose-600" : "text-amber-600"
              )}>
                <span className="text-[17px] md:text-[11px] font-black uppercase tracking-widest">Chi tiết</span>
                <div className={cn(
                  "w-12 h-12 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-300 group-hover/btn:translate-x-1 shadow-sm",
                  isDebt ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                )}>
                  <ArrowUpRight className="w-6 h-6 md:w-6 md:h-6" strokeWidth={3} />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2 md:gap-3">
                  <div className="flex items-center gap-3 md:gap-4">
                    <span className="text-[13px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Thu</span>
                    <span className="text-xl md:text-base font-black text-emerald-600">+{formatMoney(stats.in)}</span>
                  </div>
                  <div className="flex items-center gap-3 md:gap-4">
                    <span className="text-[13px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Chi</span>
                    <span className="text-xl md:text-base font-black text-rose-600">-{formatMoney(stats.out)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] p-4 md:p-10 pb-32 space-y-8 md:space-y-16">
      {SecurityModals}
      
      {/* Apple Style Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 md:gap-12">
        <div className="space-y-2 md:space-y-4">
          <div className="inline-flex items-center px-4 py-1.5 bg-slate-900/5 rounded-full text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
            Quản lý tài chính
          </div>
          <h1 className="text-5xl md:text-8xl font-black text-slate-900 tracking-tight leading-[0.9]">
            Quỹ tiền
          </h1>
        </div>
        
        <div className="flex items-center gap-3 md:gap-4">
          {can(PERMISSION_KEYS.FINANCE_ADJUST_WALLET) && (
            <button 
              onClick={() => setIsAdjustmentModalOpen(true)}
              className="h-14 md:h-16 px-6 md:px-10 bg-white text-slate-900 rounded-full text-sm font-bold uppercase tracking-widest shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.1)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 border border-slate-100"
            >
              <AlertTriangle className="w-5 h-5" />
              Điều chỉnh
            </button>
          )}
          {can(PERMISSION_KEYS.CREATE_TRANSACTION) && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="h-14 md:h-16 px-8 md:px-12 bg-slate-900 text-white rounded-full text-sm font-bold uppercase tracking-widest shadow-[0_10px_30px_rgba(0,0,0,0.15)] hover:shadow-[0_15px_45px_rgba(0,0,0,0.25)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
              <Plus className="w-6 h-6" strokeWidth={3} />
              Lập phiếu
            </button>
          )}
        </div>
      </div>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-12">
        <div className="lg:col-span-2 lg:row-span-2 min-h-[400px] md:min-h-[600px]">
          {renderWalletCard('CASH', 'large')}
        </div>
        <div className="min-h-[200px] md:h-[320px]">
          {renderWalletCard('BANK')}
        </div>
        <div className="min-h-[200px] md:h-[320px]">
          {renderWalletCard('DEBT')}
        </div>
        <div className="min-h-[200px] md:h-[320px]">
          {renderWalletCard('REVENUE')}
        </div>
        <div className="min-h-[200px] md:h-[320px]">
          {renderWalletCard('RECEIVABLE')}
        </div>
      </div>

      {/* Transaction Section */}
      <div className="space-y-8 md:space-y-12">
        {can(PERMISSION_KEYS.VIEW_MONEY_TRANSACTION_HISTORY) && (
          <div className="space-y-8 md:space-y-12">
            {/* Transaction Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
              <div className="flex items-center gap-6">
                <div className="p-5 bg-slate-900 text-white rounded-[24px] shadow-xl shadow-slate-200"><Clock size={32} /></div>
                <div>
                  <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">Dòng tiền</h2>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-black rounded-full uppercase tracking-widest">
                      {transactions.length} Giao dịch
                    </span>
                  </div>
                </div>
              </div>

              {/* Time Filter - Moved here, Apple Styled */}
              <div className="flex items-center gap-2 p-2 bg-white/60 backdrop-blur-md rounded-[24px] border border-white shadow-sm overflow-x-auto no-scrollbar scroll-smooth">
                <div className="flex items-center gap-1 min-w-max">
                  {QUICK_RANGES.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => handleRangeChange(r.id)}
                      className={cn(
                        "px-6 py-3 md:px-8 md:py-3.5 rounded-[18px] text-[11px] md:text-[13px] font-bold transition-all uppercase tracking-widest whitespace-nowrap",
                        rangeType === r.id 
                          ? "bg-slate-900 text-white shadow-lg scale-[1.02]" 
                          : "text-slate-500 hover:text-slate-900 hover:bg-white/80"
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* List Container */}
            <div className="bg-white/80 backdrop-blur-2xl rounded-[40px] md:rounded-[60px] border border-white shadow-[0_20px_80px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-full">
                  {loading ? (
                    <div className="py-32 text-center">
                      <div className="inline-block w-10 h-10 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="py-32 text-center text-slate-300 font-black uppercase tracking-[0.2em] text-lg">Không có dữ liệu</div>
                  ) : (
                    <div className="divide-y divide-slate-50 p-4 md:p-8 space-y-4">
                      {transactions.map((tx) => {
                        const dateObj = new Date(tx.occurred_at);
                        const timeStr = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
                        const dateStr = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

                        return (
                        <div
                          key={tx.id}
                          onClick={() => tx.ref_id ? setHistoryModal({ open: true, bookingId: tx.ref_id }) : null}
                          className={cn(
                            "group bg-white rounded-[28px] border border-slate-100 hover:border-slate-900/10 hover:shadow-[0_15px_40px_rgba(0,0,0,0.05)] transition-all duration-500 cursor-pointer overflow-hidden flex items-stretch min-h-[90px] md:min-h-[110px]",
                            tx.flow_type === 'IN' ? "border-l-[10px] border-l-emerald-500" : "border-l-[10px] border-l-rose-500"
                          )}
                        >
                          <div className="flex items-stretch">
                             <div className="px-6 md:px-10 flex flex-col justify-center items-center bg-slate-50/30 border-r border-slate-50 min-w-[100px] md:min-w-[140px]">
                                <span className="text-lg md:text-xl font-black text-slate-800 leading-none mb-1.5">{timeStr}</span>
                                <span className="text-[11px] md:text-[13px] font-bold text-slate-400 leading-none uppercase tracking-widest">{dateStr}</span>
                             </div>
                          </div>

                          <div className="flex-1 px-8 md:px-12 py-4 flex flex-col justify-center min-w-0">
                            <div className="mb-1.5 flex items-center gap-3">
                              <span className="text-[11px] md:text-[12px] font-black uppercase tracking-[0.15em] text-slate-400">
                                {tx.category}
                              </span>
                              {tx.is_auto && (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-[9px] font-black rounded uppercase">Tự động</span>
                              )}
                            </div>
                            
                            <div className="flex items-center">
                              <span className="font-black text-slate-900 text-lg md:text-2xl tracking-tight leading-tight line-clamp-1">
                                  {(() => {
                                    const parts = [];
                                    if (tx.customer_name) parts.push(tx.customer_name);
                                    if (tx.room_name) parts.push(`Phòng ${tx.room_name}`);
                                    
                                    let action = tx.description || '';
                                    if (tx.category === 'Tiền phòng' || tx.category === 'Tiền cọc') {
                                       if (action.toLowerCase().includes('checkout') || action.toLowerCase().includes('thanh toán phòng')) action = 'Trả phòng';
                                       else if (action.toLowerCase().includes('cọc')) action = 'Cọc phòng';
                                       else if (action.toLowerCase().includes('nhận phòng')) action = 'Nhận phòng';
                                    }
                                    
                                    if (tx.room_name) {
                                       const roomRegex = new RegExp(`Phòng ${tx.room_name}|${tx.room_name}`, 'gi');
                                       action = action.replace(roomRegex, '').replace(/\s+/g, ' ').trim();
                                       if (action.startsWith('-')) action = action.substring(1).trim();
                                    }
                                    
                                    if (action && action !== tx.category) {
                                      parts.push(action);
                                    } else if (parts.length === 0) {
                                      parts.push(tx.description || tx.category);
                                    }
                                    
                                    return parts.join(' • ');
                                  })()}
                              </span>
                            </div>
                          </div>
                          
                          <div className="px-8 md:px-14 py-4 flex flex-col justify-center items-end border-l border-slate-50 min-w-[180px] md:min-w-[240px] bg-slate-50/20">
                             <span className={cn(
                               "font-black tracking-tighter text-2xl md:text-4xl",
                               tx.flow_type === 'IN' ? "text-emerald-600" : "text-rose-600"
                             )}>
                               {tx.flow_type === 'IN' ? '+' : '-'}{formatMoney(tx.amount)}
                             </span>
                             
                             <div className="mt-2 flex items-center gap-3">
                                <div className="flex items-center gap-1.5 text-[11px] md:text-[12px] font-bold text-slate-400">
                                  <User size={12} />
                                  <span>{tx.staff_name || tx.verified_by_staff_name || 'Hệ thống'}</span>
                                </div>
                                
                                <span className={cn(
                                   "text-[10px] md:text-[11px] uppercase font-black px-3 py-1 rounded-full border shadow-sm",
                                   (!tx.payment_method_code || tx.payment_method_code?.toLowerCase() === 'cash') 
                                     ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                                     : "bg-blue-50 text-blue-700 border-blue-100"
                                 )}>
                                   {(() => {
                                     const code = (tx.payment_method_code || 'cash').toLowerCase();
                                     if (code === 'cash') return 'Tiền mặt';
                                     if (code === 'pos') return 'Thẻ POS';
                                     if (code === 'credit') return 'Công nợ';
                                     return 'Chuyển khoản';
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
          </div>
        )}
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

      <ReceivableDetailModal
        isOpen={isReceivableModalOpen}
        onClose={() => setIsReceivableModalOpen(false)}
      />

      {/* Floating Action Button for Mobile */}
      {can(PERMISSION_KEYS.CREATE_TRANSACTION) && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="md:hidden fixed bottom-10 right-6 z-50 w-16 h-16 bg-slate-900 text-white rounded-full shadow-2xl shadow-slate-900/40 flex items-center justify-center active:scale-90 transition-all duration-300"
        >
          <Plus size={32} strokeWidth={3} />
        </button>
      )}

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
