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
  ChevronRight,
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
  
  const [rangeType, setRangeType] = useState('TODAY');
  const [dateRange, setDateRange] = useState({
    start: startOfDay(new Date()),
    end: endOfDay(new Date())
  });

  const [balanceStats, setBalanceStats] = useState({
    cash: { opening: 0, in: 0, out: 0, closing: 0 },
    bank: { opening: 0, in: 0, out: 0, closing: 0 },
    receivable: { opening: 0, in: 0, out: 0, closing: 0 },
    debt: { opening: 0, in: 0, out: 0, closing: 0 },
    revenue: { opening: 0, in: 0, out: 0, closing: 0 }
  });

  const displayRawBalance = (amount: number) => {
    return formatMoney(amount).replace('₫', '');
  };

  const handleRangeChange = (type: string) => {
    setRangeType(type);
    const now = new Date();
    let start = new Date();
    let end = new Date();

    switch (type) {
      case 'TODAY': start = startOfDay(now); end = endOfDay(now); break;
      case 'YESTERDAY': const yesterday = subDays(now, 1); start = startOfDay(yesterday); end = endOfDay(yesterday); break;
      case 'WEEK': start = subDays(now, 7); end = endOfDay(now); break;
      case 'MONTH': start = startOfMonth(now); end = endOfMonth(now); break;
      case 'LAST_MONTH': const lastMonth = subMonths(now, 1); start = startOfMonth(lastMonth); end = endOfMonth(lastMonth); break;
      case 'YEAR': start = startOfYear(now); end = endOfYear(now); break;
    }
    setDateRange({ start, end });
  };

  const fetchData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      let actualStart = new Date(dateRange.start);
      let actualEnd = new Date(dateRange.end);
      const currentWallets = await cashFlowService.getWallets();
      setWallets(currentWallets);

      try {
        const debtors = await customerService.getDebtors();
        const totalCustomerDebt = debtors.reduce((sum, d) => sum + Math.abs(d.balance), 0);
        setCustomerDebt(totalCustomerDebt);
      } catch (err) { console.error(err); }

      const { data } = await cashFlowService.getTransactions(1, 1000, {
        startDate: actualStart,
        endDate: actualEnd,
        excludePaymentMethod: ['credit', 'deposit_transfer']
      });
      setTransactions(data);

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

        const cashTxs = data.filter(t => !t.payment_method_code || t.payment_method_code === 'cash');
        const bankTxs = data.filter(t => t.payment_method_code === 'bank' || t.payment_method_code === 'transfer' || t.payment_method_code === 'qr');

        const calcStats = (opening: number, closing: number) => {
             const net = closing - opening;
             return { opening, in: net > 0 ? net : 0, out: net < 0 ? -net : 0, closing };
        };
        
        const calcDetailedStats = (opening: number, closing: number, txs: CashFlowTransaction[]) => {
             const totalIn = txs.filter(t => t.flow_type === 'IN').reduce((sum, t) => sum + t.amount, 0);
             const totalOut = txs.filter(t => t.flow_type === 'OUT').reduce((sum, t) => sum + t.amount, 0);
             return { opening, in: totalIn, out: totalOut, closing };
        };

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
    const channel = supabase
    .channel('money-page-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_flow' }, () => fetchData(true))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wallets' }, () => fetchData(true))
    .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dateRange]);

  if (isAuthLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div></div>;
  }

  if (!can(PERMISSION_KEYS.VIEW_MONEY)) {
     return <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]"><div className="text-center"><ShieldCheck size={48} className="mx-auto text-slate-300 mb-4" /><h1 className="text-xl font-bold text-slate-700">Không có quyền truy cập</h1><p className="text-slate-500">Vui lòng liên hệ quản lý.</p></div></div>;
  }

  const walletConfigs: Record<string, { icon: React.ReactNode; label: string; subLabel: string; color: string; gradient: string }> = {
    CASH: {
      icon: <Banknote size={24} />,
      label: 'Tiền mặt',
      subLabel: 'Két an toàn',
      color: 'emerald',
      gradient: 'from-emerald-500 to-emerald-600'
    },
    BANK: {
      icon: <CreditCard size={20} />,
      label: 'Ngân hàng',
      subLabel: 'Tài khoản',
      color: 'blue',
      gradient: 'from-blue-500 to-blue-600'
    },
    DEBT: {
      icon: <Users size={20} />,
      label: 'Công nợ khách',
      subLabel: 'Phòng đã trả',
      color: 'rose',
      gradient: 'from-rose-500 to-rose-600'
    },
    RECEIVABLE: {
      icon: <Lock size={20} />,
      label: 'Công nợ tạm',
      subLabel: 'Khách đang ở',
      color: 'amber',
      gradient: 'from-amber-500 to-amber-600'
    },
    REVENUE: {
      icon: <TrendingUp size={20} />,
      label: 'Doanh thu',
      subLabel: 'Doanh thu thuần',
      color: 'indigo',
      gradient: 'from-indigo-500 to-indigo-600'
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-slate-900 font-sans selection:bg-slate-900 selection:text-white">
      {SecurityModals}
      
      {/* 1. TOP NAV / HEADER */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-[1600px] mx-auto px-4 md:px-10 h-20 md:h-24 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">Quỹ tiền</h1>
            <span className="hidden md:block text-slate-400 font-medium text-sm">Quản lý dòng tiền khách sạn</span>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            {can(PERMISSION_KEYS.FINANCE_ADJUST_WALLET) && (
              <button 
                onClick={() => setIsAdjustmentModalOpen(true)}
                className="h-10 md:h-12 px-4 md:px-6 bg-white text-slate-600 rounded-full text-[13px] font-bold border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2"
              >
                <AlertTriangle size={16} />
                <span className="hidden sm:inline">Điều chỉnh</span>
              </button>
            )}
            {can(PERMISSION_KEYS.CREATE_TRANSACTION) && (
              <button 
                onClick={() => setIsModalOpen(true)}
                className="h-10 md:h-12 px-5 md:px-8 bg-slate-900 text-white rounded-full text-[13px] font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
              >
                <Plus size={18} strokeWidth={3} />
                <span>Lập phiếu</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-4 md:px-10 py-8 md:py-12 space-y-10 md:space-y-16">
        
        {/* 2. HERO SECTION - CASH WALLET */}
        <section className="relative">
          <div className="bg-white rounded-[32px] md:rounded-[48px] p-8 md:p-16 border border-slate-200/60 shadow-[0_20px_50px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col md:flex-row items-center justify-between gap-10">
            {/* Background Accent */}
            <div className="absolute top-0 right-0 p-10 opacity-[0.02] pointer-events-none">
              <Banknote size={400} strokeWidth={0.5} />
            </div>

            <div className="relative z-10 text-center md:text-left space-y-6 md:space-y-8 flex-1">
              <div className="flex flex-col items-center md:items-start gap-3">
                <div className="px-4 py-1.5 bg-emerald-500/10 text-emerald-600 rounded-full text-[11px] font-black uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Tiền mặt thực tế
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl md:text-[80px] font-black tracking-tighter text-slate-900 leading-none">
                    {displayRawBalance(balanceStats.cash.closing)}
                  </span>
                  <span className="text-xl md:text-4xl font-black text-slate-200 tracking-tighter uppercase">₫</span>
                </div>
                <p className="text-slate-400 font-bold text-sm md:text-lg">Số dư hiện tại trong két an toàn</p>
              </div>
            </div>

            <div className="relative z-10 w-full md:w-auto grid grid-cols-3 md:flex md:flex-col gap-4 md:gap-8 min-w-[300px]">
              <div className="space-y-1 text-center md:text-right">
                <p className="text-[10px] md:text-[12px] font-black text-slate-400 uppercase tracking-widest">Tồn đầu</p>
                <p className="text-sm md:text-2xl font-black text-slate-800 tracking-tight">{formatMoney(balanceStats.cash.opening)}</p>
              </div>
              <div className="space-y-1 text-center md:text-right border-x md:border-x-0 md:border-y border-slate-100 py-0 md:py-6 px-2 md:px-0">
                <p className="text-[10px] md:text-[12px] font-black text-emerald-500/70 uppercase tracking-widest">Tổng thu</p>
                <p className="text-sm md:text-2xl font-black text-emerald-600 tracking-tight">+{formatMoney(balanceStats.cash.in)}</p>
              </div>
              <div className="space-y-1 text-center md:text-right">
                <p className="text-[10px] md:text-[12px] font-black text-rose-500/70 uppercase tracking-widest">Tổng chi</p>
                <p className="text-sm md:text-2xl font-black text-rose-600 tracking-tight">-{formatMoney(balanceStats.cash.out)}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. SECONDARY WALLETS ROW */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {['BANK', 'DEBT', 'RECEIVABLE', 'REVENUE'].map((id) => {
            const config = walletConfigs[id];
            const stats = id === 'BANK' ? balanceStats.bank : id === 'DEBT' ? balanceStats.debt : id === 'RECEIVABLE' ? balanceStats.receivable : balanceStats.revenue;
            const isClickable = id === 'DEBT' || id === 'RECEIVABLE';

            return (
              <div 
                key={id}
                onClick={() => {
                  if (id === 'DEBT') setIsCustomerDebtModalOpen(true);
                  if (id === 'RECEIVABLE') setIsReceivableModalOpen(true);
                }}
                className={cn(
                  "bg-white rounded-[32px] p-6 md:p-8 border border-slate-200/60 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all duration-500 group relative overflow-hidden",
                  isClickable && "cursor-pointer"
                )}
              >
                <div className="flex items-center justify-between mb-8">
                  <div className={cn("p-3 rounded-2xl text-white shadow-lg", `bg-gradient-to-br ${config.gradient}`)}>
                    {config.icon}
                  </div>
                  {isClickable && <div className="text-slate-300 group-hover:text-slate-900 transition-colors"><ChevronRight size={20} /></div>}
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{config.label}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className={cn("text-2xl md:text-3xl font-black tracking-tight", stats.closing < 0 ? "text-rose-600" : "text-slate-900")}>
                      {displayRawBalance(stats.closing)}
                    </span>
                    <span className="text-xs font-black text-slate-300 uppercase">₫</span>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-slate-300 uppercase leading-none mb-1">Thu</span>
                      <span className="text-xs font-black text-emerald-600">+{formatMoney(stats.in)}</span>
                    </div>
                    <div className="w-px h-6 bg-slate-100 mx-1" />
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-slate-300 uppercase leading-none mb-1">Chi</span>
                      <span className="text-xs font-black text-rose-600">-{formatMoney(stats.out)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* 4. TRANSACTION LIST SECTION */}
        <section className="space-y-8">
          {/* Header & Filter */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 px-2">
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-900 text-white rounded-2xl"><Clock size={24} /></div>
                <h2 className="text-3xl font-black tracking-tight">Dòng tiền</h2>
              </div>
              <p className="text-slate-400 font-bold text-sm ml-16">Chi tiết biến động quỹ theo thời gian</p>
            </div>

            {/* Time Filter Bar */}
            <div className="flex items-center gap-1.5 p-1.5 bg-white rounded-full border border-slate-200 shadow-sm overflow-x-auto no-scrollbar max-w-full">
              {QUICK_RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleRangeChange(r.id)}
                  className={cn(
                    "px-5 py-2.5 rounded-full text-[12px] font-bold transition-all whitespace-nowrap",
                    rangeType === r.id 
                      ? "bg-slate-900 text-white shadow-md" 
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* List Card */}
          {can(PERMISSION_KEYS.VIEW_MONEY_TRANSACTION_HISTORY) && (
            <div className="bg-white rounded-[40px] border border-slate-200/60 shadow-sm overflow-hidden">
              <div className="min-w-full">
                {loading ? (
                  <div className="py-32 text-center"><div className="inline-block w-10 h-10 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" /></div>
                ) : transactions.length === 0 ? (
                  <div className="py-32 text-center text-slate-300 font-black uppercase tracking-[0.2em]">Không có dữ liệu</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {transactions.map((tx) => {
                      const dateObj = new Date(tx.occurred_at);
                      const timeStr = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
                      const dateStr = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

                      return (
                        <div
                          key={tx.id}
                          onClick={() => tx.ref_id ? setHistoryModal({ open: true, bookingId: tx.ref_id }) : null}
                          className="group hover:bg-slate-50/50 transition-all duration-300 cursor-pointer flex items-center p-6 md:p-8 gap-6 md:gap-10"
                        >
                          {/* Time Column */}
                          <div className="flex flex-col items-center min-w-[60px] md:min-w-[80px]">
                            <span className="text-base md:text-lg font-black text-slate-900 leading-none mb-1">{timeStr}</span>
                            <span className="text-[10px] md:text-[11px] font-bold text-slate-400 uppercase tracking-tighter">{dateStr}</span>
                          </div>

                          {/* Category Icon */}
                          <div className={cn(
                            "w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                            tx.flow_type === 'IN' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                          )}>
                            {tx.flow_type === 'IN' ? <ArrowDownRight size={24} strokeWidth={2.5} /> : <ArrowUpRight size={24} strokeWidth={2.5} />}
                          </div>

                          {/* Content Column */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="text-[10px] md:text-[11px] font-black uppercase tracking-widest text-slate-400">{tx.category}</span>
                              {tx.is_auto && <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-[8px] font-black rounded uppercase">Auto</span>}
                            </div>
                            <h4 className="text-sm md:text-lg font-black text-slate-900 tracking-tight truncate group-hover:text-slate-600 transition-colors">
                              {(() => {
                                const parts = [];
                                if (tx.customer_name) parts.push(tx.customer_name);
                                if (tx.room_name) parts.push(`P.${tx.room_name}`);
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
                                if (action && action !== tx.category) parts.push(action);
                                return parts.join(' • ');
                              })()}
                            </h4>
                          </div>

                          {/* Amount Column */}
                          <div className="text-right shrink-0">
                            <div className={cn(
                              "text-lg md:text-2xl font-black tracking-tighter mb-1",
                              tx.flow_type === 'IN' ? "text-emerald-600" : "text-rose-600"
                            )}>
                              {tx.flow_type === 'IN' ? '+' : '-'}{formatMoney(tx.amount)}
                            </div>
                            <div className="flex items-center justify-end gap-3">
                              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                                {(() => {
                                  const code = (tx.payment_method_code || 'cash').toLowerCase();
                                  if (code === 'cash') return 'Tiền mặt';
                                  if (code === 'pos') return 'POS';
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
          )}
        </section>
      </main>

      {/* Modals */}
      <TransactionModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setSelectedTransaction(null); setInitialTransactionData(undefined); setInitialSearchTerm(undefined); }}
        onSuccess={() => fetchData()} 
        transaction={selectedTransaction}
        initialData={initialTransactionData}
        initialSearchTerm={initialSearchTerm}
      />
      <WalletAdjustmentModal isOpen={isAdjustmentModalOpen} onClose={() => setIsAdjustmentModalOpen(false)} onSuccess={() => fetchData()} wallets={wallets} />
      <ReceivableDetailModal isOpen={isReceivableModalOpen} onClose={() => setIsReceivableModalOpen(false)} />
      <CustomerDebtModal isOpen={isCustomerDebtModalOpen} onClose={() => setIsCustomerDebtModalOpen(false)} />
      {historyModal.bookingId && <BookingHistoryModal isOpen={historyModal.open} onClose={() => setHistoryModal({ open: false, bookingId: null })} bookingId={historyModal.bookingId} />}

      {/* Floating Action Button for Mobile */}
      {can(PERMISSION_KEYS.CREATE_TRANSACTION) && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="md:hidden fixed bottom-10 right-6 z-50 w-16 h-16 bg-slate-900 text-white rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all"
        >
          <Plus size={32} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}
