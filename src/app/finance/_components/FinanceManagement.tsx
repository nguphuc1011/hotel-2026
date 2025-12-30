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
  RefreshCw
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

import { CashflowTransaction, CashflowSummary, CashflowCategory, Service } from '@/types';
import { CashflowDashboard } from './CashflowDashboard';
import { CashflowTable } from './CashflowTable';
import { CashflowModal } from './CashflowModal';
import { ShiftHandoverModal } from './ShiftHandoverModal';
import { InventoryAuditModal } from './InventoryAuditModal';
import { cn } from '@/lib/utils';

export default function FinanceManagement() {
  const [transactions, setTransactions] = useState<CashflowTransaction[]>([]);
  const [categories, setCategories] = useState<CashflowCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | 'cash' | 'transfer'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
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

      // Fetch services for inventory audit
      const { data: servData, error: servError } = await supabase
        .from('services')
        .select('*')
        .order('name');
      
      if (servError) throw servError;
      setServices(servData || []);
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
      const matchesType = typeFilter === 'all' || t.type === typeFilter;
      const matchesMethod = methodFilter === 'all' || t.payment_method === methodFilter;
      return matchesTime && matchesType && matchesMethod;
    });
  }, [transactions, timeFilter, typeFilter, methodFilter]);

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
      // Vì cashflow có thể không hỗ trợ soft delete trực tiếp hoặc audit logs cần được ghi lại
      // Chúng ta sẽ dùng audit_logs để ghi lại hành vi xóa trước
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
    <div className="min-h-screen bg-slate-50/50 p-6 lg:p-10 pb-32">
      <div className="max-w-7xl mx-auto space-y-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight mb-2">Quản lý Tài chính</h1>
            <p className="text-slate-500 font-bold text-sm tracking-wide">Phân tích dòng tiền và lập phiếu thu chi</p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              onClick={() => setIsInventoryModalOpen(true)}
              variant="outline"
              className="h-14 px-8 rounded-2xl font-black uppercase text-xs tracking-widest border-2 border-slate-200 hover:bg-slate-50 text-slate-600 gap-2"
            >
              <PieChartIcon size={18} /> Kiểm kho
            </Button>
            <Button 
              onClick={() => setIsShiftModalOpen(true)}
              variant="outline"
              className="h-14 px-8 rounded-2xl font-black uppercase text-xs tracking-widest border-2 border-slate-200 hover:bg-slate-50 text-slate-600 gap-2"
            >
              <RefreshCw size={18} /> Bàn giao ca
            </Button>
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Lịch sử giao dịch</h2>
              
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-white p-1 rounded-xl border border-slate-100 shadow-sm">
                  <button 
                    onClick={() => setTypeFilter('all')}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                      typeFilter === 'all' ? "bg-slate-900 text-white shadow-md" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Tất cả
                  </button>
                  <button 
                    onClick={() => setTypeFilter('income')}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                      typeFilter === 'income' ? "bg-emerald-500 text-white shadow-md" : "text-slate-400 hover:text-emerald-500"
                    )}
                  >
                    Thu
                  </button>
                  <button 
                    onClick={() => setTypeFilter('expense')}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                      typeFilter === 'expense' ? "bg-rose-500 text-white shadow-md" : "text-slate-400 hover:text-rose-500"
                    )}
                  >
                    Chi
                  </button>
                </div>

                <div className="flex bg-white p-1 rounded-xl border border-slate-100 shadow-sm">
                  <button 
                    onClick={() => setMethodFilter('all')}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                      methodFilter === 'all' ? "bg-slate-900 text-white shadow-md" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    Mọi PTTT
                  </button>
                  <button 
                    onClick={() => setMethodFilter('cash')}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                      methodFilter === 'cash' ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-blue-600"
                    )}
                  >
                    Tiền mặt
                  </button>
                  <button 
                    onClick={() => setMethodFilter('transfer')}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                      methodFilter === 'transfer' ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-blue-600"
                    )}
                  >
                    Chuyển khoản
                  </button>
                </div>

                <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase">
                  {filteredTransactions.length} giao dịch
                </div>
              </div>
            </div>
            <CashflowTable 
              transactions={filteredTransactions} 
              onEdit={(t) => {
                setEditingTransaction(t);
                setIsModalOpen(true);
              }}
              onDelete={handleDeleteTransaction}
            />
          </div>
        </div>
      </div>

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

      <InventoryAuditModal
        isOpen={isInventoryModalOpen}
        onClose={() => {
          setIsInventoryModalOpen(false);
          fetchData(); // Refresh data
        }}
        services={services} 
      />
    </div>
  );
}
