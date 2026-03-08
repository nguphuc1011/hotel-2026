'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, Plus, Trash2, Edit2, AlertCircle, ArrowUpCircle, ArrowDownCircle, CheckCircle2, ShieldCheck, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cashFlowService, CashFlowCategory } from '@/services/cashFlowService';
import { securityService } from '@/services/securityService';
import PinValidationModal from '@/components/shared/PinValidationModal';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';
import { cn } from '@/lib/utils';

export default function CashFlowSettingsPage() {
  const router = useRouter();
  const { confirm: confirmDialog } = useGlobalDialog();
  const [categories, setCategories] = useState<CashFlowCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'IN' | 'OUT'>('IN');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CashFlowCategory | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_revenue: true
  });

  // PIN Validation State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'SUBMIT' | 'DELETE';
    data?: CashFlowCategory;
  } | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const data = await cashFlowService.getCategories();
      setCategories(data);
    } catch (error) {
      console.error(error);
      toast.error('Không thể tải danh mục');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Vui lòng nhập tên danh mục');
      return;
    }

    // Security Check
    const requiresPin = await securityService.checkActionRequiresPin('finance_manage_category');
    if (requiresPin && !pendingAction) {
      setPendingAction({ type: 'SUBMIT' });
      setIsPinModalOpen(true);
      return;
    }

    try {
      if (editingCategory) {
        await cashFlowService.manageCategory('UPDATE', {
          id: editingCategory.id,
          name: formData.name,
          description: formData.description,
          is_revenue: formData.is_revenue
        });
        toast.success('Cập nhật thành công');
      } else {
        await cashFlowService.manageCategory('CREATE', {
          name: formData.name,
          type: activeTab,
          description: formData.description,
          is_revenue: formData.is_revenue
        });
        toast.success('Thêm mới thành công');
      }
      setIsModalOpen(false);
      setPendingAction(null);
      fetchCategories();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Có lỗi xảy ra');
    }
  };

  const handleDelete = async (cat: CashFlowCategory) => {
    if (cat.is_system) {
        toast.error('Không thể xóa danh mục hệ thống');
        return;
    }

    const confirmed = await confirmDialog({
      title: 'Xóa danh mục?',
      message: `Bạn có chắc muốn xóa danh mục "${cat.name}"?`,
      confirmLabel: 'Xóa',
      cancelLabel: 'Hủy',
      destructive: true
    });

    if (!confirmed) return;

    // Security Check
    const requiresPin = await securityService.checkActionRequiresPin('finance_manage_category');
    if (requiresPin) {
      setPendingAction({ type: 'DELETE', data: cat });
      setIsPinModalOpen(true);
      return;
    }

    await executeDelete(cat);
  };

  const executeDelete = async (cat: CashFlowCategory) => {
    try {
      await cashFlowService.manageCategory('DELETE', { id: cat.id });
      toast.success('Đã xóa danh mục');
      setPendingAction(null);
      fetchCategories();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Có lỗi xảy ra');
    }
  };

  const handlePinSuccess = (_staffId: string, _staffName: string) => {
    void _staffId;
    void _staffName;
    if (pendingAction?.type === 'SUBMIT') {
      handleSubmit();
    } else if (pendingAction?.type === 'DELETE' && pendingAction.data) {
      executeDelete(pendingAction.data);
    }
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData({ name: '', description: '', is_revenue: true });
    setIsModalOpen(true);
  };

  const openEditModal = (cat: CashFlowCategory) => {
    setEditingCategory(cat);
    setFormData({ 
      name: cat.name, 
      description: cat.description || '',
      is_revenue: cat.is_revenue !== undefined ? cat.is_revenue : true
    });
    setIsModalOpen(true);
  };

  const filteredCategories = categories.filter(c => c.type === activeTab);

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-8 pb-32 font-sans">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 md:mb-12">
          <div className="space-y-2">
            <button 
                onClick={() => router.back()}
                className="group flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-4 font-bold"
            >
                <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center group-hover:border-slate-300 group-hover:bg-slate-50 transition-all">
                    <ChevronLeft size={16} />
                </div>
                <span className="text-xs font-black uppercase tracking-widest">Quay lại</span>
            </button>
            <div className="flex items-center gap-4 mb-2">
               <div className="w-14 h-14 rounded-2xl bg-slate-200 text-slate-700 flex items-center justify-center shadow-sm">
                 <Wallet size={28} />
               </div>
               <div>
                  <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                      Danh mục Thu / Chi
                  </h1>
                  <p className="text-slate-500 font-medium text-base md:text-lg mt-1">
                      Quản lý các loại khoản thu và chi phí trong hệ thống
                  </p>
               </div>
            </div>
        </div>
        
        <button 
            onClick={openCreateModal}
            className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-lg shadow-slate-900/20 active:scale-95 transition-all"
        >
            <Plus size={20} />
            <span>Thêm danh mục</span>
        </button>
        </div>

        <div className="">

          {/* Tabs */}
          <div className="flex p-1 bg-white rounded-2xl shadow-sm border border-black/5 w-fit mb-8">
            <button
              onClick={() => setActiveTab('IN')}
              className={cn(
                "px-8 py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center gap-2",
                activeTab === 'IN' 
                  ? "bg-emerald-50 text-emerald-600 shadow-sm" 
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              <ArrowDownCircle size={18} />
              <span>Khoản Thu</span>
            </button>
            <button
              onClick={() => setActiveTab('OUT')}
              className={cn(
                "px-8 py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all flex items-center gap-2",
                activeTab === 'OUT' 
                  ? "bg-rose-50 text-rose-600 shadow-sm" 
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              <ArrowUpCircle size={18} />
              <span>Khoản Chi</span>
            </button>
          </div>

        {/* List */}
        {loading ? (
           <div className="flex justify-center py-12">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#007AFF]"></div>
           </div>
        ) : (
          <div className="grid gap-4">
            {filteredCategories.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
                    <p className="text-slate-400 font-medium">Chưa có danh mục nào</p>
                </div>
            ) : (
                filteredCategories.map((cat) => (
                    <div 
                        key={cat.id}
                        className="group bg-white p-6 rounded-[24px] shadow-sm border border-slate-100 hover:shadow-md transition-all flex items-center justify-between"
                    >
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md",
                                cat.type === 'IN' ? "bg-emerald-500 shadow-emerald-200" : "bg-rose-500 shadow-rose-200"
                            )}>
                                {cat.type === 'IN' ? <ArrowDownCircle size={24} /> : <ArrowUpCircle size={24} />}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-bold text-slate-800">{cat.name}</h3>
                                    {cat.is_system && (
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-wider rounded-md">System</span>
                                    )}
                                    {!cat.is_revenue && (
                                        <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-wider rounded-md border border-amber-100">
                                            No Revenue
                                        </span>
                                    )}
                                </div>
                                {cat.description && (
                                    <p className="text-sm text-slate-400 font-medium mt-1">{cat.description}</p>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!cat.is_system && (
                                <button 
                                    onClick={() => openEditModal(cat)}
                                    className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors"
                                >
                                    <Edit2 size={18} />
                                </button>
                            )}
                            
                            {!cat.is_system && (
                                <button 
                                    onClick={() => handleDelete(cat)}
                                    className="w-10 h-10 flex items-center justify-center bg-rose-50 hover:bg-rose-100 rounded-xl text-rose-600 transition-colors"
                                >
                                    <Trash2 size={18} />
                                </button>
                            )}

                            {cat.is_system && (
                                <div className="w-10 h-10 flex items-center justify-center text-slate-300 cursor-not-allowed" title="Danh mục hệ thống">
                                    <ShieldCheck size={18} />
                                </div>
                            )}
                        </div>
                    </div>
                ))
            )}
          </div>
        )}
      </div>

      {/* Modal Quản lý danh mục */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
            <div className="p-8">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-2xl font-black tracking-tight text-slate-800 uppercase italic">
                    {editingCategory ? 'Sửa danh mục' : 'Thêm danh mục mới'}
                  </h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {activeTab === 'IN' ? 'Phân loại khoản thu' : 'Phân loại chi phí'}
                  </p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="w-12 h-12 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors"
                >
                  <AlertCircle size={24} className="text-slate-400 rotate-45" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Tên danh mục</label>
                  <input
                    autoFocus
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="VD: Tiền điện, Tiếp khách..."
                    className="w-full px-4 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none font-bold text-lg text-slate-900 transition-all placeholder:text-slate-300"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Mô tả (tùy chọn)</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Ghi chú thêm về danh mục này..."
                    className="w-full h-32 px-4 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none font-bold text-lg text-slate-900 transition-all placeholder:text-slate-300 resize-none"
                  />
                </div>

                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-[24px]">
                    <div 
                        className={cn(
                            "w-12 h-8 rounded-full p-1 cursor-pointer transition-colors relative",
                            formData.is_revenue ? "bg-emerald-500" : "bg-slate-300"
                        )}
                        onClick={() => setFormData({ ...formData, is_revenue: !formData.is_revenue })}
                    >
                        <div 
                            className={cn(
                                "w-6 h-6 bg-white rounded-full shadow-sm transition-all",
                                formData.is_revenue ? "translate-x-4" : "translate-x-0"
                            )}
                        />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-800">Tính vào Doanh thu / Chi phí</p>
                        <p className="text-xs text-slate-500 font-medium">
                            {formData.is_revenue 
                                ? "Sẽ được tính vào báo cáo P&L và ví REVENUE" 
                                : "Chỉ ghi nhận biến động tiền mặt (CASH/BANK), KHÔNG tính doanh thu"
                            }
                        </p>
                    </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] py-4 rounded-2xl font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={20} />
                    {editingCategory ? 'Cập nhật' : 'Tạo ngay'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* PIN Validation Modal */}
      <PinValidationModal
        isOpen={isPinModalOpen}
        onClose={() => {
          setIsPinModalOpen(false);
          setPendingAction(null);
        }}
        onSuccess={handlePinSuccess}
        actionName={pendingAction?.type === 'DELETE' ? 'Xóa danh mục' : 'Cập nhật danh mục'}
        description={pendingAction?.type === 'DELETE' 
          ? `Xác nhận xóa danh mục "${pendingAction.data?.name}". Hành động này sẽ được ghi nhật ký bảo mật.`
          : 'Thay đổi cấu hình danh mục tài chính yêu cầu xác thực quyền hạn.'}
      />
      </div>
    </div>
  );
}
