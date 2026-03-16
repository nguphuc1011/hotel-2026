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
  { id: 'WEEK', label: '7 ngày qua' },
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
        label: 'TIỀN MẶT',
        subLabel: 'Két an toàn',
        color: 'emerald',
        gradient: 'from-emerald-50 to-white'
      },
      BANK: {
        icon: <div className="p-3 bg-blue-500/10 text-blue-600 rounded-[20px] backdrop-blur-md border border-blue-500/20"><CreditCard size={24} strokeWidth={2.5} /></div>,
        label: 'NGÂN HÀNG',
        subLabel: 'Tài khoản',
        color: 'blue',
        gradient: 'from-blue-50 to-white'
      },
      DEBT: {
        icon: <div className="p-3 bg-rose-500/10 text-rose-600 rounded-[20px] backdrop-blur-md border border-rose-500/20"><Users size={24} strokeWidth={2.5} /></div>,
        label: 'CÔNG NỢ KHÁCH',
        subLabel: 'Khách đã trả phòng',
        color: 'rose',
        gradient: 'from-rose-50 to-white'
      },
      RECEIVABLE: {
        icon: <div className="p-3 bg-amber-500/10 text-amber-600 rounded-[20px] backdrop-blur-md border border-amber-500/20"><Lock size={24} strokeWidth={2.5} /></div>,
        label: 'CÔNG NỢ TẠM',
        subLabel: 'Khách đang ở',
        color: 'amber',
        gradient: 'from-amber-50 to-white'
      },
      REVENUE: {
        icon: <div className="p-3 bg-indigo-500/10 text-indigo-600 rounded-[20px] backdrop-blur-md border border-indigo-500/20"><TrendingUp size={24} strokeWidth={2.5} /></div>,
        label: 'DOANH THU',
        subLabel: 'Doanh thu thuần',
        color: 'indigo',
        gradient: 'from-indigo-50 to-white'
      }
    };

    const config = walletConfigs[walletId] || { icon: null, label: walletId, subLabel: '', color: 'slate', gradient: 'from-slate-50 to-white' };

    if (type === 'large') {
      return (
        <div className={cn(
          "bg-white rounded-[32px] md:rounded-[40px] p-6 md:p-10 border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] transition-all duration-500 group relative overflow-hidden h-full flex flex-col justify-between",
          "before:absolute before:inset-0 before:bg-gradient-to-br before:opacity-50 before:transition-opacity",
          config.gradient
        )}>
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 p-6 md:p-12 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-700 pointer-events-none rotate-12 group-hover:rotate-0">
            <Banknote className="w-40 h-40 md:w-60 md:h-60" strokeWidth={1} />
          </div>

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8 md:mb-12">
              <div className="flex items-center gap-4 md:gap-6">
                {config.icon}
                <div>
                  <h3 className="text-[17px] md:text-[12px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{config.label}</h3>
                  <p className="text-[17px] md:text-lg font-black text-slate-900 tracking-tight opacity-40">{config.subLabel}</p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="px-3 py-1 md:px-4 md:py-1.5 bg-white/80 backdrop-blur-sm text-slate-900 text-[13px] md:text-[11px] font-black rounded-xl md:rounded-2xl shadow-sm border border-slate-100 uppercase tracking-widest">VNĐ</span>
              </div>
            </div>

            <div className="mb-6 md:mb-10">
              <div className="flex items-baseline gap-2 md:gap-4 overflow-hidden">
                <span className="text-7xl md:text-[80px] font-black text-slate-900 tracking-[-0.05em] leading-none truncate">
                  {displayRawBalance(stats.closing)}
                </span>
                <span className="text-3xl md:text-4xl font-black text-slate-200 tracking-tighter uppercase mb-1 md:mb-2">₫</span>
              </div>
              <p className="text-base md:text-base font-bold text-slate-400 mt-4 md:mt-6 flex items-center gap-2">
                <span className="w-2.5 h-2.5 md:w-2 md:h-2 rounded-full bg-emerald-500 animate-pulse" />
                Số dư thực tế trong két
              </p>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-3 md:gap-8 pt-6 md:pt-10 border-t border-slate-100/50">
            <div className="space-y-1 md:space-y-1">
              <p className="text-[13px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Tồn đầu</p>
              <p className="text-base md:text-xl font-black text-slate-800 tracking-tight truncate">{formatMoney(stats.opening)}</p>
            </div>
            <div className="space-y-1 md:space-y-1">
              <p className="text-[13px] md:text-[10px] font-black text-emerald-500/70 uppercase tracking-widest">Tổng thu</p>
              <p className="text-base md:text-xl font-black text-emerald-600 tracking-tight truncate">+{formatMoney(stats.in)}</p>
            </div>
            <div className="space-y-1 md:space-y-1">
              <p className="text-[13px] md:text-[10px] font-black text-rose-500/70 uppercase tracking-widest">Tổng chi</p>
              <p className="text-base md:text-xl font-black text-rose-600 tracking-tight truncate">-{formatMoney(stats.out)}</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div 
        className={cn(
          "bg-white rounded-[28px] md:rounded-[36px] p-5 md:p-8 border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_15px_40px_rgba(0,0,0,0.06)] transition-all duration-500 group relative overflow-hidden h-full flex flex-col justify-between cursor-pointer",
          config.gradient
        )}
        onClick={() => {
          if (walletId === 'DEBT') setIsCustomerDebtModalOpen(true);
          if (walletId === 'RECEIVABLE') setIsReceivableModalOpen(true);
        }}
      >
        <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none -rotate-12 group-hover:rotate-0">
          {isBank && <CreditCard className="w-32 h-32 md:w-44 md:h-44" strokeWidth={1} />}
          {isDebt && <Users className="w-32 h-32 md:w-44 md:h-44" strokeWidth={1} />}
          {isReceivable && <Lock className="w-32 h-32 md:w-44 md:h-44" strokeWidth={1} />}
          {isRevenue && <TrendingUp className="w-32 h-32 md:w-44 md:h-44" strokeWidth={1} />}
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 md:gap-5 mb-6 md:mb-8">
            <div className="scale-75 md:scale-100 origin-left">
              {config.icon}
            </div>
            <div>
              <h3 className="text-[17px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1 leading-none">{config.label}</h3>
              <p className="text-[17px] md:text-sm font-black text-slate-900 tracking-tight opacity-30 leading-none">{config.subLabel}</p>
            </div>
          </div>

          <div className="mb-4 md:mb-8">
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

          <div className="relative z-10 pt-4 md:pt-6 border-t border-slate-100/50">
            {isDebt || isReceivable ? (
              <div className={cn(
                "w-full flex items-center justify-between group/btn",
                isDebt ? "text-rose-600" : "text-amber-600"
              )}>
                <span className="text-[17px] md:text-[11px] font-black uppercase tracking-widest">Chi tiết</span>
                <div className={cn(
                  "w-12 h-12 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all duration-300 group-hover/btn:translate-x-1 shadow-sm",
                  isDebt ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                )}>
                  <ArrowUpRight className="w-6 h-6 md:w-5 md:h-5" strokeWidth={3} />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Thu</span>
                    <span className="text-xl md:text-base font-black text-emerald-600">+{formatMoney(stats.in)}</span>
                  </div>
                  <div className="flex items-center gap-3">
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
    <div className="min-h-screen bg-slate-50/30 p-4 md:p-10 pb-32 space-y-6 md:space-y-12">
      {SecurityModals}
      {/* Header */}
      <div className="flex flex-col gap-6 md:gap-8">
        <div className="flex items-center justify-between">
          <div className="relative">
            <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-[-0.04em]">Quỹ tiền</h1>
            <div className="absolute -top-1 -right-3 w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
          </div>
          
          <div className="hidden md:flex items-center gap-3 md:gap-4">
            {can(PERMISSION_KEYS.FINANCE_ADJUST_WALLET) && (
              <button 
                onClick={() => setIsAdjustmentModalOpen(true)}
                className="h-12 md:h-14 px-4 md:px-6 bg-white text-amber-600 rounded-xl md:rounded-[20px] text-[11px] md:text-sm font-black uppercase tracking-widest shadow-sm border border-slate-100 hover:bg-amber-50 transition-all flex items-center justify-center gap-2 md:gap-3"
              >
                <AlertTriangle className="w-4 h-4 md:w-5 md:h-5" />
                Điều chỉnh
              </button>
            )}
            {can(PERMISSION_KEYS.CREATE_TRANSACTION) && (
              <button 
                onClick={() => setIsModalOpen(true)}
                className="h-12 md:h-14 px-4 md:px-8 bg-slate-900 text-white rounded-xl md:rounded-[20px] text-[11px] md:text-sm font-black uppercase tracking-widest shadow-[0_10px_30px_rgba(15,23,42,0.2)] hover:bg-slate-800 transition-all flex items-center justify-center gap-2 md:gap-3"
              >
                <Plus className="w-5 h-5 md:w-6 md:h-6" strokeWidth={3} />
                Lập phiếu
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons for Mobile */}
        <div className="grid grid-cols-2 md:hidden items-center gap-3">
          {can(PERMISSION_KEYS.FINANCE_ADJUST_WALLET) && (
            <button 
              onClick={() => setIsAdjustmentModalOpen(true)}
              className="h-12 px-4 bg-white text-amber-600 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-sm border border-slate-100 active:bg-amber-50 transition-all flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              Điều chỉnh
            </button>
          )}
          {can(PERMISSION_KEYS.CREATE_TRANSACTION) && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="h-12 px-4 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-[0_10px_30px_rgba(15,23,42,0.2)] active:bg-slate-800 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" strokeWidth={3} />
              Lập phiếu
            </button>
          )}
        </div>
        
        {/* Time Filter - Slidable on Mobile */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/50 rounded-xl md:rounded-2xl backdrop-blur-sm overflow-x-auto no-scrollbar scroll-smooth">
          <div className="flex items-center gap-1 min-w-max px-1">
            {QUICK_RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => handleRangeChange(r.id)}
                className={cn(
                  "px-4 py-2 md:px-6 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-[12px] font-black transition-all uppercase tracking-widest whitespace-nowrap",
                  rangeType === r.id 
                    ? "bg-white text-slate-900 shadow-sm" 
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 md:gap-8">
        <div className="lg:col-span-2 lg:row-span-2 min-h-[360px] md:min-h-[500px]">
          {renderWalletCard('CASH', 'large')}
        </div>
        <div className="min-h-[160px] md:h-[280px]">
          {renderWalletCard('BANK')}
        </div>
        <div className="min-h-[160px] md:h-[280px]">
          {renderWalletCard('DEBT')}
        </div>
        <div className="min-h-[160px] md:h-[280px]">
          {renderWalletCard('REVENUE')}
        </div>
        <div className="min-h-[160px] md:h-[280px]">
          {renderWalletCard('RECEIVABLE')}
        </div>
      </div>

      {/* Transaction List */}
      {can(PERMISSION_KEYS.VIEW_MONEY_TRANSACTION_HISTORY) && (
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-8 md:p-10 border-b border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-50 text-slate-600 rounded-2xl"><Clock size={24} /></div>
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Chi tiết dòng tiền</h2>
              </div>
            </div>
            <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[9px] font-black rounded-full uppercase tracking-widest">
              {transactions.length} GD
            </span>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-full">
              {loading ? (
                <div className="py-20 text-center">
                  <div className="inline-block w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                </div>
              ) : transactions.length === 0 ? (
                <div className="py-20 text-center text-slate-400 font-bold uppercase tracking-widest">Không có dữ liệu</div>
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
                      className={cn(
                        "group bg-white rounded-2xl border border-slate-100 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-50/50 transition-all duration-300 cursor-pointer overflow-hidden flex items-stretch min-h-[72px] border-l-4",
                        tx.flow_type === 'IN' ? "border-l-emerald-500" : "border-l-rose-500"
                      )}
                    >
                      
                      {/* Left: Time & Flow Indicator */}
                      <div className="flex items-stretch">
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
                                if (tx.room_name) parts.push(`Phòng ${tx.room_name}`);
                                
                                let action = tx.description || '';
                                // Rút gọn các hành động Booking để dễ đọc
                                if (tx.category === 'Tiền phòng' || tx.category === 'Tiền cọc') {
                                   if (action.toLowerCase().includes('checkout') || action.toLowerCase().includes('thanh toán phòng')) action = 'Trả phòng';
                                   else if (action.toLowerCase().includes('cọc')) action = 'Cọc phòng';
                                   else if (action.toLowerCase().includes('nhận phòng')) action = 'Nhận phòng';
                                }
                                
                                // Loại bỏ lặp lại tên phòng trong mô tả nếu đã có room_name
                                if (tx.room_name) {
                                   const roomRegex = new RegExp(`Phòng ${tx.room_name}|${tx.room_name}`, 'gi');
                                   action = action.replace(roomRegex, '').replace(/\s+/g, ' ').trim();
                                   if (action.startsWith('-')) action = action.substring(1).trim();
                                   if (action.startsWith('()')) action = action.substring(2).trim();
                                }
                                
                                // Thêm hành động vào mảng
                                if (action && action !== tx.category) {
                                  parts.push(action);
                                } else if (parts.length === 0) {
                                  parts.push(tx.description || tx.category);
                                } else if (parts.length === 1 && parts[0] === tx.customer_name) {
                                   // Nếu chỉ có tên khách, thêm category để biết làm gì
                                   parts.push(tx.category);
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
      )}

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
          className="md:hidden fixed bottom-24 right-4 z-50 w-12 h-12 bg-slate-900 text-white rounded-full shadow-xl shadow-slate-900/30 flex items-center justify-center active:scale-90 transition-all duration-300 hover:bg-slate-800"
        >
          <Plus size={24} strokeWidth={2.5} />
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
