'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumericInput } from '@/components/ui/NumericInput';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { formatCurrency, cn } from '@/lib/utils';
import { RefreshCw, ArrowRight, Wallet, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { CashflowTransaction } from '@/types';

interface ShiftHandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: CashflowTransaction[];
}

export const ShiftHandoverModal: React.FC<ShiftHandoverModalProps> = ({
  isOpen,
  onClose,
  transactions
}) => {
  const [initialCash, setInitialCash] = useState(0);
  const [actualCash, setActualCash] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastShift, setLastShift] = useState<any>(null);

  // Tính toán các con số trong ca hiện tại (chỉ tính Tiền mặt)
  const shiftStats = useMemo(() => {
    const cashTransactions = transactions.filter(t => t.payment_method === 'cash');
    const income = cashTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = cashTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const expected = initialCash + income - expense;
    const discrepancy = actualCash - expected;

    return {
      income,
      expense,
      expected,
      discrepancy
    };
  }, [transactions, initialCash, actualCash]);

  useEffect(() => {
    if (isOpen) {
      fetchLastShift();
    }
  }, [isOpen]);

  const fetchLastShift = async () => {
    try {
      const { data, error } = await supabase
        .from('shift_handovers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setLastShift(data);
        setInitialCash(data.actual_cash || 0);
      }
    } catch (error) {
      console.error('Error fetching last shift:', error);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userName = user?.user_metadata?.full_name || user?.email || 'Nhân viên';

      const { error } = await supabase.from('shift_handovers').insert([{
        staff_id: user?.id,
        staff_name: userName,
        start_at: lastShift?.created_at || new Date().toISOString(),
        end_at: new Date().toISOString(),
        initial_cash: initialCash,
        total_income_cash: shiftStats.income,
        total_expense_cash: shiftStats.expense,
        expected_cash: shiftStats.expected,
        actual_cash: actualCash,
        discrepancy: shiftStats.discrepancy,
        notes: notes,
        status: 'completed'
      }]);

      if (error) throw error;
      
      toast.success('Bàn giao ca thành công');
      onClose();
    } catch (error: any) {
      toast.error('Lỗi khi bàn giao ca: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-none w-screen h-screen m-0 p-0 overflow-hidden bg-white border-none rounded-none shadow-none z-[9999] flex flex-col">
        <DialogHeader className="p-8 pb-4 flex-shrink-0 border-b border-slate-100">
          <div className="max-w-4xl mx-auto w-full flex items-center justify-between">
            <DialogTitle className="text-3xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-4">
              <RefreshCw className="text-blue-600" size={32} /> Bàn giao ca trực
            </DialogTitle>
            <Button 
              variant="ghost" 
              onClick={onClose}
              className="rounded-full w-12 h-12 p-0 hover:bg-slate-100 text-slate-400"
            >
              <RefreshCw className="rotate-45" size={24} />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50/30">
          <div className="max-w-4xl mx-auto w-full p-8 space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Left Side: Inputs */}
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tiền đầu ca (Tiền bàn giao ca trước)</Label>
                <NumericInput
                  value={initialCash}
                  onChange={setInitialCash}
                  className="h-14 text-xl font-black rounded-2xl border-2 border-slate-100 bg-slate-50 px-6 focus:border-blue-600"
                  suffix="đ"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tiền mặt thực tế cuối ca</Label>
                <NumericInput
                  value={actualCash}
                  onChange={setActualCash}
                  className="h-14 text-xl font-black rounded-2xl border-2 border-blue-100 bg-blue-50/30 px-6 focus:border-blue-600"
                  suffix="đ"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ghi chú bàn giao</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Bàn giao công việc, sự cố trong ca..."
                  className="min-h-[120px] rounded-2xl border-slate-100 bg-slate-50 font-bold placeholder:text-slate-300 resize-none"
                />
              </div>
            </div>

            {/* Right Side: Stats */}
            <div className="bg-slate-50 rounded-[2.5rem] p-8 space-y-6">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Báo cáo quỹ tiền mặt ca này</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500 font-bold text-sm">
                    <TrendingUp size={16} className="text-emerald-500" /> Tổng thu tiền mặt
                  </div>
                  <span className="font-black text-slate-700">{formatCurrency(shiftStats.income)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500 font-bold text-sm">
                    <TrendingDown size={16} className="text-rose-500" /> Tổng chi tiền mặt
                  </div>
                  <span className="font-black text-slate-700">{formatCurrency(shiftStats.expense)}</span>
                </div>

                <div className="h-px bg-slate-200 my-2" />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500 font-bold text-sm uppercase tracking-tighter">
                    <Wallet size={16} className="text-blue-500" /> Tiền mặt lý thuyết
                  </div>
                  <span className="font-black text-blue-600 text-lg">{formatCurrency(shiftStats.expected)}</span>
                </div>

                <div className={cn(
                  "p-4 rounded-2xl flex items-center justify-between",
                  shiftStats.discrepancy === 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                )}>
                  <div className="flex items-center gap-2 font-black text-xs uppercase tracking-widest">
                    <AlertCircle size={16} /> Chênh lệch
                  </div>
                  <span className="font-black text-lg">
                    {shiftStats.discrepancy > 0 ? '+' : ''}{formatCurrency(shiftStats.discrepancy)}
                  </span>
                </div>
              </div>

              {shiftStats.discrepancy !== 0 && (
                <p className="text-[10px] text-rose-500 font-bold italic text-center">
                  * Cảnh báo: Tiền thực tế lệch so với sổ sách!
                </p>
              )}
            </div>
          </div>

            <div className="pt-6 border-t border-slate-100">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full h-16 rounded-2xl font-black uppercase text-sm tracking-[0.2em] bg-slate-900 hover:bg-black text-white shadow-xl shadow-slate-200 transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Đang xử lý...' : 'Xác nhận bàn giao ca'}
              </Button>
            </div>
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
};
