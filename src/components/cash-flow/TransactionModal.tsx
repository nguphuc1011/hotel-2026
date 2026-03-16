'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Loader2, ArrowUpCircle, ArrowDownCircle, User, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cashFlowService } from '@/services/cashFlowService';
import type { CashFlowCategory, CashFlowTransaction } from '@/services/cashFlowService';
import { customerService } from '@/services/customerService';
import type { Customer } from '@/services/customerService';
import { securityService } from '@/services/securityService';
import type { SecurityAction } from '@/services/securityService';
import PinValidationModal from '@/components/shared/PinValidationModal';
import { useSecurity } from '@/hooks/useSecurity';
import { useAuthStore } from '@/stores/authStore';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { cn } from '@/lib/utils';
import { toLocalISOString, parseLocalISO, getNow } from '@/lib/dateUtils';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialCustomer?: Customer | null;
  transaction?: CashFlowTransaction | null;
  initialData?: Partial<CashFlowTransaction>;
  initialSearchTerm?: string;
}

export default function TransactionModal({ isOpen, onClose, onSuccess, initialCustomer, transaction, initialData, initialSearchTerm }: TransactionModalProps) {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<CashFlowCategory[]>([]);
  const [formData, setFormData] = useState({
    flow_type: 'OUT' as 'IN' | 'OUT',
    category: '',
    category_id: '', // New
    amount: 0,
    description: '',
    payment_method_code: 'cash',
    // YYYY-MM-DD (Local Time)
    occurred_at: toLocalISOString(),
  });

  // Customer State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Security Hook
  const { verify, SecurityModals } = useSecurity();
  const user = useAuthStore(state => state.user);

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      
      if (transaction) {
        // Edit Mode
        setFormData({
          flow_type: transaction.flow_type,
          category: transaction.category,
          category_id: transaction.category_id || '', // New
          amount: transaction.amount,
          description: transaction.description || '',
          payment_method_code: transaction.payment_method_code || 'cash',
          occurred_at: toLocalISOString(new Date(transaction.occurred_at)),
        });
        
        // Note: We don't support editing customer link yet in this simple modal
        // But if it was linked to a customer, we could fetch it.
        // For now, let's keep it simple.
      } else if (initialData) {
        setFormData({
          flow_type: initialData.flow_type || 'OUT',
          category: initialData.category || '',
          category_id: initialData.category_id || '', // Fixed: Added missing category_id
          amount: initialData.amount || 0,
          description: initialData.description || '',
          payment_method_code: initialData.payment_method_code || 'cash',
          occurred_at: toLocalISOString(),
        });
        if (initialCustomer) {
          setSelectedCustomer(initialCustomer);
          setCustomerSearchTerm(initialCustomer.full_name);
        } else if (initialSearchTerm) {
          setCustomerSearchTerm(initialSearchTerm);
        }
      } else if (initialCustomer) {
        setSelectedCustomer(initialCustomer);
        setCustomerSearchTerm(initialCustomer.full_name);
        // We'll find the category ID in the useEffect for categories
        setFormData(prev => ({
           ...prev,
           flow_type: 'IN', // Default to receiving money (Repayment)
           category: 'Thu nợ', 
           category_id: '', // Will be filled by fetchCategories
           amount: Math.abs(initialCustomer.balance) > 0 ? Math.abs(initialCustomer.balance) : 0
        }));
      } else {
        // Reset for create mode
        setFormData({
          flow_type: 'OUT',
          category: '',
          category_id: '', // New
          amount: 0,
          description: '',
          payment_method_code: 'cash',
          occurred_at: toLocalISOString(),
        });
      }
    } else {
      // Reset state on close
      setSelectedCustomer(null);
      setCustomerSearchTerm('');
      setCustomersList([]);
    }
  }, [isOpen, initialCustomer, transaction]);

  // Search Customers
  useEffect(() => {
    if (!customerSearchTerm.trim() || selectedCustomer?.full_name === customerSearchTerm) {
      setCustomersList([]);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearchingCustomer(true);
      try {
        const { data } = await customerService.getCustomers({ 
            search: customerSearchTerm, 
            limit: 5 
        });
        setCustomersList(data);
      } catch (error) {
        console.error(error);
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [customerSearchTerm, selectedCustomer]);

  const fetchCategories = async () => {
    try {
      const data = await cashFlowService.getCategories();
      setCategories(data);
      
      // Auto-select ID if we have a category name but no ID (e.g. from initialData)
      if (formData.category && !formData.category_id) {
        const cat = data.find(c => c.name === formData.category && c.type === formData.flow_type);
        if (cat) {
          setFormData(prev => ({ ...prev, category_id: cat.id }));
        }
      }
    } catch (error) {
      console.error(error);
      toast.error('Không thể tải danh mục');
    }
  };

  if (!isOpen) return null;

  const handleProcessTransaction = async (verifiedStaff: { id: string, name: string }) => {
    setLoading(true);
    try {
      let submitDate = parseLocalISO(formData.occurred_at);
      const now = getNow();
      const todayStr = toLocalISOString(now);

      if (formData.occurred_at === todayStr) {
        submitDate = now; 
      }

      if (transaction) {
         // UPDATE MODE
         await cashFlowService.updateTransaction(transaction.id, {
            amount: formData.amount,
            description: formData.description,
            occurred_at: submitDate.toISOString(),
            category: formData.category,
            // category_id: formData.category_id, // If updateTransaction supports it
            payment_method_code: formData.payment_method_code,
            verifiedStaff: verifiedStaff
         });
         toast.success('Cập nhật phiếu thành công');
      } else {
          // CREATE MODE
          if (selectedCustomer) {
             const type = formData.flow_type === 'IN' ? 'payment' : 'refund';
             await customerService.adjustBalance(
                selectedCustomer.id,
                formData.amount,
                type,
                formData.description || (type === 'payment' ? 'Khách trả nợ' : 'Hoàn tiền khách'),
                verifiedStaff,
                formData.payment_method_code
             );
          } else {
             await cashFlowService.createTransaction({
                ...formData,
                category: formData.category,
                category_id: formData.category_id,
                occurred_at: submitDate,
                verifiedStaff: verifiedStaff
             });
          }
          toast.success('Tạo phiếu thành công');
      }

      onSuccess();
      onClose();
      
      // Reset form
      if (!transaction) {
          setFormData({
            flow_type: 'OUT',
            category: '',
            category_id: '', // New
            amount: 0,
            description: '',
            payment_method_code: 'cash',
            occurred_at: toLocalISOString(),
          });
          setSelectedCustomer(null);
          setCustomerSearchTerm('');
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Có lỗi xảy ra khi xử lý phiếu');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.category_id || formData.amount <= 0) {
      toast.error('Vui lòng chọn danh mục và nhập số tiền');
      return;
    }

    const permissionKey = transaction 
        ? 'finance_delete_transaction' 
        : (formData.flow_type === 'IN' ? 'finance_create_income' : 'finance_manual_cash_out');

    verify(permissionKey as any, (staffId, staffName) => {
        if (staffId) {
            handleProcessTransaction({ id: staffId, name: staffName || '' });
        } else if (user) {
            handleProcessTransaction({ id: user.id, name: user.full_name || user.username || 'Unknown' });
        } else {
            toast.error('Không xác định được người thực hiện hành động');
        }
    });
  };

  const filteredCategories = categories.filter(c => 
    c.type === formData.flow_type && (!c.is_system || c.id === formData.category_id)
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-0 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <h2 className="text-xl font-black text-slate-800 tracking-tight">
            {transaction ? 'Cập nhật phiếu' : 'Tạo phiếu Thu / Chi'}
          </h2>
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
              onClick={() => setFormData({ ...formData, flow_type: 'IN', category: '', category_id: '' })}
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
              onClick={() => setFormData({ ...formData, flow_type: 'OUT', category: '', category_id: '' })}
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

          {/* Customer Selection (Optional) */}
          <div className="space-y-2 relative">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
              Khách hàng <span className="text-slate-300 font-normal">(Tùy chọn)</span>
            </label>
            
            {selectedCustomer ? (
               <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                        <User size={16} />
                     </div>
                     <div>
                        <div className="font-bold text-slate-800 text-sm">{selectedCustomer.full_name}</div>
                        {selectedCustomer.balance !== 0 && (
                           <div className={cn("text-xs font-bold", selectedCustomer.balance < 0 ? "text-rose-500" : "text-emerald-500")}>
                              {selectedCustomer.balance < 0 ? "Nợ: " : "Dư: "}
                              {Math.abs(selectedCustomer.balance).toLocaleString()}
                           </div>
                        )}
                     </div>
                  </div>
                  <button 
                     type="button"
                     onClick={() => {
                        setSelectedCustomer(null);
                        setCustomerSearchTerm('');
                     }}
                     className="p-2 hover:bg-blue-100 rounded-full text-blue-400 hover:text-blue-600 transition-colors"
                  >
                     <X size={16} />
                  </button>
               </div>
            ) : (
               <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                     {isSearchingCustomer ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                  </div>
                  <input
                     type="text"
                     placeholder="Tìm khách hàng (tên, sđt)..."
                     value={customerSearchTerm}
                     onChange={(e) => setCustomerSearchTerm(e.target.value)}
                     className="w-full pl-10 pr-4 py-3 bg-slate-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl font-bold text-slate-700 transition-all outline-none"
                  />
                  
                  {/* Dropdown Results */}
                  {customersList.length > 0 && (
                     <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 max-h-[200px] overflow-y-auto">
                        {customersList.map(c => (
                           <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                 setSelectedCustomer(c);
                                 setCustomerSearchTerm(c.full_name);
                                 setCustomersList([]);
                                 // Auto-fill amount and category if repayment
                                 if (formData.flow_type === 'IN' && c.balance < 0) {
                                    const repaymentCat = categories.find(cat => cat.name === 'Thu nợ' && cat.type === 'IN');
                                    setFormData(prev => ({ 
                                      ...prev, 
                                      amount: Math.abs(c.balance), 
                                      category: 'Thu nợ',
                                      category_id: repaymentCat?.id || ''
                                    }));
                                 }
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between group transition-colors"
                           >
                              <div>
                                 <div className="font-bold text-slate-700 text-sm group-hover:text-blue-600">{c.full_name}</div>
                                 <div className="text-xs text-slate-400">{c.phone}</div>
                              </div>
                              {c.balance !== 0 && (
                                 <div className={cn("text-xs font-bold", c.balance < 0 ? "text-rose-500" : "text-emerald-500")}>
                                    {c.balance < 0 ? "-" : "+"}{Math.abs(c.balance).toLocaleString()}
                                 </div>
                              )}
                           </button>
                        ))}
                     </div>
                  )}
               </div>
            )}
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
                  onClick={() => setFormData({ ...formData, category: cat.name, category_id: cat.id })}
                  className={cn(
                    "px-3 py-3 rounded-xl text-sm font-bold border-2 transition-all text-left truncate",
                    formData.category_id === cat.id
                      ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-200"
                      : "bg-white border-slate-100 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
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
