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

  const isOpening = lastShift?.status !== 'open';

  // Tính toán các con số trong ca hiện tại (chỉ tính Tiền mặt)
  const shiftStats = useMemo(() => {
    if (isOpening || !lastShift?.start_at) return { income: 0, expense: 0, expected: 0, discrepancy: 0 };
    
    const shiftStartTime = new Date(lastShift.start_at);
    
    // Chỉ lấy các giao dịch tiền mặt phát sinh TRONG CA (từ lúc start_at)
    const cashTransactions = transactions.filter(t => 
      t.payment_method === 'cash' && 
      new Date(t.created_at) >= shiftStartTime
    );

    const income = cashTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = cashTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const expected = (lastShift.opening_balance || 0) + income - expense;
    const discrepancy = actualCash - expected;

    return {
      income,
      expense,
      expected,
      discrepancy
    };
  }, [transactions, lastShift, actualCash, isOpening]);

  useEffect(() => {
    if (isOpen) {
      fetchLastShift();
    }
  }, [isOpen]);

  const fetchLastShift = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Tìm ca đang mở của user hiện tại
      const { data: currentShift } = await supabase
        .from('shifts')
        .select('*')
        .eq('staff_id', user.id)
        .eq('status', 'open')
        .order('start_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (currentShift) {
        setLastShift(currentShift);
        setInitialCash(currentShift.opening_balance || 0);
      } else {
        setLastShift(null);
        // Nếu không có ca mở, lấy số dư cuối của ca gần nhất bất kỳ ai để làm tiền đầu ca gợi ý
        const { data: lastClosedShift } = await supabase
          .from('shifts')
          .select('*')
          .eq('status', 'closed')
          .order('end_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (lastClosedShift) {
          setInitialCash(lastClosedShift.closing_balance || 0);
          setActualCash(lastClosedShift.closing_balance || 0);
        }
      }
    } catch (error) {
      console.error('Error fetching shift:', error);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Bạn cần đăng nhập để thực hiện');

      if (!isOpening && lastShift?.id) {
        // ĐÓNG CA
        const { error } = await supabase
          .from('shifts')
          .update({
            closing_balance: actualCash,
            status: 'closed',
            end_at: new Date().toISOString(),
            notes: notes.trim()
          })
          .eq('id', lastShift.id);

        if (error) throw error;
        toast.success('Đóng ca và bàn giao thành công');
      } else {
        // MỞ CA MỚI
        const { error } = await supabase
          .from('shifts')
          .insert([{
            staff_id: user.id,
            opening_balance: actualCash,
            status: 'open',
            start_at: new Date().toISOString(),
            notes: notes.trim()
          }]);

        if (error) throw error;
        toast.success('Bắt đầu ca làm việc mới thành công');
      }
      
      onClose();
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
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
              {isOpening ? 'Quy trình mở ca' : 'Quy trình kết ca'}
            </span>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none flex items-center gap-3">
              <RefreshCw className={cn("transition-transform duration-700", isOpening ? "text-emerald-600" : "text-indigo-600")} size={24} strokeWidth={3} />
              {isOpening ? 'Bắt đầu ca làm việc' : 'Bàn giao ca trực'}
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
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">
                    {isOpening ? 'Tiền mặt bàn giao từ ca trước' : 'Tiền mặt đầu ca'}
                  </Label>
                  <div className="relative group">
                    <NumericInput
                      value={initialCash}
                      onChange={setInitialCash}
                      disabled={!isOpening}
                      className="h-16 rounded-3xl border-2 border-slate-100 bg-slate-50 px-6 font-black text-xl text-slate-700 focus:bg-white focus:border-indigo-500 transition-all disabled:opacity-50"
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300">
                      <Wallet size={20} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">
                    {isOpening ? 'Số tiền mặt nhận bàn giao' : 'Tiền mặt thực tế hiện có'}
                  </Label>
                  <div className="relative group">
                    <NumericInput
                      value={actualCash}
                      onChange={setActualCash}
                      className={cn(
                        "h-20 rounded-[2rem] border-2 px-8 font-black text-3xl transition-all",
                        isOpening 
                          ? "border-emerald-100 bg-emerald-50/30 text-emerald-600 focus:border-emerald-500" 
                          : "border-indigo-100 bg-indigo-50/30 text-indigo-600 focus:border-indigo-500"
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">Ghi chú {isOpening ? 'mở ca' : 'bàn giao'}</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={isOpening ? "Ghi chú đầu ca..." : "Bàn giao công việc, sự cố, nhắc nhở ca sau..."}
                    className="min-h-[150px] rounded-[2rem] border-2 border-slate-100 bg-slate-50 p-6 font-bold text-slate-800 placeholder:text-slate-300 focus:bg-white focus:border-indigo-500 transition-all resize-none"
                  />
                </div>
              </div>

              {/* Right Side: Stats Card (2/5) */}
              <div className="lg:col-span-2 space-y-6">
                {!isOpening ? (
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

                      <div className="pt-6 border-t border-slate-200 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">Dự kiến trong quỹ</span>
                          <span className="font-bold text-slate-600">{formatCurrency(shiftStats.expected)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">Thực tế khớp</span>
                          <div className={cn(
                            "flex items-center gap-2 px-3 py-1 rounded-full font-black text-sm",
                            shiftStats.discrepancy === 0 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                          )}>
                            {shiftStats.discrepancy === 0 ? <Check size={14} /> : <AlertCircle size={14} />}
                            {formatCurrency(shiftStats.discrepancy)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50/50 rounded-[2.5rem] p-8 border-2 border-emerald-100 shadow-sm space-y-6">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                      <Wallet className="text-emerald-600" size={24} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-black text-emerald-900 uppercase tracking-tighter">Bắt đầu ca mới</h3>
                      <p className="text-sm font-bold text-emerald-600/70 leading-relaxed">
                        Vui lòng kiểm tra kỹ số tiền mặt nhận bàn giao thực tế trước khi xác nhận mở ca.
                      </p>
                    </div>
                    <ul className="space-y-3">
                      {['Đếm kỹ tiền mặt', 'Kiểm tra sổ sách ca trước', 'Ghi chú các vấn đề tồn đọng'].map((item, i) => (
                        <li key={i} className="flex items-center gap-3 text-xs font-bold text-emerald-700">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className={cn(
                    "w-full h-20 rounded-[2rem] text-lg font-black tracking-tighter shadow-xl transition-all active:scale-[0.97] flex items-center justify-center gap-3",
                    isOpening 
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200" 
                      : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
                  )}
                >
                  {isSubmitting ? (
                    <RefreshCw className="animate-spin" size={24} />
                  ) : (
                    <>
                      {isOpening ? <ArrowRight size={24} /> : <Check size={24} />}
                      {isOpening ? 'BẮT ĐẦU CA MỚI' : 'XÁC NHẬN KẾT CA'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
