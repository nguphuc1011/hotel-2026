
'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, CreditCard, Phone, MapPin, Calendar, 
  Edit3, DollarSign, History, FileText, Ban, CheckCircle,
  TrendingUp, TrendingDown, AlertCircle
} from 'lucide-react';
import { customerService, Customer, CustomerTransaction } from '@/services/customerService';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'transactions' | 'bookings' | 'notes'>('transactions');

  // Transaction Modal
  const [showTransModal, setShowTransModal] = useState(false);
  const [transForm, setTransForm] = useState({
    amount: '',
    type: 'payment' as 'payment' | 'charge' | 'refund' | 'adjustment',
    description: ''
  });

  // Edit Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone: '',
    id_card: '',
    email: '',
    address: '',
    notes: ''
  });

  const loadData = async () => {
    setLoading(true);
    const [cust, trans, bks] = await Promise.all([
      customerService.getCustomerById(id),
      customerService.getTransactions(id),
      customerService.getCustomerBookings(id)
    ]);
    setCustomer(cust);
    setTransactions(trans);
    setBookings(bks || []);
    
    if (cust) {
      setEditForm({
        full_name: cust.full_name,
        phone: cust.phone || '',
        id_card: cust.id_card || '',
        email: cust.email || '',
        address: cust.address || '',
        notes: cust.notes || ''
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleTransaction = async () => {
    if (!customer) return;
    const amountVal = parseFloat(transForm.amount.replace(/[^0-9]/g, ''));
    if (!amountVal || amountVal <= 0) {
      toast.error('Vui lòng nhập số tiền hợp lệ');
      return;
    }

    // Calculate signed amount based on type
    let finalAmount = amountVal;
    if (transForm.type === 'charge' || transForm.type === 'refund') {
      finalAmount = -amountVal;
    }
    // For adjustment, we assume user enters positive for credit, but maybe we need a toggle?
    // Let's keep it simple: Adjustment adds the amount. If they want to deduct, they select Charge?
    // Actually, 'Adjustment' might need a sign selector. For now, let's treat Adjustment as + (Credit).

    const res = await customerService.adjustBalance(
      customer.id,
      finalAmount,
      transForm.type,
      transForm.description || getTypeLabel(transForm.type)
    );

    if (res.success) {
      setShowTransModal(false);
      setTransForm({ amount: '', type: 'payment', description: '' });
      loadData(); // Reload all
      toast.success('Giao dịch thành công');
    } else {
      toast.error('Lỗi: ' + res.message);
    }
  };

  const handleUpdate = async () => {
    if (!customer) return;
    if (!editForm.full_name.trim()) {
      toast.error('Vui lòng nhập tên khách hàng');
      return;
    }

    const updated = await customerService.updateCustomer(customer.id, editForm);
    if (updated) {
      setShowEditModal(false);
      loadData();
      toast.success('Cập nhật hồ sơ thành công');
    } else {
      toast.error('Lỗi khi cập nhật hồ sơ');
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'payment': return 'Thanh toán / Nạp tiền';
      case 'charge': return 'Ghi nợ / Phí dịch vụ';
      case 'refund': return 'Hoàn tiền';
      case 'adjustment': return 'Điều chỉnh số dư';
      default: return type;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  if (loading) return <div className="p-10 text-center text-muted font-bold">Đang tải hồ sơ...</div>;
  if (!customer) return <div className="p-10 text-center text-red-500 font-bold">Không tìm thấy khách hàng</div>;

  return (
    <div className="min-h-screen p-8 space-y-6">
      {/* Header */}
      <button 
        onClick={() => router.back()}
        className="flex items-center gap-2 text-muted hover:text-main font-bold transition-colors"
      >
        <ArrowLeft size={20} /> Quay lại danh sách
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Profile */}
        <div className="space-y-6">
          <div className="bg-white/60 backdrop-blur-xl rounded-[32px] border border-white/40 shadow-xl p-8 text-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-purple-50/50 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-accent to-blue-600 text-white flex items-center justify-center text-4xl font-black shadow-lg shadow-accent/30 mb-4">
                {customer.full_name.charAt(0).toUpperCase()}
              </div>
              
              <h1 className="text-2xl font-black text-main mb-1">{customer.full_name}</h1>
              <div className="flex items-center gap-2 text-muted font-medium mb-6">
                {customer.is_banned ? (
                  <span className="flex items-center gap-1 text-red-600 bg-red-100 px-3 py-1 rounded-full text-xs font-bold">
                    <Ban size={12} /> Bị cấm
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-green-600 bg-green-100 px-3 py-1 rounded-full text-xs font-bold">
                    <CheckCircle size={12} /> Hoạt động
                  </span>
                )}
                <span className="text-gray-300">|</span>
                <span>ID: {customer.id.slice(0, 8)}</span>
              </div>

              <div className="w-full bg-white/50 rounded-2xl p-6 border border-white/60 mb-6">
                <div className="text-xs font-bold text-muted uppercase tracking-widest mb-2">Số dư ví</div>
                <div className={cn(
                  "text-3xl font-black tracking-tight",
                  customer.balance >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  {formatCurrency(customer.balance)}
                </div>
                <div className="text-xs text-gray-400 mt-2 font-medium">
                  {customer.balance < 0 ? 'Khách đang nợ tiền' : 'Số dư khả dụng'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 w-full">
                <button 
                  onClick={() => setShowTransModal(true)}
                  className="flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-white py-3 rounded-xl font-bold shadow-lg shadow-accent/20 transition-all active:scale-95"
                >
                  <DollarSign size={18} /> Giao dịch
                </button>
                <button 
                  onClick={() => setShowEditModal(true)}
                  className="flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-main py-3 rounded-xl font-bold border border-gray-200 transition-all active:scale-95"
                >
                  <Edit3 size={18} /> Sửa hồ sơ
                </button>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-white/60 backdrop-blur-xl rounded-[32px] border border-white/40 shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <FileText size={20} className="text-accent" /> Thông tin liên hệ
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm font-medium p-3 bg-white/40 rounded-xl">
                <Phone size={18} className="text-gray-400" />
                <span>{customer.phone || 'Chưa có SĐT'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm font-medium p-3 bg-white/40 rounded-xl">
                <CreditCard size={18} className="text-gray-400" />
                <span>{customer.id_card || 'Chưa có CMND'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm font-medium p-3 bg-white/40 rounded-xl">
                <MapPin size={18} className="text-gray-400" />
                <span className="truncate">{customer.address || 'Chưa có địa chỉ'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm font-medium p-3 bg-white/40 rounded-xl">
                <Calendar size={18} className="text-gray-400" />
                <span>Tham gia: {format(new Date(customer.created_at), 'dd/MM/yyyy')}</span>
              </div>
            </div>
          </div>
          
          {/* Notes */}
          {customer.notes && (
             <div className="bg-yellow-50/80 backdrop-blur-xl rounded-[32px] border border-yellow-100 shadow-sm p-6">
               <h3 className="font-bold text-lg flex items-center gap-2 text-yellow-700 mb-2">
                 <AlertCircle size={20} /> Ghi chú
               </h3>
               <p className="text-sm font-medium text-yellow-800 leading-relaxed">
                 {customer.notes}
               </p>
             </div>
          )}
        </div>

        {/* Right Column: Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabs */}
          <div className="flex items-center gap-2 p-1.5 bg-white/40 backdrop-blur-md rounded-2xl w-fit border border-white/40">
            <button 
              onClick={() => setActiveTab('transactions')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'transactions' ? "bg-white shadow-sm text-accent" : "text-muted hover:text-main"
              )}
            >
              <History size={16} /> Lịch sử giao dịch
            </button>
            <button 
              onClick={() => setActiveTab('bookings')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'bookings' ? "bg-white shadow-sm text-accent" : "text-muted hover:text-main"
              )}
            >
              <Calendar size={16} /> Lịch sử thuê phòng
            </button>
          </div>

          {/* Content Area */}
          <div className="bg-white/60 backdrop-blur-xl rounded-[32px] border border-white/40 shadow-xl overflow-hidden min-h-[500px]">
            {activeTab === 'transactions' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-white/40">
                      <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider text-muted">Thời gian</th>
                      <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider text-muted">Loại giao dịch</th>
                      <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-wider text-muted">Nội dung</th>
                      <th className="px-6 py-4 text-right text-xs font-black uppercase tracking-wider text-muted">Số tiền</th>
                      <th className="px-6 py-4 text-right text-xs font-black uppercase tracking-wider text-muted">Số dư sau GD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-muted">Chưa có giao dịch nào</td>
                      </tr>
                    ) : (
                      transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-white/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-gray-600">
                            {format(new Date(tx.created_at), 'HH:mm dd/MM/yyyy')}
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold",
                              tx.type === 'payment' ? "bg-green-100 text-green-700" :
                              tx.type === 'charge' ? "bg-red-100 text-red-700" :
                              tx.type === 'refund' ? "bg-blue-100 text-blue-700" :
                              "bg-gray-100 text-gray-700"
                            )}>
                              {getTypeLabel(tx.type)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-700 max-w-[200px] truncate">
                            {tx.description || '---'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className={cn(
                              "font-bold flex items-center justify-end gap-1",
                              tx.amount > 0 ? "text-green-600" : "text-red-600"
                            )}>
                              {tx.amount > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                              {formatCurrency(Math.abs(tx.amount))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-bold text-gray-600">
                            {formatCurrency(tx.balance_after)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            
            {activeTab === 'bookings' && (
              <div className="p-12 text-center text-muted font-medium">
                Tính năng đang phát triển...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transaction Modal */}
      {showTransModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden border border-white/40">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-xl font-black text-main">Giao dịch mới</h3>
              <button onClick={() => setShowTransModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">✕</button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setTransForm({...transForm, type: 'payment'})}
                  className={cn(
                    "p-3 rounded-xl border-2 font-bold text-sm transition-all",
                    transForm.type === 'payment' ? "border-green-500 bg-green-50 text-green-700" : "border-transparent bg-gray-50 text-muted hover:bg-gray-100"
                  )}
                >
                  Nạp tiền / Trả nợ
                </button>
                <button 
                  onClick={() => setTransForm({...transForm, type: 'charge'})}
                  className={cn(
                    "p-3 rounded-xl border-2 font-bold text-sm transition-all",
                    transForm.type === 'charge' ? "border-red-500 bg-red-50 text-red-700" : "border-transparent bg-gray-50 text-muted hover:bg-gray-100"
                  )}
                >
                  Ghi nợ / Phạt
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted uppercase mb-1">Số tiền (VND)</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-4 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 font-black text-2xl text-main text-right"
                  placeholder="0"
                  value={transForm.amount ? new Intl.NumberFormat('vi-VN').format(Number(transForm.amount.replace(/[^0-9]/g, ''))) : ''}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setTransForm({...transForm, amount: val});
                  }}
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-muted uppercase mb-1">Nội dung</label>
                <textarea 
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 font-medium resize-none h-20"
                  placeholder="Nhập ghi chú giao dịch..."
                  value={transForm.description}
                  onChange={e => setTransForm({...transForm, description: e.target.value})}
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
              <button 
                onClick={() => setShowTransModal(false)}
                className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={handleTransaction}
                className="px-6 py-3 rounded-xl font-bold bg-accent text-white shadow-lg shadow-accent/20 hover:bg-accent/90 transition-colors"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden border border-white/40">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-xl font-black text-main">Sửa thông tin khách hàng</h3>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">✕</button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-muted uppercase mb-1">Họ và tên *</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 font-bold text-main"
                  value={editForm.full_name}
                  onChange={e => setEditForm({...editForm, full_name: e.target.value})}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-muted uppercase mb-1">Số điện thoại</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 font-medium"
                    value={editForm.phone}
                    onChange={e => setEditForm({...editForm, phone: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase mb-1">CMND/CCCD</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 font-medium"
                    value={editForm.id_card}
                    onChange={e => setEditForm({...editForm, id_card: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted uppercase mb-1">Email</label>
                <input 
                  type="email" 
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 font-medium"
                  value={editForm.email}
                  onChange={e => setEditForm({...editForm, email: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted uppercase mb-1">Địa chỉ</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 font-medium"
                  value={editForm.address}
                  onChange={e => setEditForm({...editForm, address: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted uppercase mb-1">Ghi chú</label>
                <textarea 
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 font-medium resize-none h-24"
                  value={editForm.notes}
                  onChange={e => setEditForm({...editForm, notes: e.target.value})}
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
              <button 
                onClick={() => setShowEditModal(false)}
                className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition-colors"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleUpdate}
                className="px-6 py-3 rounded-xl font-bold bg-accent text-white shadow-lg shadow-accent/20 hover:bg-accent/90 transition-colors"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
