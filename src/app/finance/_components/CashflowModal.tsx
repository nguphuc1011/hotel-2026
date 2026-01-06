'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { NumericInput } from '@/components/ui/NumericInput';
import { CashflowCategory } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ArrowUpCircle, ArrowDownCircle, Info, X, Wallet, CreditCard, Landmark, Check, ChevronDown } from 'lucide-react';

interface CashflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  categories: CashflowCategory[];
  initialData?: any;
}

export const CashflowModal: React.FC<CashflowModalProps> = ({
  isOpen,
  onClose,
  onSave,
  categories,
  initialData
}) => {
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [categoryId, setCategoryId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [content, setContent] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredCategories = categories.filter(c => c.type === type);

  const isExpense = type === 'expense';

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setType(initialData.type);
        setCategoryId(initialData.category_id || '');
        setAmount(initialData.amount);
        setContent(initialData.content || '');
        setPaymentMethod(initialData.payment_method || 'cash');
        setNotes(initialData.notes || '');
      } else {
        setType('income');
        setCategoryId('');
        setAmount(0);
        setContent('');
        setPaymentMethod('cash');
        setNotes('');
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;
    if (!categoryId) return;
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      const selectedCategory = categories.find(c => c.id === categoryId);
      await onSave({
        type,
        category: selectedCategory?.name || 'Khác', 
        category_id: categoryId,
        category_name: selectedCategory?.name || 'Khác',
        amount,
        content: content.trim(),
        payment_method: paymentMethod,
        notes: notes.trim()
      });
      // Đảm bảo modal đóng sau khi lưu thành công
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Lỗi khi gửi dữ liệu!');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[500px] p-0 overflow-hidden bg-white border-none rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 pb-2 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg",
                type === 'income' ? "bg-emerald-500 text-white shadow-emerald-200" : "bg-rose-500 text-white shadow-rose-200"
              )}>
                {type === 'income' ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
              </div>
              {initialData ? 'Sửa giao dịch' : 'Lập phiếu mới'}
            </DialogTitle>
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
              <X size={20} />
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-2 no-scrollbar">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 1. Loại giao dịch - Compact Toggle */}
            <div className="bg-slate-100/50 p-1 rounded-2xl flex gap-1 border border-slate-100 shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setType('income');
                  setCategoryId('');
                }}
                className={cn(
                  "flex-1 h-10 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all duration-300",
                  type === 'income' 
                    ? "bg-white text-emerald-600 shadow-sm" 
                    : "text-slate-400 hover:text-slate-500"
                )}
              >
                <ArrowUpCircle size={14} strokeWidth={2.5} />
                Khoản Thu
              </button>
              <button
                type="button"
                onClick={() => {
                  setType('expense');
                  setCategoryId('');
                }}
                className={cn(
                  "flex-1 h-10 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all duration-300",
                  type === 'expense' 
                    ? "bg-white text-rose-600 shadow-sm" 
                    : "text-slate-400 hover:text-slate-500"
                )}
              >
                <ArrowDownCircle size={14} strokeWidth={2.5} />
                Khoản Chi
              </button>
            </div>

            {/* 2. Số tiền - Hero Style (Compact) */}
            <div className="space-y-1.5">
              <Label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Số tiền giao dịch</Label>
              <div className={cn(
                "relative group rounded-3xl p-4 transition-all duration-500 border-none",
                type === 'income' 
                  ? "bg-emerald-50/50 focus-within:bg-white focus-within:shadow-[0_15px_30px_-10px_rgba(16,185,129,0.15)]" 
                  : "bg-rose-50/50 focus-within:bg-white focus-within:shadow-[0_15px_30px_-10px_rgba(244,63,94,0.15)]"
              )}>
                <NumericInput
                  value={amount}
                  onChange={setAmount}
                  className={cn(
                    "w-full bg-transparent border-none text-3xl font-black text-center p-0 focus:ring-0",
                    type === 'income' ? "text-emerald-600" : "text-rose-600"
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* 3. Danh mục */}
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Danh mục</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-10 rounded-xl border-none bg-slate-50 px-3 font-bold text-slate-700 hover:bg-slate-100 transition-all focus:ring-0 shadow-sm">
                    <div className="flex items-center gap-2 text-xs">
                      {categoryId ? (
                        <span className="truncate">{categories.find(c => c.id === categoryId)?.name}</span>
                      ) : (
                        <span className="text-slate-300">{isExpense ? "Chọn chi..." : "Chọn thu..."}</span>
                      )}
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-none shadow-[0_15px_40px_-10px_rgba(0,0,0,0.2)] p-1 max-h-[180px]">
                    {filteredCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id} className="rounded-lg font-bold py-1.5 mb-0.5 focus:bg-indigo-50 focus:text-indigo-600 cursor-pointer text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-md flex items-center justify-center bg-white shadow-sm" style={{ color: cat.color }}>
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                          </div>
                          <span>{cat.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 4. Hình thức thanh toán */}
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Hình thức</Label>
                <div className="grid grid-cols-3 gap-1 bg-slate-50 p-1 rounded-xl h-10 shadow-sm">
                  {[
                    { id: 'cash', label: 'Tiền mặt', icon: Wallet },
                    { id: 'transfer', label: 'CK', icon: Landmark },
                    { id: 'card', label: 'POS', icon: CreditCard }
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as any)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-0 rounded-lg transition-all",
                        paymentMethod === m.id 
                          ? "bg-white text-indigo-600 shadow-sm scale-[1.02]" 
                          : "text-slate-400 hover:text-slate-500"
                      )}
                    >
                      <m.icon size={12} strokeWidth={2.5} />
                      <span className="text-[7px] font-black uppercase tracking-tighter">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 5. Nội dung & Ghi chú */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Nội dung {isExpense ? 'chi' : 'thu'}</Label>
                <Input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={isExpense ? "VD: Tiền điện, Sửa chữa..." : "VD: Thu phế liệu, Khác..."}
                  className="h-10 rounded-xl border-none bg-slate-50 px-3 font-bold text-slate-800 text-xs placeholder:text-slate-300 focus:bg-slate-100 transition-all focus:ring-0 shadow-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Ghi chú</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Thông tin bổ sung..."
                  className="min-h-[60px] rounded-xl border-none bg-slate-50 p-3 font-bold text-slate-800 text-xs placeholder:text-slate-300 focus:bg-slate-100 transition-all resize-none focus:ring-0 shadow-sm"
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer - Sticky */}
        <div className="sticky bottom-0 z-20 bg-white/80 backdrop-blur-md p-4 border-t border-slate-50 shrink-0">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || amount <= 0 || !categoryId || !content.trim()}
            className={cn(
              "w-full h-12 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-xl active:scale-95 disabled:opacity-50",
              type === 'income' 
                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100" 
                : "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-100"
            )}
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Đang lưu...</span>
              </div>
            ) : (
              <>
                <Check size={16} strokeWidth={4} />
                <span>{initialData ? 'Cập nhật phiếu' : 'Xác nhận lập phiếu'}</span>
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
