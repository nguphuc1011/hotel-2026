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
import { RefreshCw, ArrowRight, Wallet, TrendingUp, TrendingDown, AlertCircle, X, Check } from 'lucide-react';
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
      <DialogContent className="max-w-[800px] w-full h-[92vh] md:h-[85vh] p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-none rounded-t-[3rem] md:rounded-[3rem] shadow-2xl z-[9999] flex flex-col animate-in slide-in-from-bottom duration-500 ease-out">
        {/* Header - Sticky */}
        <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md px-8 py-6 flex items-center justify-between border-b border-slate-100">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
              Quy trình kết ca
            </span>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none flex items-center gap-3">
              <RefreshCw className="text-indigo-600" size={24} strokeWidth={3} />
              Bàn giao ca trực
            </h2>
          </div>
          <Button 
            variant="ghost" 
            onClick={onClose}
            className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all active:scale-90 p-0"
          >
            <X size={20} strokeWidth={3} />
          </Button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <div className="p-8 space-y-10">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
              {/* Left Side: Inputs (3/5) */}
              <div className="lg:col-span-3 space-y-8">
                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">Tiền đầu ca (Từ ca trước)</Label>
                  <div className="relative group">
                    <NumericInput
                      value={initialCash}
                      onChange={setInitialCash}
                      className="h-16 rounded-3xl border-2 border-slate-100 bg-slate-50 px-6 font-black text-xl text-slate-700 focus:bg-white focus:border-indigo-500 transition-all"
                      suffix="đ"
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300">
                      <Wallet size={20} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">Tiền mặt thực tế hiện có</Label>
                  <div className="relative group">
                    <NumericInput
                      value={actualCash}
                      onChange={setActualCash}
                      className="h-20 rounded-[2rem] border-2 border-indigo-100 bg-indigo-50/30 px-8 font-black text-3xl text-indigo-600 focus:bg-white focus:border-indigo-500 transition-all"
                      suffix="đ"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">Ghi chú bàn giao</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Bàn giao công việc, sự cố, nhắc nhở ca sau..."
                    className="min-h-[150px] rounded-[2rem] border-2 border-slate-100 bg-slate-50 p-6 font-bold text-slate-800 placeholder:text-slate-300 focus:bg-white focus:border-indigo-500 transition-all resize-none"
                  />
                </div>
              </div>

              {/* Right Side: Stats Card (2/5) */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-slate-50 rounded-[2.5rem] p-8 border-2 border-slate-100 shadow-sm space-y-8">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Đối soát quỹ tiền mặt</h3>
                  
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                          <TrendingUp size={16} className="text-emerald-600" />
                        </div>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Tổng thu</span>
                      </div>
                      <span className="font-black text-slate-900">{formatCurrency(shiftStats.income)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center">
                          <TrendingDown size={16} className="text-rose-600" />
                        </div>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Tổng chi</span>
                      </div>
                      <span className="font-black text-slate-900">{formatCurrency(shiftStats.expense)}</span>
                    </div>

                    <div className="h-px bg-slate-200" />

                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tiền mặt lý thuyết</span>
                      <div className="text-2xl font-black text-indigo-600 tracking-tighter">
                        {formatCurrency(shiftStats.expected)}
                      </div>
                    </div>

                    <div className={cn(
                      "p-6 rounded-[2rem] flex flex-col gap-2 transition-all duration-500 border-2",
                      shiftStats.discrepancy === 0 
                        ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                        : "bg-rose-50 border-rose-100 text-rose-700 shadow-lg shadow-rose-100"
                    )}>
                      <div className="flex items-center gap-2 font-black text-[10px] uppercase tracking-widest">
                        <AlertCircle size={14} strokeWidth={3} /> Chênh lệch
                      </div>
                      <div className="text-2xl font-black tracking-tighter">
                        {shiftStats.discrepancy > 0 ? '+' : ''}{formatCurrency(shiftStats.discrepancy)}
                      </div>
                      {shiftStats.discrepancy !== 0 && (
                        <p className="text-[9px] font-bold uppercase mt-1 animate-pulse">
                          * Cảnh báo: Lệch sổ sách!
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Sticky */}
        <div className="sticky bottom-0 z-20 bg-white/80 backdrop-blur-md p-8 border-t border-slate-100">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full h-20 rounded-[2rem] font-black uppercase text-sm tracking-[0.3em] bg-slate-900 hover:bg-black text-white shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Đang xử lý...</span>
              </div>
            ) : (
              <>
                <Check size={20} strokeWidth={4} />
                <span>Xác nhận bàn giao ca</span>
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
