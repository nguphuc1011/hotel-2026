'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Plus, 
  Download, 
  Filter, 
  ArrowLeft,
  LayoutDashboard,
  PieChart as PieChartIcon,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  isWithinInterval,
} from 'date-fns';
import { toast } from 'sonner';

import { CashflowTransaction, CashflowSummary, CashflowCategory } from '@/types';
import { CashflowDashboard } from './CashflowDashboard';
import { CashflowTable } from './CashflowTable';
import { CashflowModal } from './CashflowModal';
import { cn } from '@/lib/utils';

export default function FinanceManagement() {
  const [transactions, setTransactions] = useState<CashflowTransaction[]>([]);
  const [categories, setCategories] = useState<CashflowCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch categories
      const { data: catData, error: catError } = await supabase
        .from('cashflow_categories')
        .select('*')
        .order('name');
      
      if (catError) throw catError;
      setCategories(catData || []);

      // Fetch transactions
      const { data: transData, error: transError } = await supabase
        .from('cashflow')
        .select('*')
        .order('created_at', { ascending: false });

      if (transError) throw transError;
      setTransactions(transData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Không thể tải dữ liệu tài chính');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Subscriptions
    const transChannel = supabase
      .channel('cashflow_changes')
      .on('postgres_changes', { event: '*', table: 'cashflow', schema: 'public' }, () => fetchData())
      .subscribe();

    const catChannel = supabase
      .channel('category_changes')
      .on('postgres_changes', { event: '*', table: 'cashflow_categories', schema: 'public' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(transChannel);
      supabase.removeChannel(catChannel);
    };
  }, []);

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    let start: Date, end: Date;

    switch (timeFilter) {
      case 'today':
        start = startOfDay(now);
        end = endOfDay(now);
        break;
      case 'week':
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case 'month':
        start = startOfMonth(now);
        end = endOfMonth(now);
        break;
      case 'all':
        return transactions;
      default:
        return transactions;
    }

    return transactions.filter(t => {
      const date = new Date(t.created_at);
      return isWithinInterval(date, { start, end });
    });
  }, [transactions, timeFilter]);

  const summary = useMemo((): CashflowSummary => {
    return filteredTransactions.reduce(
      (acc, t) => {
        if (t.type === 'income') {
          acc.total_income += t.amount;
        } else {
          acc.total_expense += t.amount;
        }
        acc.net_profit = acc.total_income - acc.total_expense;
        return acc;
      },
      { total_income: 0, total_expense: 0, net_profit: 0 }
    );
  }, [filteredTransactions]);

  const handleSaveTransaction = async (data: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.full_name || user?.email || 'Nhân viên';

      const { error } = await supabase.from('cashflow').insert([{
        ...data,
        created_by: userName,
        created_at: new Date().toISOString()
      }]);

      if (error) throw error;
      toast.success('Ghi nhận thành công');
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving transaction:', error);
      toast.error('Lỗi khi lưu giao dịch');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 lg:p-10 pb-32">
      <div className="max-w-7xl mx-auto space-y-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight mb-2">Quản lý Tài chính</h1>
            <p className="text-slate-500 font-bold text-sm tracking-wide">Phân tích dòng tiền và lập phiếu thu chi</p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              onClick={() => setIsModalOpen(true)}
              className="h-14 px-8 rounded-2xl font-black uppercase text-xs tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-100 gap-2"
            >
              <Plus size={18} /> Lập phiếu mới
            </Button>
          </div>
        </div>

        <div className="space-y-10">
          <CashflowDashboard 
            summary={summary} 
            transactions={filteredTransactions}
            timeFilter={timeFilter}
            setTimeFilter={setTimeFilter}
          />

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Lịch sử giao dịch</h2>
              <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase">
                {filteredTransactions.length} giao dịch
              </div>
            </div>
            <CashflowTable transactions={filteredTransactions} />
          </div>
        </div>
      </div>

      <CashflowModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSaveTransaction}
        categories={categories}
      />
    </div>
  );
}
