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
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredCategories = categories.filter(c => c.type === type);

  const isExpense = type === 'expense';

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setType(initialData.type);
        setCategoryId(initialData.category_id);
        setAmount(initialData.amount);
        setContent(initialData.content);
        setPaymentMethod(initialData.payment_method);
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
      // Logic onClose được xử lý bởi cha hoặc sau khi save thành công
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-none w-screen h-screen m-0 p-0 overflow-hidden bg-white border-none rounded-none shadow-none z-[9999] flex flex-col">
        <DialogHeader className="p-8 pb-4 flex-shrink-0 border-b border-slate-100">
          <div className="max-w-3xl mx-auto w-full flex items-center justify-between">
            <DialogTitle className="text-3xl font-black text-slate-900 uppercase tracking-tight">
              {initialData ? 'Sửa phiếu' : 'Lập phiếu'} {type === 'income' ? 'Thu' : 'Chi'} {initialData ? '' : 'mới'}
            </DialogTitle>
            <Button 
              variant="ghost" 
              onClick={onClose}
              className="rounded-full w-12 h-12 p-0 hover:bg-slate-100 text-slate-400"
            >
              <ArrowUpCircle className="rotate-45" size={24} />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50/30">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto w-full p-8 space-y-10">
            <div className="grid grid-cols-2 gap-6">
            <button
              type="button"
              onClick={() => setType('income')}
              className={cn(
                "h-16 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 transition-all border-2",
                type === 'income' 
                  ? "bg-emerald-50 border-emerald-500 text-emerald-600 shadow-lg shadow-emerald-100" 
                  : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
              )}
            >
              <ArrowUpCircle size={20} />
              Khoản Thu
            </button>
            <button
              type="button"
              onClick={() => setType('expense')}
              className={cn(
                "h-16 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 transition-all border-2",
                type === 'expense' 
                  ? "bg-rose-50 border-rose-500 text-rose-600 shadow-lg shadow-rose-100" 
                  : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
              )}
            >
              <ArrowDownCircle size={20} />
              Khoản Chi
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category Select */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Danh mục</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-14 rounded-2xl border-slate-100 bg-slate-50 font-bold text-slate-700 focus:ring-blue-600">
                  <SelectValue placeholder={isExpense ? "Chọn hạng mục chi..." : "Chọn hạng mục thu..."} />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-slate-100 shadow-xl">
                  {filteredCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id} className="font-bold py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                  {filteredCategories.length === 0 && (
                    <div className="p-4 text-center text-xs font-bold text-slate-400 italic">
                      Chưa có hạng mục cho loại này
                    </div>
                  )}
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
            <div className="space-y-3">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nội dung {isExpense ? 'chi' : 'thu'}</Label>
              <Input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={isExpense ? "VD: Tiền điện tháng 12, Sửa vòi hoa sen phòng 102..." : "VD: Thu tiền bán thanh lý..."}
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

          {/* Submit Button */}
          <div className="pt-6 border-t border-slate-100">
            <Button
              type="submit"
              disabled={isSubmitting || amount <= 0 || !categoryId || !content.trim()}
              className="w-full h-16 rounded-2xl font-black uppercase text-sm tracking-[0.2em] bg-slate-900 hover:bg-black text-white shadow-xl shadow-slate-200 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : (initialData ? 'Cập nhật phiếu' : 'Xác nhận lập phiếu')}
            </Button>
          </div>
        </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
