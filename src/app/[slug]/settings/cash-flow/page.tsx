'use client';

import { useState, useEffect } from 'react';
import { 
  ChevronLeft, Plus, Trash2, Edit2, AlertCircle, 
  ArrowUpCircle, ArrowDownCircle, CheckCircle2, ShieldCheck, 
  Wallet, ArrowLeft, X, Info
} from 'lucide-react';
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

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-slate-900 font-sans selection:bg-slate-900 selection:text-white pb-40">
      
      {/* 1. TOP NAV */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-[1200px] mx-auto px-4 md:px-10 h-20 md:h-24 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()}
              className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white rounded-full border border-slate-200 shadow-sm hover:bg-slate-50 transition-all active:scale-90"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 leading-none">Danh mục Thu Chi</h1>
              <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Quản lý dòng tiền</span>
            </div>
          </div>
          
          <button 
            onClick={openCreateModal}
            className="h-10 md:h-12 px-5 md:px-8 bg-slate-900 text-white rounded-full text-[13px] font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
          >
            <Plus size={18} />
            <span>Thêm danh mục</span>
          </button>
        </div>
      </div>

      <main className="max-w-[1200px] mx-auto px-4 md:px-10 py-8 md:py-12 space-y-10 md:space-y-16">
        
        {/* 2. TAB NAVIGATION */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-1.5 px-2">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Phân loại tài chính</h2>
            <p className="text-slate-400 font-bold text-sm md:text-base">Thiết lập các khoản thu nhập và chi phí vận hành</p>
          </div>

          <div className="flex items-center gap-1.5 p-1.5 bg-white/80 backdrop-blur-md rounded-full border border-slate-200/60 shadow-sm self-start md:self-auto">
            <button 
              onClick={() => setActiveTab('IN')}
              className={cn(
                "px-6 md:px-10 py-2.5 rounded-full text-[12px] md:text-[13px] font-bold transition-all uppercase tracking-widest flex items-center gap-2",
                activeTab === 'IN' ? "bg-emerald-500 text-white shadow-md" : "text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
              )}
            >
              <ArrowDownCircle size={16} /> Khoản Thu
            </button>
            <button 
              onClick={() => setActiveTab('OUT')}
              className={cn(
                "px-6 md:px-10 py-2.5 rounded-full text-[12px] md:text-[13px] font-bold transition-all uppercase tracking-widest flex items-center gap-2",
                activeTab === 'OUT' ? "bg-rose-500 text-white shadow-md" : "text-slate-500 hover:text-rose-600 hover:bg-rose-50"
              )}
            >
              <ArrowUpCircle size={16} /> Khoản Chi
            </button>
          </div>
        </div>

        {/* 3. LIST OF CATEGORIES */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {filteredCategories.length === 0 ? (
            <div className="col-span-full py-32 text-center bg-white/50 backdrop-blur-sm rounded-[40px] border border-dashed border-slate-200">
              <Wallet size={48} className="mx-auto text-slate-200 mb-4" />
              <p className="text-slate-400 font-black uppercase tracking-widest">Chưa có danh mục nào</p>
            </div>
          ) : (
            filteredCategories.map((cat) => (
              <div 
                key={cat.id}
                className="bg-white/80 backdrop-blur-xl rounded-[32px] p-8 border border-white shadow-[0_10px_40px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.04)] hover:scale-[1.02] transition-all duration-500 group relative overflow-hidden flex flex-col justify-between min-h-[180px]"
              >
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transition-transform duration-500 group-hover:scale-110",
                      cat.type === 'IN' ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500"
                    )}>
                      {cat.type === 'IN' ? <ArrowDownCircle size={24} /> : <ArrowUpCircle size={24} />}
                    </div>
                    
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                      {!cat.is_system && (
                        <>
                          <button 
                            onClick={() => openEditModal(cat)}
                            className="w-10 h-10 rounded-full bg-slate-50 text-slate-400 hover:bg-slate-900 hover:text-white transition-all flex items-center justify-center"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(cat)}
                            className="w-10 h-10 rounded-full bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                      {cat.is_system && (
                        <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-100 animate-pulse" title="Danh mục hệ thống">
                          <ShieldCheck size={16} />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">{cat.name}</h3>
                      {cat.is_system && (
                        <span className="px-3 py-1 bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-md">HỆ THỐNG</span>
                      )}
                    </div>
                    {cat.description && (
                      <p className="text-sm font-bold text-slate-400 leading-relaxed line-clamp-2">{cat.description}</p>
                    )}
                  </div>
                </div>

                <div className="relative z-10 flex items-center justify-between mt-8 pt-4 border-t border-slate-50">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full",
                    cat.is_revenue ? "bg-blue-50 text-blue-500" : "bg-slate-50 text-slate-300"
                  )}>
                    {cat.is_revenue ? 'Tính Doanh thu' : 'Chỉ biến động ví'}
                  </span>
                </div>

                {/* Decorative background icon */}
                <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none -rotate-12">
                  {cat.type === 'IN' ? <ArrowDownCircle size={120} /> : <ArrowUpCircle size={120} />}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* 4. MODAL REDESIGN */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[40px] md:rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border border-white animate-in slide-in-from-bottom duration-500">
            <div className="p-8 md:p-10 flex justify-between items-center bg-slate-50/50 border-b border-slate-100">
              <div className="space-y-1">
                <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                  {editingCategory ? 'Sửa danh mục' : 'Thêm danh mục'}
                </h3>
                <p className="text-sm font-bold text-slate-400">
                  {activeTab === 'IN' ? 'Phân loại các khoản thu nhập' : 'Phân loại các khoản chi phí'}
                </p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-12 h-12 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full text-slate-400 border border-slate-100 shadow-sm transition-all">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 md:p-10 space-y-8">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Tên danh mục *</label>
                <input 
                  autoFocus
                  type="text" 
                  className="w-full px-6 py-5 bg-slate-50 rounded-2xl outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-black text-xl text-slate-900"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="VD: Tiền điện, Tiếp khách..."
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Mô tả (tùy chọn)</label>
                <textarea 
                  className="w-full px-6 py-5 bg-slate-50 rounded-[24px] outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-medium text-slate-600 resize-none h-32"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="Nhập ghi chú thêm về danh mục này..."
                />
              </div>

              <div className="p-6 rounded-[32px] bg-slate-50/50 border border-slate-100 flex items-center justify-between gap-6">
                <div className="space-y-1">
                  <p className="text-base font-black text-slate-900 tracking-tight">Ghi nhận báo cáo</p>
                  <p className="text-[11px] font-bold text-slate-400 leading-relaxed max-w-[200px]">
                    {formData.is_revenue ? 'Sẽ được tính vào báo cáo P&L' : 'Chỉ ghi nhận biến động ví tiền'}
                  </p>
                </div>
                <Switch 
                  checked={formData.is_revenue} 
                  onChange={(val: boolean) => setFormData({...formData, is_revenue: val})} 
                />
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  className="w-full py-5 bg-slate-900 text-white rounded-full font-black uppercase tracking-widest text-[13px] shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={18} />
                  {editingCategory ? 'Lưu thay đổi' : 'Tạo danh mục ngay'}
                </button>
              </div>
            </form>
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

      {/* 5. MOBILE FLOATING ACTION */}
      <div className="fixed bottom-10 left-0 right-0 px-6 md:hidden z-50">
        <button 
          onClick={openCreateModal}
          className="w-full h-18 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-widest text-[13px] shadow-2xl shadow-slate-900/40 flex items-center justify-center gap-3 active:scale-95 transition-all"
        >
          <Plus size={20} /> Thêm danh mục mới
        </button>
      </div>
    </div>
  );
}
