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
import { ArrowUpCircle, ArrowDownCircle, Info } from 'lucide-react';

interface CashflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  categories: CashflowCategory[];
}

export const CashflowModal: React.FC<CashflowModalProps> = ({
  isOpen,
  onClose,
  onSave,
  categories
}) => {
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [categoryId, setCategoryId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [content, setContent] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredCategories = categories.filter(c => c.type === type);

  useEffect(() => {
    if (isOpen) {
      setType('income');
      setCategoryId('');
      setAmount(0);
      setContent('');
      setPaymentMethod('cash');
      setNotes('');
    }
  }, [isOpen]);

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
        category_id: categoryId,
        category_name: selectedCategory?.name || '',
        amount,
        content: content.trim(),
        payment_method: paymentMethod,
        notes: notes.trim()
      });
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl p-0 overflow-hidden bg-white border-none rounded-[3rem] shadow-2xl">
        <DialogHeader className="p-8 pb-0">
          <DialogTitle className="text-2xl font-black text-slate-800 uppercase tracking-tight">
            Lập phiếu {type === 'income' ? 'Thu' : 'Chi'} mới
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {/* Type Selector */}
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => {
                setType('income');
                setCategoryId('');
              }}
              className={cn(
                "flex items-center justify-center gap-3 h-16 rounded-2xl font-black uppercase text-xs tracking-widest transition-all",
                type === 'income' 
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100 scale-[1.02]" 
                  : "bg-slate-50 text-slate-400 hover:bg-slate-100"
              )}
            >
              <ArrowUpCircle size={18} /> Khoản Thu
            </button>
            <button
              type="button"
              onClick={() => {
                setType('expense');
                setCategoryId('');
              }}
              className={cn(
                "flex items-center justify-center gap-3 h-16 rounded-2xl font-black uppercase text-xs tracking-widest transition-all",
                type === 'expense' 
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-100 scale-[1.02]" 
                  : "bg-slate-50 text-slate-400 hover:bg-slate-100"
              )}
            >
              <ArrowDownCircle size={18} /> Khoản Chi
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category Select */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Danh mục</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold text-slate-700 focus:ring-blue-600">
                  <SelectValue placeholder="Chọn danh mục" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-100">
                  {filteredCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id} className="font-bold py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hình thức</Label>
              <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100 h-14">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={cn(
                    "flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    paymentMethod === 'cash' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"
                  )}
                >
                  Tiền mặt
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('transfer')}
                  className={cn(
                    "flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    paymentMethod === 'transfer' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"
                  )}
                >
                  Chuyển khoản
                </button>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Số tiền</Label>
            <div className="relative group">
              <NumericInput
                value={amount}
                onChange={setAmount}
                className={cn(
                  "h-20 text-3xl font-black rounded-3xl border-2 border-slate-100 bg-slate-50/50 px-8 transition-all focus:bg-white focus:border-blue-600",
                  type === 'income' ? "text-emerald-600" : "text-rose-600"
                )}
                suffix="đ"
              />
            </div>
          </div>

          {/* Content & Notes */}
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nội dung</Label>
              <Input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Ví dụ: Tiền phòng 101, Thanh toán tiền điện..."
                className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold placeholder:text-slate-300 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ghi chú thêm</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Thông tin bổ sung (nếu có)..."
                className="min-h-[100px] rounded-2xl border-slate-100 bg-slate-50 font-bold placeholder:text-slate-300 resize-none focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="flex-1 h-16 rounded-2xl font-black uppercase text-xs tracking-widest text-slate-400 hover:text-slate-600"
            >
              Hủy bỏ
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || amount <= 0 || !categoryId || !content.trim()}
              className={cn(
                "flex-[2] h-16 rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg transition-all",
                type === 'income' 
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100" 
                  : "bg-rose-600 hover:bg-rose-700 shadow-rose-100"
              )}
            >
              {isSubmitting ? "Đang xử lý..." : "Lưu giao dịch"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
