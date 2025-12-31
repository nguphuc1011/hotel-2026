import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Wallet, Calendar, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CashflowSummary, CashflowTransaction } from '@/types';

interface CashflowDashboardProps {
  summary: CashflowSummary;
  transactions: CashflowTransaction[];
  timeFilter: 'today' | 'week' | 'month' | 'all';
  setTimeFilter: (filter: 'today' | 'week' | 'month' | 'all') => void;
}

export const CashflowDashboard: React.FC<CashflowDashboardProps> = ({
  summary,
  transactions,
  timeFilter,
  setTimeFilter,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);
  };

  const methodBreakdown = useMemo(() => {
    const income = { room: 0, service: 0, other: 0, cash: 0, transfer: 0, card: 0 };
    const expense = { cash: 0, transfer: 0, card: 0 };
    
    transactions.forEach(t => {
      const amount = t.amount || 0;
      const method = t.payment_method || 'cash';
      const catName = (t.category_name || '').toLowerCase();
      
      if (t.type === 'income') {
        // Breakdown by source
        if (catName.includes('phòng')) income.room += amount;
        else if (catName.includes('dịch vụ') || catName.includes('dv')) income.service += amount;
        else income.other += amount;

        // Breakdown by method
        if (method === 'cash') income.cash += amount;
        else if (method === 'transfer') income.transfer += amount;
        else if (method === 'card') income.card += amount;
      } else {
        if (method === 'cash') expense.cash += amount;
        else if (method === 'transfer') expense.transfer += amount;
        else if (method === 'card') expense.card += amount;
      }
    });
    
    return { income, expense };
  }, [transactions]);

  const stats = [
    {
      title: 'Tổng Thu',
      value: summary.total_income,
      icon: <TrendingUp size={16} />,
      color: 'emerald',
      bg: 'bg-emerald-500',
    },
    {
      title: 'Tổng Chi',
      value: summary.total_expense,
      icon: <TrendingDown size={16} />,
      color: 'rose',
      bg: 'bg-rose-500',
    }
  ];

  return (
    <div className="space-y-4">
      {/* Time Filter - Integrated */}
      <div className="bg-white p-3 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-100/30 flex justify-between items-center mb-8">
        <div className="flex bg-slate-50/80 p-1.5 rounded-[2rem] gap-1 flex-1">
          {[
            { id: 'today', label: 'HÔM NAY' },
            { id: 'week', label: 'TUẦN' },
            { id: 'month', label: 'THÁNG' },
            { id: 'all', label: 'TẤT CẢ' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setTimeFilter(f.id as any)}
              className={cn(
                "flex-1 py-3 px-2 text-[10px] font-black tracking-[0.2em] rounded-[1.5rem] transition-all",
                timeFilter === f.id 
                  ? "bg-white text-slate-900 shadow-lg shadow-slate-200 border border-slate-100 scale-[1.02]" 
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-4 p-4 bg-indigo-600 text-white rounded-[1.5rem] shadow-xl shadow-indigo-200 shrink-0">
          <Calendar size={22} />
        </div>
      </div>

      {/* Main Net Profit Card - Folio Style */}
      <div 
        onClick={() => setShowDetails(!showDetails)}
        className={cn(
          "relative overflow-hidden p-10 rounded-[3.5rem] border shadow-[0_35px_60px_-15px_rgba(0,0,0,0.1)] transition-all duration-500 mb-10 cursor-pointer group active:scale-[0.98]",
          summary.net_profit >= 0 
            ? "bg-gradient-to-br from-indigo-600 via-indigo-600 to-blue-700 border-white/10" 
            : "bg-gradient-to-br from-rose-600 via-rose-600 to-pink-700 border-white/10"
        )}
      >
        {/* Completely fixed wallet icon - moved to top left and extremely faint to avoid any text overlap */}
        <div className="absolute -left-12 -top-12 opacity-[0.02] transform -rotate-12 group-hover:scale-110 transition-transform duration-1000 text-white">
          <Wallet size={280} />
        </div>
        
        <div className="relative z-10">
          <div className="absolute top-0 right-0">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border border-white/10 backdrop-blur-md",
              showDetails ? "bg-white/20 rotate-180" : "bg-white/10"
            )}>
              <ChevronDown size={24} className="text-white" />
            </div>
          </div>

          <div className="flex flex-col mb-10">
            <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-3">
              Lợi nhuận ròng
            </p>
            <div className="flex items-baseline gap-2">
              <h2 className="text-5xl font-black text-white tracking-tighter">
                {formatCurrency(summary.net_profit).split(' ')[0]}
              </h2>
              <span className="text-2xl font-black text-white/30">₫</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-6">
            {!showDetails && (
              <div className="flex gap-12 items-center">
                <div className="flex flex-col">
                  <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Tổng Thu</p>
                  <p className="text-white font-black text-2xl tracking-tight">{formatCurrency(summary.total_income)}</p>
                </div>
                <div className="h-10 w-px bg-white/10" />
                <div className="flex flex-col">
                  <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Tổng Chi</p>
                  <p className="text-white font-black text-2xl tracking-tight">{formatCurrency(summary.total_expense)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Detailed Breakdown - Inside Card */}
          {showDetails && (
            <div className="mt-8 pt-8 border-t border-white/10 space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
              {/* Income Breakdown */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                      <TrendingUp size={16} className="text-emerald-400" />
                    </div>
                    <h3 className="text-[10px] font-black text-white/70 uppercase tracking-widest">Cơ cấu nguồn thu</h3>
                  </div>
                  <span className="text-xl font-black text-white tracking-tight">
                    {formatCurrency(summary.total_income)}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { label: 'Tiền phòng', value: methodBreakdown.income.room, icon: 'bg-indigo-400' },
                    { label: 'Tiền dịch vụ', value: methodBreakdown.income.service, icon: 'bg-blue-400' },
                    { label: 'Khác', value: methodBreakdown.income.other, icon: 'bg-slate-400' }
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2 h-2 rounded-full shadow-sm", item.icon)} />
                        <span className="text-xs font-bold text-white/60">{item.label}</span>
                      </div>
                      <span className="text-base font-black text-white">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expense Breakdown */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-rose-500/20 flex items-center justify-center">
                      <TrendingDown size={16} className="text-rose-400" />
                    </div>
                    <h3 className="text-[10px] font-black text-white/70 uppercase tracking-widest">Cơ cấu khoản chi</h3>
                  </div>
                  <span className="text-xl font-black text-white tracking-tight">
                    {formatCurrency(summary.total_expense)}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { label: 'Tiền mặt (Cash)', value: methodBreakdown.expense.cash, icon: 'bg-rose-400' },
                    { label: 'Chuyển khoản (CK)', value: methodBreakdown.expense.transfer, icon: 'bg-amber-400' },
                    { label: 'Thanh toán thẻ (Card)', value: methodBreakdown.expense.card, icon: 'bg-slate-400' }
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-2 h-2 rounded-full shadow-sm", item.icon)} />
                        <span className="text-xs font-bold text-white/70">{item.label}</span>
                      </div>
                      <span className="text-sm font-black text-white">{formatCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
