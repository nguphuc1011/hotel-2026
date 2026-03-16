'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Users, Search, Plus, Filter, MoreHorizontal, 
  CreditCard, Ban, CheckCircle, ChevronRight, Phone, MapPin, Trash2,
  ShieldCheck, UserPlus, UserCheck, UserX, Info
} from 'lucide-react';
import { customerService, Customer } from '@/services/customerService';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';
import { formatMoney } from '@/utils/format';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSION_KEYS } from '@/services/permissionService';

export default function CustomersPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const { can, isLoading: isAuthLoading } = usePermission();
  const { confirm: confirmDialog } = useGlobalDialog();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isBanned, setIsBanned] = useState<boolean | undefined>(undefined);
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    banned: 0,
    withDebt: 0
  });

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    full_name: '',
    phone: '',
    id_card: '',
    email: '',
    address: '',
    notes: ''
  });

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { data, total } = await customerService.getCustomers({ 
        search, 
        is_banned: isBanned,
        limit: 100 // Lấy nhiều hơn để hiển thị danh sách tốt hơn
      });
      setCustomers(data);
      
      // Calculate basic stats for the dashboard feel
      if (search === '' && isBanned === undefined) {
        setStats({
          total: total,
          active: data.filter(c => !c.is_banned).length, // Note: This is only for the current page if not handled by server
          banned: data.filter(c => c.is_banned).length,
          withDebt: data.filter(c => c.balance < 0).length
        });
      }
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải danh sách khách hàng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (can(PERMISSION_KEYS.VIEW_CUSTOMERS)) {
        loadCustomers();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [search, isBanned, can]);

  const handleCreate = async () => {
    if (!newCustomer.full_name) {
      toast.error('Vui lòng nhập tên khách');
      return;
    }
    
    const res = await customerService.createCustomer(newCustomer);
    if (res) {
      setShowCreateModal(false);
      setNewCustomer({
        full_name: '', phone: '', id_card: '', email: '', address: '', notes: ''
      });
      loadCustomers();
      toast.success('Đã tạo khách hàng mới thành công');
    } else {
      toast.error('Có lỗi xảy ra khi tạo khách hàng');
    }
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await confirmDialog({
      title: 'Xóa khách hàng',
      message: 'Bạn có chắc muốn xóa khách hàng này? Hành động này không thể hoàn tác.',
      type: 'confirm'
    });
    
    if (!isConfirmed) return;
    
    const res = await customerService.deleteCustomer(id);
    if (res.success) {
      loadCustomers();
      toast.success('Đã xóa khách hàng thành công');
    } else {
      toast.error(res.message);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!can(PERMISSION_KEYS.VIEW_CUSTOMERS)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
        <div className="text-center p-10 bg-white/80 backdrop-blur-xl rounded-[40px] border border-white shadow-xl">
          <ShieldCheck size={64} className="mx-auto text-slate-200 mb-6" />
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Quyền truy cập bị từ chối</h1>
          <p className="text-slate-500 font-medium">Vui lòng liên hệ quản trị viên để được cấp quyền.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-slate-900 font-sans selection:bg-slate-900 selection:text-white pb-32">
      
      {/* 1. APPLE STYLE HEADER */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-[1600px] mx-auto px-4 md:px-10 h-20 md:h-24 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">Khách hàng</h1>
            <span className="hidden md:block text-slate-400 font-medium text-sm tracking-tight">Quản lý hồ sơ & công nợ</span>
          </div>
          
          <div className="flex items-center gap-3 md:gap-4">
            <button 
              onClick={() => setShowCreateModal(true)}
              className="h-10 md:h-12 px-5 md:px-8 bg-slate-900 text-white rounded-full text-[13px] font-bold hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
            >
              <UserPlus size={18} strokeWidth={2.5} />
              <span className="hidden sm:inline">Thêm khách mới</span>
              <span className="sm:hidden">Thêm</span>
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-4 md:px-10 py-8 md:py-12 space-y-10 md:space-y-16">
        
        {/* 2. STATS SECTION (BENTO LIGHT) */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
          {[
            { label: 'Tổng số khách', value: stats.total, icon: <Users size={20} />, color: 'slate' },
            { label: 'Đang hoạt động', value: stats.active, icon: <UserCheck size={20} />, color: 'emerald' },
            { label: 'Khách bị cấm', value: stats.banned, icon: <UserX size={20} />, color: 'rose' },
            { label: 'Đang nợ tiền', value: stats.withDebt, icon: <CreditCard size={20} />, color: 'amber' },
          ].map((item, idx) => (
            <div key={idx} className="bg-white/80 backdrop-blur-md rounded-[24px] md:rounded-[32px] p-5 md:p-8 border border-white shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all duration-500 group">
              <div className={cn(
                "w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center mb-4 md:mb-6 shadow-sm",
                item.color === 'slate' ? "bg-slate-100 text-slate-600" :
                item.color === 'emerald' ? "bg-emerald-50 text-emerald-600" :
                item.color === 'rose' ? "bg-rose-50 text-rose-600" :
                "bg-amber-50 text-amber-600"
              )}>
                {item.icon}
              </div>
              <p className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl md:text-4xl font-black tracking-tight">{item.value}</span>
                <span className="text-[10px] md:text-xs font-black text-slate-300 uppercase">Hồ sơ</span>
              </div>
            </div>
          ))}
        </section>

        {/* 3. SEARCH & FILTERS */}
        <section className="space-y-6 md:space-y-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Search Bar */}
            <div className="relative flex-1 max-w-2xl group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" size={20} />
              <input 
                type="text" 
                placeholder="Tìm tên, số điện thoại, CMND/CCCD..." 
                className="w-full pl-14 pr-6 py-4 md:py-5 bg-white rounded-full border border-slate-200/60 shadow-sm outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-900 transition-all font-bold text-sm md:text-base"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Status Toggles */}
            <div className="flex items-center gap-1.5 p-1.5 bg-white rounded-full border border-slate-200/60 shadow-sm overflow-x-auto no-scrollbar">
              {[
                { id: undefined, label: 'Tất cả' },
                { id: false, label: 'Hoạt động' },
                { id: true, label: 'Bị cấm' },
              ].map((filter) => (
                <button
                  key={String(filter.id)}
                  onClick={() => setIsBanned(filter.id as any)}
                  className={cn(
                    "px-6 py-2.5 md:px-8 md:py-3 rounded-full text-[12px] md:text-[13px] font-bold transition-all whitespace-nowrap uppercase tracking-widest",
                    isBanned === filter.id 
                      ? "bg-slate-900 text-white shadow-md" 
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4. CUSTOMER LIST (TABLE FOR PC, CARDS FOR MOBILE) */}
          <div className="bg-white/80 backdrop-blur-2xl rounded-[32px] md:rounded-[48px] border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] overflow-hidden">
            
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-10 py-8 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Khách hàng</th>
                    <th className="px-10 py-8 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Liên hệ</th>
                    <th className="px-10 py-8 text-right text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Số dư ví</th>
                    <th className="px-10 py-8 text-center text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Trạng thái</th>
                    <th className="px-10 py-8 text-right text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan={5} className="py-24 text-center"><div className="inline-block w-8 h-8 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" /></td></tr>
                  ) : customers.length === 0 ? (
                    <tr><td colSpan={5} className="py-24 text-center text-slate-300 font-black uppercase tracking-[0.2em]">Không tìm thấy khách hàng nào</td></tr>
                  ) : (
                    customers.map((cust) => (
                      <tr 
                        key={cust.id} 
                        className="group hover:bg-slate-50/50 transition-all duration-300 cursor-pointer"
                        onClick={() => router.push(`/${slug}/customers/${cust.id}`)}
                      >
                        <td className="px-10 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-900 font-black text-lg shadow-sm group-hover:scale-105 transition-transform">
                              {cust.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-base text-slate-900 tracking-tight">{cust.full_name}</div>
                              <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1.5 uppercase tracking-widest mt-0.5">
                                <CreditCard size={10} />
                                {cust.id_card || 'Trống'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-5">
                          <div className="space-y-1">
                            <div className="text-sm font-bold text-slate-600 flex items-center gap-2">
                              <Phone size={12} className="text-slate-300" />
                              {cust.phone || '---'}
                            </div>
                            {cust.address && (
                              <div className="text-[11px] text-slate-400 font-medium truncate max-w-[200px] flex items-center gap-2">
                                <MapPin size={10} className="text-slate-300" />
                                {cust.address}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-10 py-5 text-right">
                          <span className={cn(
                            "font-black text-xl tracking-tight",
                            cust.balance > 0 ? "text-emerald-600" : cust.balance < 0 ? "text-rose-600" : "text-slate-300"
                          )}>
                            {formatMoney(cust.balance)}
                          </span>
                        </td>
                        <td className="px-10 py-5 text-center">
                          {cust.is_banned ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-50 text-rose-600 text-[9px] font-black uppercase tracking-widest border border-rose-100">
                              Bị cấm
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-widest border border-emerald-100">
                              Hoạt động
                            </span>
                          )}
                        </td>
                        <td className="px-10 py-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              className="w-8 h-8 flex items-center justify-center hover:bg-rose-50 rounded-full text-slate-300 hover:text-rose-600 transition-all"
                              onClick={(e) => { e.stopPropagation(); handleDelete(cust.id); }}
                            >
                              <Trash2 size={16} />
                            </button>
                            <div className="w-8 h-8 flex items-center justify-center bg-slate-900 text-white rounded-full shadow-sm group-hover:translate-x-1 transition-all">
                              <ChevronRight size={16} strokeWidth={3} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden p-4 space-y-4">
              {loading ? (
                <div className="py-20 text-center"><div className="inline-block w-8 h-8 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" /></div>
              ) : customers.length === 0 ? (
                <div className="py-20 text-center text-slate-300 font-black uppercase tracking-[0.2em]">Không có dữ liệu</div>
              ) : (
                customers.map((cust) => (
                  <div 
                    key={cust.id} 
                    className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm active:scale-[0.98] transition-all"
                    onClick={() => router.push(`/${slug}/customers/${cust.id}`)}
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-900 font-black text-xl shadow-sm">
                          {cust.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-black text-lg text-slate-900 tracking-tight truncate max-w-[180px]">{cust.full_name}</h4>
                          <div className={cn(
                            "text-[10px] font-black uppercase tracking-widest mt-1",
                            cust.is_banned ? "text-rose-500" : "text-emerald-500"
                          )}>
                            {cust.is_banned ? 'Bị cấm' : 'Hoạt động'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={cn(
                          "text-xl font-black tracking-tighter",
                          cust.balance > 0 ? "text-emerald-600" : cust.balance < 0 ? "text-rose-600" : "text-slate-300"
                        )}>
                          {formatMoney(cust.balance)}
                        </div>
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">Số dư ví</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                          <Phone size={14} />
                        </div>
                        <span className="text-[13px] font-bold text-slate-600">{cust.phone || '---'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                          <CreditCard size={14} />
                        </div>
                        <span className="text-[13px] font-bold text-slate-600 truncate">{cust.id_card || '---'}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>

      {/* 5. CREATE CUSTOMER MODAL (APPLE REDESIGN) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[40px] md:rounded-[40px] shadow-2xl w-full max-w-xl overflow-hidden border border-white animate-in slide-in-from-bottom duration-500">
            <div className="p-8 md:p-10 flex justify-between items-center bg-slate-50/50 border-b border-slate-100">
              <div className="space-y-1">
                <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Hồ sơ khách mới</h3>
                <p className="text-sm font-bold text-slate-400">Nhập thông tin cơ bản để tạo hồ sơ</p>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)} 
                className="w-12 h-12 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full text-slate-400 transition-all border border-slate-100 shadow-sm"
              >✕</button>
            </div>
            
            <div className="p-8 md:p-10 space-y-8 max-h-[70vh] overflow-y-auto no-scrollbar">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Họ và tên khách hàng *</label>
                <input 
                  type="text" 
                  className="w-full px-6 py-4 md:py-5 bg-slate-50 rounded-3xl outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-black text-lg text-slate-900"
                  placeholder="Ví dụ: Nguyễn Văn A"
                  value={newCustomer.full_name}
                  onChange={e => setNewCustomer({...newCustomer, full_name: e.target.value})}
                  autoFocus
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Số điện thoại</label>
                  <div className="relative">
                    <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input 
                      type="text" 
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 rounded-2xl outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-bold text-slate-700"
                      placeholder="09..."
                      value={newCustomer.phone}
                      onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">CMND/CCCD</label>
                  <div className="relative">
                    <CreditCard className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input 
                      type="text" 
                      className="w-full pl-14 pr-6 py-4 bg-slate-50 rounded-2xl outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-bold text-slate-700"
                      placeholder="Số giấy tờ..."
                      value={newCustomer.id_card}
                      onChange={e => setNewCustomer({...newCustomer, id_card: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Địa chỉ liên hệ</label>
                <div className="relative">
                  <MapPin className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input 
                    type="text" 
                    className="w-full pl-14 pr-6 py-4 bg-slate-50 rounded-2xl outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-bold text-slate-700"
                    placeholder="Số nhà, tên đường, thành phố..."
                    value={newCustomer.address}
                    onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Ghi chú nội bộ</label>
                <textarea 
                  className="w-full px-6 py-5 bg-slate-50 rounded-[24px] outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-medium text-slate-600 resize-none h-32"
                  placeholder="Khách VIP, thói quen, sở thích hoặc lưu ý đặc biệt..."
                  value={newCustomer.notes}
                  onChange={e => setNewCustomer({...newCustomer, notes: e.target.value})}
                />
              </div>
            </div>

            <div className="p-8 md:p-10 bg-slate-50/50 border-t border-slate-100 flex flex-col md:flex-row gap-4 md:gap-6">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-8 py-4 md:py-5 rounded-full font-black text-slate-400 hover:bg-slate-200/50 transition-all uppercase tracking-widest text-[13px]"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleCreate}
                className="flex-[2] px-10 py-4 md:py-5 bg-slate-900 text-white rounded-full font-black uppercase tracking-widest text-[13px] shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all"
              >
                Tạo hồ sơ mới
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
