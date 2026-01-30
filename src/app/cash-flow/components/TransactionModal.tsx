'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cashFlowService, CashFlowCategory } from '@/services/cashFlowService';
import { securityService, SecurityAction } from '@/services/securityService';
import PinValidationModal from '@/components/shared/PinValidationModal';
import { useSecurity } from '@/hooks/useSecurity';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { cn } from '@/lib/utils';
import { toLocalISOString, parseLocalISO, getNow } from '@/lib/dateUtils';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TransactionModal({ isOpen, onClose, onSuccess }: TransactionModalProps) {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<CashFlowCategory[]>([]);
  const [formData, setFormData] = useState({
    flow_type: 'OUT' as 'IN' | 'OUT',
    category: '',
    amount: 0,
    description: '',
    payment_method_code: 'cash',
    // YYYY-MM-DD (Local Time)
    occurred_at: toLocalISOString(),
  });

  // Security Hook
  const { verify, SecurityModals } = useSecurity();

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
    }
  }, [isOpen]);

  const fetchCategories = async () => {
    try {
      const data = await cashFlowService.getCategories();
      setCategories(data);
    } catch (error) {
      console.error(error);
      toast.error('Không thể tải danh mục');
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent, verifiedStaff?: { id: string, name: string }) => {
    if (e) e.preventDefault();
    if (!formData.category || formData.amount <= 0) {
      toast.error('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    // --- Security Checks ---
    if (!verifiedStaff) {
      if (formData.flow_type === 'IN') {
        await verify('finance_create_income', (staffId, staffName) => 
          handleSubmit(undefined, staffId ? { id: staffId, name: staffName || '' } : undefined)
        );
        return;
      } else {
        await verify('finance_manual_cash_out', (staffId, staffName) => 
          handleSubmit(undefined, staffId ? { id: staffId, name: staffName || '' } : undefined)
        );
        return;
      }
    }

    setLoading(true);
    try {
      // Logic: Nếu chọn ngày hôm nay thì tự động gắn thêm giờ phút hiện tại
      // Để giao dịch mới nhất luôn nổi lên đầu danh sách
      let submitDate = parseLocalISO(formData.occurred_at);
      const now = getNow();
      const todayStr = toLocalISOString(now);

      if (formData.occurred_at === todayStr) {
        submitDate = now; // Use current time
      }

      await cashFlowService.createTransaction({
        ...formData,
        occurred_at: submitDate,
        verifiedStaff: verifiedStaff
      });
      toast.success('Tạo phiếu thành công');
      onSuccess();
      onClose();
      // Reset form
      setFormData({
        flow_type: 'OUT',
        category: '',
        amount: 0,
        description: '',
        payment_method_code: 'cash',
        occurred_at: toLocalISOString(),
      });
    } catch (error) {
      console.error(error);
      toast.error('Có lỗi xảy ra khi tạo phiếu');
    } finally {
      setLoading(false);
    }
  };

  const filteredCategories = categories.filter(c => 
    c.type === formData.flow_type && !c.is_system
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-0 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Tạo phiếu Thu / Chi</h2>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(e) => handleSubmit(e)} className="p-6 space-y-6">
          {/* Loại phiếu Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, flow_type: 'IN', category: '' })}
              className={cn(
                "flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all",
                formData.flow_type === 'IN'
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-200"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <ArrowDownCircle size={18} />
              PHIẾU THU
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, flow_type: 'OUT', category: '' })}
              className={cn(
                "flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all",
                formData.flow_type === 'OUT'
                  ? "bg-rose-500 text-white shadow-md shadow-rose-200"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <ArrowUpCircle size={18} />
              PHIẾU CHI
            </button>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Số tiền <span className="text-rose-500">*</span></label>
            <MoneyInput
              value={formData.amount}
              onChange={(val) => setFormData({ ...formData, amount: val })}
              className="w-full"
              inputClassName="text-3xl font-black tracking-tighter text-slate-900 bg-slate-50 border-transparent focus:bg-white"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Danh mục <span className="text-rose-500">*</span></label>
            <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
              {filteredCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, category: cat.name })}
                  className={cn(
                    "px-3 py-3 rounded-xl text-sm font-bold border-2 transition-all text-left truncate",
                    formData.category === cat.name
                      ? "border-[#007AFF] bg-blue-50 text-[#007AFF]"
                      : "border-slate-100 bg-white text-slate-600 hover:border-slate-200"
                  )}
                >
                  {cat.name}
                </button>
              ))}
              {filteredCategories.length === 0 && (
                <div className="col-span-2 text-center py-4 text-slate-400 text-sm font-medium italic">
                  Chưa có danh mục. Vui lòng thêm trong Cài đặt.
                </div>
              )}
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Phương thức thanh toán <span className="text-rose-500">*</span></label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, payment_method_code: 'cash' })}
                className={cn(
                  "flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs transition-all",
                  formData.payment_method_code === 'cash'
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                TIỀN MẶT
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, payment_method_code: 'bank' })}
                className={cn(
                  "flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs transition-all",
                  formData.payment_method_code === 'bank'
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                CHUYỂN KHOẢN
              </button>
            </div>
          </div>

          {/* Date & Description */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1 space-y-2">
               <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Ngày</label>
               <input
                type="date"
                required
                value={formData.occurred_at}
                onChange={(e) => setFormData({ ...formData, occurred_at: e.target.value })}
                className="w-full px-3 py-3 bg-slate-50 border-2 border-transparent focus:border-[#007AFF] rounded-xl outline-none font-bold text-slate-800 text-sm"
              />
            </div>
            <div className="col-span-2 space-y-2">
               <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Mô tả</label>
               <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-transparent focus:border-[#007AFF] rounded-xl outline-none font-bold text-slate-800 text-sm placeholder:font-normal"
                placeholder="Ghi chú thêm..."
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 bg-slate-900 hover:bg-black text-white rounded-[20px] font-black text-lg shadow-xl shadow-slate-200 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Check />}
            <span>HOÀN TẤT</span>
          </button>
        </form>

        {SecurityModals}
      </div>
    </div>
  );
}
