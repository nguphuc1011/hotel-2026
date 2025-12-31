'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Plus, 
  Filter, 
  LayoutGrid,
  RefreshCw
} from 'lucide-react';
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

import { CashflowTransaction, CashflowSummary, CashflowCategory, Service } from '@/types';
import { CashflowDashboard } from './CashflowDashboard';
import { CashflowTable } from './CashflowTable';
import { CashflowModal } from './CashflowModal';
import { ShiftHandoverModal } from './ShiftHandoverModal';
import { cn } from '@/lib/utils';

export default function FinanceManagement() {
  const [transactions, setTransactions] = useState<CashflowTransaction[]>([]);
  const [categories, setCategories] = useState<CashflowCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month' | 'all'>('today');
  
  // New Multi-Toggle Filters
  const [showIncome, setShowIncome] = useState(true);
  const [showExpense, setShowExpense] = useState(true);
  const [showCash, setShowCash] = useState(true);
  const [showTransfer, setShowTransfer] = useState(true);
  const [showCard, setShowCard] = useState(true);
  const [isFilterVisible, setIsFilterVisible] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<CashflowTransaction | null>(null);

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
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (transError) throw transError;
      setTransactions(transData || []);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error('Không thể tải dữ liệu tài chính: ' + (error.message || ''));
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
      const matchesTime = timeFilter === 'all' || isWithinInterval(date, { start, end });
      
      // Type matches
      const matchesType = (t.type === 'income' && showIncome) || (t.type === 'expense' && showExpense);
      
      // Method matches
      const matchesMethod = 
        (t.payment_method === 'cash' && showCash) || 
        (t.payment_method === 'transfer' && showTransfer) ||
        (t.payment_method === 'card' && showCard);

      return matchesTime && matchesType && matchesMethod;
    });
  }, [transactions, timeFilter, showIncome, showExpense, showCash, showTransfer, showCard]);

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

      if (editingTransaction) {
        // Yêu cầu nhập lý do khi sửa giao dịch cũ
        const reason = window.prompt('Vui lòng nhập lý do sửa giao dịch này (bắt buộc):') || '';
        if (!reason.trim()) {
          toast.error('Bắt buộc phải có lý do khi sửa giao dịch!');
          return;
        }

        const { error } = await supabase
          .from('cashflow')
          .update({
            ...data,
            notes: data.notes ? `${data.notes}\n[SỬA] Lý do: ${reason}` : `[SỬA] Lý do: ${reason}`
          })
          .eq('id', editingTransaction.id);

        if (error) throw error;
        toast.success('Cập nhật thành công');
      } else {
        const { error } = await supabase.from('cashflow').insert([{
          ...data,
          created_by: userName,
          created_at: new Date().toISOString()
        }]);

        if (error) throw error;
        toast.success('Ghi nhận thành công');
      }

      setIsModalOpen(false);
      setEditingTransaction(null);
    } catch (error) {
      console.error('Error saving transaction:', error);
      toast.error('Lỗi khi lưu giao dịch');
    }
  };

  const handleDeleteTransaction = async (t: CashflowTransaction) => {
    const reason = window.prompt(`Xác nhận XÓA giao dịch "${t.content}" số tiền ${t.amount.toLocaleString()}đ. Vui lòng nhập lý do (bắt buộc):`) || '';
    if (!reason.trim()) {
      toast.error('Bắt buộc phải có lý do khi xóa giao dịch!');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error: logError } = await supabase.from('audit_logs').insert([{
        user_id: user?.id,
        action: '[CASHFLOW] DELETE_TRANSACTION',
        entity_id: t.id,
        old_value: t,
        reason: reason
      }]);

      if (logError) throw logError;

      const { error } = await supabase
        .from('cashflow')
        .delete()
        .eq('id', t.id);

      if (error) throw error;
      toast.success('Đã xóa giao dịch');
      fetchData();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      toast.error('Lỗi khi xóa giao dịch');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden">
        {/* Fixed Top Bar Header - Real UX */}
        <header className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-[60]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <LayoutGrid className="text-white" size={24} />
            </div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">THU CHI</h1>
          </div>
          
          <button 
            onClick={() => setIsShiftModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-100 rounded-2xl shadow-sm hover:bg-slate-50 transition-all active:scale-95"
          >
            <div className="w-5 h-5 flex items-center justify-center border-2 border-slate-300 rounded-full">
              <div className="w-2 h-2 bg-slate-400 rounded-full" />
            </div>
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">BÀN GIAO CA</span>
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
          <main className="p-4 md:p-8 space-y-8 md:space-y-12 max-w-[1600px] mx-auto w-full">
            {/* 1. Dashboard Overview */}
            <CashflowDashboard 
              summary={summary} 
              transactions={filteredTransactions} 
              timeFilter={timeFilter}
              setTimeFilter={setTimeFilter} 
            />

            {/* 2. Header Section */}
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h2 className="text-3xl md:text-5xl font-black text-[#1e293b] uppercase leading-[0.8] tracking-tighter">
                    LỊCH SỬ<br className="hidden md:block" /> GIAO DỊCH
                  </h2>
                  <button 
                    onClick={() => setIsFilterVisible(!isFilterVisible)}
                    className={cn(
                      "p-3 rounded-2xl transition-all active:scale-95",
                      isFilterVisible ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "bg-white text-slate-400 border border-slate-100 shadow-sm"
                    )}
                  >
                    <Filter size={24} strokeWidth={3} />
                  </button>
                </div>
              </div>

              {/* 3. Combined Smart Filter Bar - Multi Toggle (Toggleable) */}
              {isFilterVisible && (
                <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="bg-white p-2 rounded-3xl flex flex-wrap items-center gap-2 shadow-sm border border-slate-100">
                    {/* Type Filters */}
                    <div className="flex gap-1.5 bg-slate-100 p-1 rounded-2xl">
                      <button 
                        onClick={() => setShowIncome(!showIncome)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all",
                          showIncome ? "bg-emerald-500 text-white shadow-md shadow-emerald-100" : "bg-transparent text-slate-400 hover:text-slate-600"
                        )}
                      >
                        THU
                      </button>
                      <button 
                        onClick={() => setShowExpense(!showExpense)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all",
                          showExpense ? "bg-rose-500 text-white shadow-md shadow-rose-100" : "bg-transparent text-slate-400 hover:text-slate-600"
                        )}
                      >
                        CHI
                      </button>
                    </div>

                    {/* Vertical Divider */}
                    <div className="hidden sm:block w-[1px] h-6 bg-slate-200 mx-1" />

                    {/* Method Filters */}
                    <div className="flex gap-1.5 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                      <button 
                        onClick={() => setShowCash(!showCash)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all",
                          showCash ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "bg-transparent text-slate-400 hover:text-slate-600"
                        )}
                      >
                        TM
                      </button>
                      <button 
                        onClick={() => setShowTransfer(!showTransfer)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all",
                          showTransfer ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "bg-transparent text-slate-400 hover:text-slate-600"
                        )}
                      >
                        CK
                      </button>
                      <button 
                        onClick={() => setShowCard(!showCard)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all",
                          showCard ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "bg-transparent text-slate-400 hover:text-slate-600"
                        )}
                      >
                        POS
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Data List */}
            <div className="space-y-4">
              <CashflowTable 
                transactions={filteredTransactions} 
                onEdit={(t) => {
                  setEditingTransaction(t);
                  setIsModalOpen(true);
                }}
                onDelete={handleDeleteTransaction}
              />
            </div>
          </main>
        </div>

        {/* Floating Action Button */}
        <button 
          onClick={() => setIsModalOpen(true)}
          className="fixed bottom-10 right-8 w-20 h-20 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-[0_20px_50px_-10px_rgba(244,63,94,0.5)] hover:scale-110 active:scale-95 transition-all z-[70] group"
        >
          <Plus size={36} className="group-hover:rotate-90 transition-transform duration-500" />
        </button>

      <CashflowModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setEditingTransaction(null);
        }} 
        onSave={handleSaveTransaction}
        categories={categories}
        initialData={editingTransaction}
      />

      <ShiftHandoverModal
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
        transactions={transactions}
      />
    </div>
  );
}
