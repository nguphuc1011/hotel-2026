'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, Plus, Trash2, Edit2, AlertCircle, ArrowUpCircle, ArrowDownCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
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
    description: ''
  });

  // PIN Validation State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'SUBMIT' | 'DELETE';
    data?: any;
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
          description: formData.description
        });
        toast.success('Cập nhật thành công');
      } else {
        await cashFlowService.manageCategory('CREATE', {
          name: formData.name,
          type: activeTab,
          description: formData.description
        });
        toast.success('Thêm mới thành công');
      }
      setIsModalOpen(false);
      setPendingAction(null);
      fetchCategories();
    } catch (error: any) {
      toast.error(error.message || 'Có lỗi xảy ra');
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
    } catch (error: any) {
      toast.error(error.message || 'Có lỗi xảy ra');
    }
  };

  const handlePinSuccess = (staffId: string, staffName: string) => {
    if (pendingAction?.type === 'SUBMIT') {
      handleSubmit();
    } else if (pendingAction?.type === 'DELETE' && pendingAction.data) {
      executeDelete(pendingAction.data);
    }
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData({ name: '', description: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (cat: CashFlowCategory) => {
    setEditingCategory(cat);
    setFormData({ name: cat.name, description: cat.description || '' });
    setIsModalOpen(true);
  };

  const filteredCategories = categories.filter(c => c.type === activeTab);

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-24 animate-in fade-in duration-500">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-3xl bg-white/70 border-b border-black/5 px-6 py-4 flex items-center justify-between">
        <button 
          onClick={() => router.push('/settings')} 
          className="flex items-center text-[#007AFF] font-bold text-[17px] transition-all"
        >
          <ChevronLeft size={24} />
          <span>Cài đặt</span>
        </button>
        <h2 className="text-[17px] font-bold">Danh mục Thu / Chi</h2>
        <div className="w-8"></div> {/* Spacer */}
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[34px] font-bold tracking-tight text-slate-900">Danh mục Thu / Chi</h1>
            <p className="text-slate-500 font-medium mt-1">Quản lý các loại khoản thu và chi phí trong hệ thống</p>
          </div>
          <button 
            onClick={openCreateModal}
            className="h-12 px-6 bg-[#007AFF] hover:bg-blue-600 text-white rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-200 active:scale-95"
          >
            <Plus size={20} />
            <span>Thêm danh mục</span>
          </button>
        </div>

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
      </main>

      {/* Modal Quản lý danh mục */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
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
                  className="w-12 h-12 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all"
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
                    className="w-full h-16 bg-slate-50 border-2 border-transparent focus:border-[#007AFF] focus:bg-white rounded-[24px] px-6 text-lg font-bold transition-all outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Mô tả (tùy chọn)</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Ghi chú thêm về danh mục này..."
                    className="w-full h-32 bg-slate-50 border-2 border-transparent focus:border-[#007AFF] focus:bg-white rounded-[24px] p-6 text-lg font-bold transition-all outline-none resize-none"
                  />
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 h-14 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-[24px] font-black uppercase tracking-widest transition-all active:scale-[0.98]"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] h-14 bg-[#007AFF] hover:bg-blue-600 text-white rounded-[24px] font-black uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
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
  );
}
