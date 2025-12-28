'use client';

import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Wallet, Calendar, PieChart as PieChartIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CashflowSummary, CashflowTransaction } from '@/types';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Legend, 
  Tooltip as RechartsTooltip 
} from 'recharts';

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
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);
  };

  const incomeData = useMemo(() => {
    const data: Record<string, { name: string; value: number }> = {};
    transactions.filter(t => t.type === 'income').forEach(t => {
      if (!data[t.category_name]) {
        data[t.category_name] = { name: t.category_name, value: 0 };
      }
      data[t.category_name].value += t.amount;
    });
    return Object.values(data);
  }, [transactions]);

  const expenseData = useMemo(() => {
    const data: Record<string, { name: string; value: number }> = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      if (!data[t.category_name]) {
        data[t.category_name] = { name: t.category_name, value: 0 };
      }
      data[t.category_name].value += t.amount;
    });
    return Object.values(data);
  }, [transactions]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6'];

  const cards = [
    {
      title: 'Tổng Thu',
      value: summary.total_income,
      icon: <TrendingUp className="text-emerald-500" size={24} />,
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-700',
    },
    {
      title: 'Tổng Chi',
      value: summary.total_expense,
      icon: <TrendingDown className="text-rose-500" size={24} />,
      bgColor: 'bg-rose-50',
      textColor: 'text-rose-700',
    },
    {
      title: 'Thực Thu',
      value: summary.net_profit,
      icon: <Wallet className={cn(summary.net_profit >= 0 ? 'text-blue-500' : 'text-amber-500')} size={24} />,
      bgColor: summary.net_profit >= 0 ? 'bg-blue-50' : 'bg-amber-50',
      textColor: summary.net_profit >= 0 ? 'text-blue-700' : 'text-amber-700',
    },
  ];

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Thống kê tài chính</h2>
        <div className="flex bg-slate-100 p-1 rounded-2xl gap-1 self-start">
          {[
            { id: 'today', label: 'Hôm nay' },
            { id: 'week', label: 'Tuần này' },
            { id: 'month', label: 'Tháng này' },
            { id: 'all', label: 'Tất cả' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setTimeFilter(f.id as any)}
              className={cn(
                "px-6 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all",
                timeFilter === f.id 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {cards.map((card, index) => (
          <Card key={index} className="border-none shadow-sm overflow-hidden rounded-[2.5rem] bg-white">
            <CardContent className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div className={cn("p-4 rounded-2xl", card.bgColor)}>
                  {card.icon}
                </div>
                <Calendar className="text-slate-200" size={20} />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                {card.title}
              </p>
              <h3 className={cn("text-3xl font-black tracking-tighter", card.textColor)}>
                {formatCurrency(card.value)}
              </h3>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Income Chart */}
        <Card className="border-none shadow-sm rounded-[3rem] bg-white overflow-hidden">
          <CardContent className="p-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                <PieChartIcon size={20} />
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Cơ cấu Nguồn Thu</h3>
            </div>
            <div className="h-[350px] w-full">
              {incomeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={incomeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={8}
                      dataKey="value"
                    >
                      {incomeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '15px' }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      formatter={(value) => <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 font-bold text-sm italic">
                  Chưa có dữ liệu nguồn thu
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Expense Chart */}
        <Card className="border-none shadow-sm rounded-[3rem] bg-white overflow-hidden">
          <CardContent className="p-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                <PieChartIcon size={20} />
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Cơ cấu Khoản Chi</h3>
            </div>
            <div className="h-[350px] w-full">
              {expenseData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={8}
                      dataKey="value"
                    >
                      {expenseData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '15px' }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36}
                      formatter={(value) => <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 font-bold text-sm italic">
                  Chưa có dữ liệu khoản chi
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
