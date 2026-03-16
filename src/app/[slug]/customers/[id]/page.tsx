'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  ArrowLeft, CreditCard, Phone, MapPin, Calendar, 
  Edit3, DollarSign, History, FileText, Ban, CheckCircle,
  TrendingUp, TrendingDown, AlertCircle, ChevronRight,
  User, Mail, StickyNote, ShieldCheck, Plus, ArrowUpRight,
  Clock, X, Banknote
} from 'lucide-react';
import { customerService, Customer, CustomerTransaction } from '@/services/customerService';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { toast } from 'sonner';

import { useSecurity } from '@/hooks/useSecurity';
import { formatMoney } from '@/utils/format';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSION_KEYS } from '@/services/permissionService';

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const { slug } = useParams();
  const { can, isLoading: isAuthLoading } = usePermission();
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'transactions' | 'bookings'>('transactions');

  // New state for mobile view
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Security Hook
  const { verify, SecurityModals } = useSecurity();

  // Transaction Modal
  const [showTransModal, setShowTransModal] = useState(false);
  const [transForm, setTransForm] = useState({
    amount: '',
    type: 'payment' as 'payment' | 'charge' | 'refund' | 'adjustment',
    description: '',
    payment_method: 'cash'
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
    try {
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
    } catch (err) {
      console.error(err);
      toast.error('Không thể tải dữ liệu khách hàng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (can(PERMISSION_KEYS.VIEW_CUSTOMERS)) {
      loadData();
    }
  }, [id, can]);

  const handleTransaction = async (verifiedStaff?: { id: string, name: string }) => {
    if (!customer) return;
    const amountVal = parseFloat(transForm.amount.replace(/[^0-9]/g, ''));
    if (!amountVal || amountVal <= 0) {
      toast.error('Vui lòng nhập số tiền hợp lệ');
      return;
    }

    if (!verifiedStaff && transForm.type === 'refund') {
      await verify('checkout_refund', (staffId, staffName) => 
        handleTransaction(staffId ? { id: staffId, name: staffName || '' } : undefined)
      );
      return;
    }

    let finalAmount = amountVal;
    if (transForm.type === 'charge' || transForm.type === 'refund') {
      finalAmount = -amountVal;
    }

    const res = await customerService.adjustBalance(
      customer.id,
      finalAmount,
      transForm.type,
      transForm.description || getTypeLabel(transForm.type),
      verifiedStaff,
      transForm.payment_method
    );

    if (res.success) {
      setShowTransModal(false);
      setTransForm({ amount: '', type: 'payment', description: '', payment_method: 'cash' });
      loadData();
      
      const newBalance = res.new_balance;
      if (newBalance < 0) {
        toast.warning(`Giao dịch thành công. Khách còn nợ: ${formatMoney(newBalance)}`);
      } else {
        toast.success(`Giao dịch thành công. Số dư hiện tại: ${formatMoney(newBalance)}`);
      }
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
      case 'payment': return 'Nạp tiền / Trả nợ';
      case 'charge': return 'Ghi nợ / Phí';
      case 'refund': return 'Hoàn tiền';
      case 'adjustment': return 'Điều chỉnh';
      default: return type;
    }
  };

  if (isAuthLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!can(PERMISSION_KEYS.VIEW_CUSTOMERS) || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
        <div className="text-center p-10 bg-white/80 backdrop-blur-xl rounded-[40px] border border-white shadow-xl">
          <ShieldCheck size={64} className="mx-auto text-slate-200 mb-6" />
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Không có quyền truy cập</h1>
          <p className="text-slate-500 font-medium">Vui lòng quay lại hoặc liên hệ quản lý.</p>
          <button onClick={() => router.back()} className="mt-6 px-8 py-3 bg-slate-900 text-white rounded-full font-bold">Quay lại</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-slate-900 font-sans selection:bg-slate-900 selection:text-white pb-32">
      {SecurityModals}
      
      {/* 1. TOP NAV */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-[1600px] mx-auto px-4 md:px-10 h-20 md:h-24 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()}
              className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white rounded-full border border-slate-200 shadow-sm hover:bg-slate-50 transition-all active:scale-90"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">Chi tiết khách hàng</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => setShowEditModal(true)}
              className="h-10 md:h-12 px-4 md:px-6 bg-white text-slate-600 rounded-full text-[13px] font-bold border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2"
            >
              <Edit3 size={16} />
              <span className="hidden sm:inline">Chỉnh sửa</span>
            </button>
            <button 
              onClick={() => setShowTransModal(true)}
              className="h-10 md:h-12 px-5 md:px-8 bg-slate-900 text-white rounded-full text-[13px] font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
            >
              <DollarSign size={18} strokeWidth={3} />
              <span>Giao dịch</span>
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-4 md:px-10 py-8 md:py-12 space-y-10 md:space-y-16">
        
        {/* 2. HERO PROFILE SECTION */}
        <section className="flex flex-col lg:grid lg:grid-cols-3 gap-8 md:gap-12">
          {/* Main Info Card */}
          <div className="lg:col-span-1">
            <div className="bg-white/80 backdrop-blur-xl rounded-[40px] p-8 md:p-12 border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] flex flex-col items-center text-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none -rotate-12 group-hover:rotate-0">
                <User size={200} strokeWidth={0.5} />
              </div>

              <div className="relative z-10 w-24 h-24 md:w-32 md:h-32 rounded-[32px] md:rounded-[40px] bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-900 font-black text-4xl md:text-5xl shadow-sm mb-6 md:mb-8 group-hover:scale-105 transition-transform duration-500">
                {customer.full_name.charAt(0).toUpperCase()}
              </div>
              
              <div className="relative z-10 space-y-2 mb-8 md:mb-10">
                <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-none">{customer.full_name}</h2>
                <div className="flex items-center justify-center gap-2">
                  {customer.is_banned ? (
                    <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-rose-50 text-rose-600 text-[10px] font-black uppercase tracking-widest border border-rose-100 shadow-sm">
                      <Ban size={12} /> Bị cấm
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest border border-emerald-100 shadow-sm">
                      <CheckCircle size={12} /> Hoạt động
                    </span>
                  )}
                </div>
              </div>

              <div className="relative z-10 w-full bg-slate-50/50 rounded-[32px] p-8 border border-slate-100/50">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Số dư hiện tại</p>
                <div className={cn(
                  "text-4xl md:text-5xl font-black tracking-tighter leading-none mb-3",
                  customer.balance >= 0 ? "text-emerald-600" : "text-rose-600"
                )}>
                  {formatMoney(customer.balance)}
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {customer.balance < 0 ? 'Đang nợ tiền khách sạn' : 'Số dư khả dụng trong ví'}
                </p>
              </div>
            </div>
          </div>

          {/* Contact & Meta Details Grid */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div className="bg-white/80 backdrop-blur-xl rounded-[32px] p-8 md:p-10 border border-white shadow-sm flex flex-col justify-between">
              <div className="space-y-6">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Thông tin liên hệ</h3>
                <div className="space-y-5">
                  <div className="flex items-center gap-4 group">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform"><Phone size={20} /></div>
                    <div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Số điện thoại</p>
                      <p className="text-lg font-black text-slate-700 tracking-tight">{customer.phone || '---'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 group">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform"><CreditCard size={20} /></div>
                    <div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">CMND / CCCD</p>
                      <p className="text-lg font-black text-slate-700 tracking-tight">{customer.id_card || '---'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 group">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform"><MapPin size={20} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Địa chỉ</p>
                      <p className="text-lg font-black text-slate-700 tracking-tight truncate">{customer.address || '---'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl rounded-[32px] p-8 md:p-10 border border-white shadow-sm flex flex-col justify-between">
              <div className="space-y-6">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Thông tin bổ sung</h3>
                <div className="space-y-5">
                  <div className="flex items-center gap-4 group">
                    <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform"><Calendar size={20} /></div>
                    <div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Ngày tham gia</p>
                      <p className="text-lg font-black text-slate-700 tracking-tight">{format(new Date(customer.created_at), 'dd/MM/yyyy', { locale: vi })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 group">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-500 flex items-center justify-center group-hover:scale-110 transition-transform"><Mail size={20} /></div>
                    <div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Email</p>
                      <p className="text-lg font-black text-slate-700 tracking-tight">{customer.email || '---'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 group">
                    <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center group-hover:scale-110 transition-transform"><History size={20} /></div>
                    <div>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Lượt thuê</p>
                      <p className="text-lg font-black text-slate-700 tracking-tight">{bookings.length} lần</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. TABS & CONTENT SECTION */}
        <section className="space-y-8 md:space-y-12">
          {/* Tabs Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 px-2">
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg"><History size={24} /></div>
                <h2 className="text-3xl font-black tracking-tight">Hoạt động</h2>
              </div>
              <p className="text-slate-400 font-bold text-sm ml-16">Theo dõi biến động số dư và lịch sử thuê phòng</p>
            </div>

            <div className="flex items-center gap-1.5 p-1.5 bg-white rounded-full border border-slate-200/60 shadow-sm">
              <button 
                onClick={() => setActiveTab('transactions')}
                className={cn(
                  "px-6 py-2.5 rounded-full text-[13px] font-bold transition-all uppercase tracking-widest flex items-center gap-2",
                  activeTab === 'transactions' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                <DollarSign size={16} /> Giao dịch
              </button>
              <button 
                onClick={() => setActiveTab('bookings')}
                className={cn(
                  "px-6 py-2.5 rounded-full text-[13px] font-bold transition-all uppercase tracking-widest flex items-center gap-2",
                  activeTab === 'bookings' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                <Calendar size={16} /> Thuê phòng
              </button>
            </div>
          </div>

          {/* List Card View (Responsive Table) */}
          <div className="bg-white/80 backdrop-blur-2xl rounded-[40px] md:rounded-[60px] border border-white shadow-[0_20px_80px_rgba(0,0,0,0.04)] overflow-hidden">
            {activeTab === 'transactions' && (
              <div className="overflow-x-auto">
                {isMobile ? (
                  <div className="divide-y divide-slate-100">
                    {transactions.length === 0 ? (
                      <div className="py-20 text-center text-slate-300 font-black uppercase tracking-[0.2em]">Chưa có giao dịch nào</div>
                    ) : (
                      transactions.map((tx) => (
                        <div key={tx.id} className="p-6 space-y-4 active:bg-slate-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <div className="text-lg font-black text-slate-900 tracking-tight leading-none">{format(new Date(tx.created_at), 'HH:mm')}</div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{format(new Date(tx.created_at), 'dd/MM/yyyy')}</div>
                            </div>
                            <span className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                              tx.type === 'payment' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                              tx.type === 'charge' ? "bg-rose-50 text-rose-600 border-rose-100" :
                              tx.type === 'refund' ? "bg-blue-50 text-blue-600 border-blue-100" :
                              "bg-slate-50 text-slate-600 border-slate-100"
                            )}>
                              {getTypeLabel(tx.type)}
                            </span>
                          </div>
                          
                          <div className="text-sm font-bold text-slate-500 line-clamp-2">
                            {tx.description || '---'}
                          </div>

                          <div className="flex justify-between items-end pt-2">
                            <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Số dư: {formatMoney(tx.balance_after)}</div>
                            <div className={cn(
                              "font-black text-2xl tracking-tighter",
                              tx.amount > 0 ? "text-emerald-600" : "text-rose-600"
                            )}>
                              {tx.amount > 0 ? '+' : '-'}{formatMoney(Math.abs(tx.amount))}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-10 py-8 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Thời gian</th>
                        <th className="px-10 py-8 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Loại giao dịch</th>
                        <th className="px-10 py-8 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Nội dung</th>
                        <th className="px-10 py-8 text-right text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Số tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {transactions.length === 0 ? (
                        <tr><td colSpan={4} className="py-32 text-center text-slate-300 font-black uppercase tracking-[0.2em]">Chưa có giao dịch nào</td></tr>
                      ) : (
                        transactions.map((tx) => (
                          <tr key={tx.id} className="group hover:bg-slate-50/50 transition-all duration-300">
                            <td className="px-10 py-6">
                              <div className="text-base font-black text-slate-900 tracking-tight leading-none mb-1">{format(new Date(tx.created_at), 'HH:mm')}</div>
                              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{format(new Date(tx.created_at), 'dd/MM/yyyy')}</div>
                            </td>
                            <td className="px-10 py-6">
                              <span className={cn(
                                "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                tx.type === 'payment' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                tx.type === 'charge' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                tx.type === 'refund' ? "bg-blue-50 text-blue-600 border-blue-100" :
                                "bg-slate-50 text-slate-600 border-slate-100"
                              )}>
                                {getTypeLabel(tx.type)}
                              </span>
                            </td>
                            <td className="px-10 py-6 text-base font-bold text-slate-500 max-w-[300px] truncate group-hover:text-slate-900 transition-colors">
                              {tx.description || '---'}
                            </td>
                            <td className="px-10 py-6 text-right">
                              <div className={cn(
                                "font-black text-xl md:text-2xl tracking-tighter flex items-center justify-end gap-1.5",
                                tx.amount > 0 ? "text-emerald-600" : "text-rose-600"
                              )}>
                                {tx.amount > 0 ? '+' : '-'}{formatMoney(Math.abs(tx.amount))}
                              </div>
                              <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-1">Số dư: {formatMoney(tx.balance_after)}</div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            
            {activeTab === 'bookings' && (
              <div className="overflow-x-auto">
                {isMobile ? (
                  <div className="divide-y divide-slate-100">
                    {bookings.length === 0 ? (
                      <div className="py-20 text-center text-slate-300 font-black uppercase tracking-[0.2em]">Chưa có lịch sử thuê phòng</div>
                    ) : (
                      bookings.map((bk) => (
                        <div key={bk.id} className="p-6 space-y-4 active:bg-slate-50 transition-colors" onClick={() => router.push(`/${slug}/bookings/${bk.id}`)}>
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <div className="font-black text-lg text-slate-900 tracking-tight">Phòng {bk.room?.room_number || '---'}</div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {bk.rental_type === 'hourly' ? 'Theo giờ' : bk.rental_type === 'daily' ? 'Theo ngày' : 'Qua đêm'}
                              </div>
                            </div>
                            <span className={cn(
                              "inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                              bk.status === 'checked_in' ? "bg-blue-50 text-blue-600 border border-blue-100" :
                              bk.status === 'checked_out' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                              "bg-slate-50 text-slate-600 border border-slate-100"
                            )}>
                              {bk.status === 'checked_in' ? 'Đang ở' : bk.status === 'checked_out' ? 'Hoàn tất' : bk.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Thời gian đến</p>
                              <p className="text-xs font-bold text-slate-600">{bk.check_in_actual ? format(new Date(bk.check_in_actual), 'HH:mm • dd/MM') : '---'}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Thời gian đi</p>
                              <p className="text-xs font-bold text-slate-600">{bk.check_out_actual ? format(new Date(bk.check_out_actual), 'HH:mm • dd/MM') : 'Đang ở'}</p>
                            </div>
                          </div>

                          <div className="flex justify-end pt-2">
                            <div className="font-black text-2xl tracking-tighter text-slate-900">
                              {bk.total_amount ? formatMoney(bk.total_amount) : '---'}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-10 py-8 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Phòng</th>
                        <th className="px-10 py-8 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Thời gian đến</th>
                        <th className="px-10 py-8 text-left text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Thời gian đi</th>
                        <th className="px-10 py-8 text-center text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Trạng thái</th>
                        <th className="px-10 py-8 text-right text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Tổng hóa đơn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {bookings.length === 0 ? (
                        <tr><td colSpan={5} className="py-32 text-center text-slate-300 font-black uppercase tracking-[0.2em]">Chưa có lịch sử thuê phòng</td></tr>
                      ) : (
                        bookings.map((bk) => (
                          <tr key={bk.id} className="group hover:bg-slate-50/50 transition-all duration-300 cursor-pointer" onClick={() => router.push(`/${slug}/bookings/${bk.id}`)}>
                            <td className="px-10 py-6">
                              <div className="font-black text-lg text-slate-900 tracking-tight">Phòng {bk.room?.room_number || '---'}</div>
                              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                                {bk.rental_type === 'hourly' ? 'Theo giờ' : bk.rental_type === 'daily' ? 'Theo ngày' : 'Qua đêm'}
                              </div>
                            </td>
                            <td className="px-10 py-6 text-sm font-bold text-slate-600">
                              {bk.check_in_actual ? format(new Date(bk.check_in_actual), 'HH:mm • dd/MM') : '---'}
                            </td>
                            <td className="px-10 py-6 text-sm font-bold text-slate-600">
                              {bk.check_out_actual ? format(new Date(bk.check_out_actual), 'HH:mm • dd/MM') : 'Đang ở'}
                            </td>
                            <td className="px-10 py-6 text-center">
                              <span className={cn(
                                "inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                                bk.status === 'checked_in' ? "bg-blue-50 text-blue-600 border border-blue-100" :
                                bk.status === 'checked_out' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                "bg-slate-50 text-slate-600 border border-slate-100"
                              )}>
                                {bk.status === 'checked_in' ? 'Đang ở' : bk.status === 'checked_out' ? 'Hoàn tất' : bk.status}
                              </span>
                            </td>
                            <td className="px-10 py-6 text-right">
                              <div className="font-black text-xl md:text-2xl tracking-tighter text-slate-900">
                                {bk.total_amount ? formatMoney(bk.total_amount) : '---'}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* 4. MODALS (APPLE STYLE REDESIGN) */}
      
      {/* Transaction Modal */}
      {showTransModal && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[40px] md:rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden border border-white animate-in slide-in-from-bottom duration-500">
            <div className="p-8 md:p-10 flex justify-between items-center bg-slate-50/50 border-b border-slate-100">
              <div className="space-y-1">
                <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Giao dịch ví</h3>
                <p className="text-sm font-bold text-slate-400">Điều chỉnh số dư hoặc nạp tiền</p>
              </div>
              <button onClick={() => setShowTransModal(false)} className="w-12 h-12 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full text-slate-400 border border-slate-100 shadow-sm transition-all">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 md:p-10 space-y-8">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'payment', label: 'Nạp / Trả nợ', color: 'emerald' },
                  { id: 'charge', label: 'Ghi nợ / Phí', color: 'rose' }
                ].map((type) => (
                  <button 
                    key={type.id}
                    onClick={() => setTransForm({...transForm, type: type.id as any})}
                    className={cn(
                      "py-4 rounded-2xl font-black text-[13px] uppercase tracking-widest border-2 transition-all",
                      transForm.type === type.id 
                        ? (type.id === 'payment' ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-lg shadow-emerald-100" : "border-rose-500 bg-rose-50 text-rose-700 shadow-lg shadow-rose-100") 
                        : "border-transparent bg-slate-50 text-slate-400 hover:bg-slate-100"
                    )}
                  >
                    {type.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Số tiền giao dịch</label>
                <div className="relative">
                  <input 
                    type="text" 
                    className="w-full px-6 py-6 md:py-8 bg-slate-50 rounded-[32px] outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-black text-4xl md:text-5xl text-slate-900 text-right pr-12"
                    placeholder="0"
                    value={transForm.amount ? new Intl.NumberFormat('vi-VN').format(Number(transForm.amount.replace(/[^0-9]/g, ''))) : ''}
                    onChange={e => setTransForm({...transForm, amount: e.target.value.replace(/[^0-9]/g, '')})}
                  />
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-200">₫</span>
                </div>
              </div>

              {transForm.type !== 'charge' && (
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Hình thức</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setTransForm({...transForm, payment_method: 'cash'})}
                      className={cn(
                        "py-3 rounded-xl border font-bold text-sm flex items-center justify-center gap-2 transition-all",
                        transForm.payment_method === 'cash' ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-400 border-slate-200"
                      )}
                    >
                      <Banknote size={18} /> Tiền mặt
                    </button>
                    <button
                      onClick={() => setTransForm({...transForm, payment_method: 'bank'})}
                      className={cn(
                        "py-3 rounded-xl border font-bold text-sm flex items-center justify-center gap-2 transition-all",
                        transForm.payment_method === 'bank' ? "bg-slate-900 text-white shadow-md" : "bg-white text-slate-400 border-slate-200"
                      )}
                    >
                      <CreditCard size={18} /> Chuyển khoản
                    </button>
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Ghi chú</label>
                <textarea 
                  className="w-full px-6 py-5 bg-slate-50 rounded-[24px] outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-medium text-slate-600 resize-none h-24"
                  placeholder="Nhập nội dung giao dịch..."
                  value={transForm.description}
                  onChange={e => setTransForm({...transForm, description: e.target.value})}
                />
              </div>
            </div>

            <div className="p-8 md:p-10 bg-slate-50/50 border-t border-slate-100 flex gap-4 md:gap-6">
              <button 
                onClick={() => handleTransaction()}
                className="w-full py-5 bg-slate-900 text-white rounded-full font-black uppercase tracking-widest text-[13px] shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all"
              >
                Xác nhận giao dịch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[40px] md:rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border border-white animate-in slide-in-from-bottom duration-500">
            <div className="p-8 md:p-10 flex justify-between items-center bg-slate-50/50 border-b border-slate-100">
              <div className="space-y-1">
                <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Sửa hồ sơ</h3>
                <p className="text-sm font-bold text-slate-400">Cập nhật thông tin khách hàng</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="w-12 h-12 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full text-slate-400 border border-slate-100 shadow-sm transition-all">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 md:p-10 space-y-6 max-h-[60vh] overflow-y-auto no-scrollbar">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Họ và tên *</label>
                <input 
                  type="text" 
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-black text-lg text-slate-900"
                  value={editForm.full_name}
                  onChange={e => setEditForm({...editForm, full_name: e.target.value})}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Số điện thoại</label>
                  <input 
                    type="text" 
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-bold text-slate-700"
                    value={editForm.phone}
                    onChange={e => setEditForm({...editForm, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">CMND / CCCD</label>
                  <input 
                    type="text" 
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-bold text-slate-700"
                    value={editForm.id_card}
                    onChange={e => setEditForm({...editForm, id_card: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Email liên hệ</label>
                <input 
                  type="email" 
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-bold text-slate-700"
                  value={editForm.email}
                  onChange={e => setEditForm({...editForm, email: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Địa chỉ</label>
                <input 
                  type="text" 
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-bold text-slate-700"
                  value={editForm.address}
                  onChange={e => setEditForm({...editForm, address: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Ghi chú đặc biệt</label>
                <textarea 
                  className="w-full px-6 py-5 bg-slate-50 rounded-[24px] outline-none focus:ring-4 focus:ring-slate-900/5 focus:bg-white focus:border-slate-900 border border-transparent transition-all font-medium text-slate-600 resize-none h-24"
                  value={editForm.notes}
                  onChange={e => setEditForm({...editForm, notes: e.target.value})}
                />
              </div>
            </div>

            <div className="p-8 md:p-10 bg-slate-50/50 border-t border-slate-100 flex gap-4 md:gap-6">
              <button 
                onClick={handleUpdate}
                className="w-full py-5 bg-slate-900 text-white rounded-full font-black uppercase tracking-widest text-[13px] shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all"
              >
                Lưu hồ sơ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security Modals */}
      {SecurityModals}
    </div>
  );
}
