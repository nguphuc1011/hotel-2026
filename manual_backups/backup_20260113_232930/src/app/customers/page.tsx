
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, Search, Plus, Filter, MoreHorizontal, 
  CreditCard, Ban, CheckCircle, ChevronRight, Phone, MapPin, Trash2 
} from 'lucide-react';
import { customerService, Customer } from '@/services/customerService';
import { cn } from '@/lib/utils';

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isBanned, setIsBanned] = useState<boolean | undefined>(undefined);
  
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
    const { data } = await customerService.getCustomers({ 
      search, 
      is_banned: isBanned 
    });
    setCustomers(data);
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers();
    }, 500);
    return () => clearTimeout(timer);
  }, [search, isBanned]);

  const handleCreate = async () => {
    if (!newCustomer.full_name) return alert('Vui lòng nhập tên khách');
    
    const res = await customerService.createCustomer(newCustomer);
    if (res) {
      setShowCreateModal(false);
      setNewCustomer({
        full_name: '', phone: '', id_card: '', email: '', address: '', notes: ''
      });
      loadCustomers();
    } else {
      alert('Có lỗi xảy ra khi tạo khách hàng');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa khách hàng này? Hành động này không thể hoàn tác.')) return;
    
    const res = await customerService.deleteCustomer(id);
    if (res.success) {
      loadCustomers();
    } else {
      alert(res.message);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="min-h-screen p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-main flex items-center gap-3">
            <Users className="text-accent" size={32} />
            Khách hàng
          </h1>
          <p className="text-muted font-medium mt-1">Quản lý hồ sơ, công nợ và lịch sử khách hàng</p>
        </div>
        
        <button 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-5 py-3 rounded-2xl font-bold shadow-lg shadow-accent/20 transition-all active:scale-95"
        >
          <Plus size={20} />
          Thêm khách mới
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white/50 backdrop-blur-xl p-4 rounded-3xl border border-white/40 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Tìm theo tên, SĐT, CMND..." 
            className="w-full pl-12 pr-4 py-3 bg-white/80 rounded-2xl outline-none focus:ring-2 focus:ring-accent/20 transition-all font-medium"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2 bg-white/80 p-1.5 rounded-2xl border border-white/40">
          <button 
            onClick={() => setIsBanned(undefined)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition-all",
              isBanned === undefined ? "bg-gray-100 text-main" : "text-muted hover:bg-gray-50"
            )}
          >
            Tất cả
          </button>
          <button 
            onClick={() => setIsBanned(false)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition-all",
              isBanned === false ? "bg-green-100 text-green-700" : "text-muted hover:bg-gray-50"
            )}
          >
            Hoạt động
          </button>
          <button 
            onClick={() => setIsBanned(true)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition-all",
              isBanned === true ? "bg-red-100 text-red-700" : "text-muted hover:bg-gray-50"
            )}
          >
            Bị cấm
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/60 backdrop-blur-xl rounded-[32px] border border-white/40 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-white/40">
                <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider text-muted">Khách hàng</th>
                <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider text-muted">Liên hệ</th>
                <th className="px-6 py-4 text-right text-xs font-black uppercase tracking-wider text-muted">Số dư (Ví)</th>
                <th className="px-6 py-4 text-center text-xs font-black uppercase tracking-wider text-muted">Trạng thái</th>
                <th className="px-6 py-4 text-right text-xs font-black uppercase tracking-wider text-muted">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted">Đang tải dữ liệu...</td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted">Chưa có khách hàng nào</td>
                </tr>
              ) : (
                customers.map((cust) => (
                  <tr 
                    key={cust.id} 
                    className="hover:bg-white/50 transition-colors cursor-pointer group"
                    onClick={() => router.push(`/customers/${cust.id}`)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-accent font-black">
                          {cust.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-main group-hover:text-accent transition-colors">{cust.full_name}</div>
                          <div className="text-xs text-muted font-medium flex items-center gap-1">
                            <CreditCard size={12} />
                            {cust.id_card || 'Chưa có CMND'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-bold text-gray-700 flex items-center gap-1">
                          <Phone size={14} className="text-gray-400" />
                          {cust.phone || '---'}
                        </div>
                        {cust.address && (
                          <div className="text-xs text-muted truncate max-w-[200px] flex items-center gap-1">
                            <MapPin size={12} className="text-gray-400" />
                            {cust.address}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={cn(
                        "font-black text-base",
                        cust.balance > 0 ? "text-green-600" : cust.balance < 0 ? "text-red-600" : "text-gray-400"
                      )}>
                        {formatCurrency(cust.balance)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {cust.is_banned ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                          <Ban size={12} /> Bị cấm
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                          <CheckCircle size={12} /> Hoạt động
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          className="p-2 hover:bg-red-100 rounded-full text-gray-400 hover:text-red-500 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(cust.id);
                          }}
                          title="Xóa khách hàng"
                        >
                          <Trash2 size={18} />
                        </button>
                        <button className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-accent transition-colors">
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination (Simple) */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center text-sm text-muted font-medium">
          <div>Hiển thị {customers.length} khách hàng</div>
          <div className="flex gap-2">
            <button className="px-3 py-1 hover:bg-gray-100 rounded-lg disabled:opacity-50" disabled>Trước</button>
            <button className="px-3 py-1 hover:bg-gray-100 rounded-lg disabled:opacity-50" disabled>Sau</button>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden border border-white/40">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-xl font-black text-main">Thêm khách hàng mới</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">✕</button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted uppercase mb-1">Họ và tên *</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 font-bold text-main"
                  placeholder="Nhập tên khách..."
                  value={newCustomer.full_name}
                  onChange={e => setNewCustomer({...newCustomer, full_name: e.target.value})}
                  autoFocus
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-muted uppercase mb-1">Số điện thoại</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 font-medium"
                    placeholder="09..."
                    value={newCustomer.phone}
                    onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase mb-1">CMND/CCCD</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 font-medium"
                    placeholder="Số giấy tờ..."
                    value={newCustomer.id_card}
                    onChange={e => setNewCustomer({...newCustomer, id_card: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted uppercase mb-1">Địa chỉ</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 font-medium"
                  placeholder="Địa chỉ liên hệ..."
                  value={newCustomer.address}
                  onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted uppercase mb-1">Ghi chú</label>
                <textarea 
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 font-medium resize-none h-24"
                  placeholder="Ghi chú về khách (VIP, sở thích...)"
                  value={newCustomer.notes}
                  onChange={e => setNewCustomer({...newCustomer, notes: e.target.value})}
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition-colors"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleCreate}
                className="px-6 py-3 rounded-xl font-bold bg-accent text-white shadow-lg shadow-accent/20 hover:bg-accent/90 transition-colors"
              >
                Tạo khách hàng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
