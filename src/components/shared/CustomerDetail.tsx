"use client";

import { HotelService } from '@/services/hotel';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Customer, Booking, LedgerEntry } from '@/types';
import { 
  X, 
  History, 
  DollarSign, 
  Calendar, 
  MapPin, 
  Phone, 
  CreditCard,
  User,
  Star,
  ArrowRight,
  TrendingUp,
  Clock
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { useCustomerBalance } from '@/hooks/useCustomerBalance';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { NumericInput } from '@/components/ui/NumericInput';
import { toast } from 'sonner';

interface CustomerDetailProps {
  customerId: string;
  onClose: () => void;
}

export default function CustomerDetail({ customerId, onClose }: CustomerDetailProps) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'payments'>('history');

  // Debt Collection State
  const [isCollectDebtOpen, setIsCollectDebtOpen] = useState(false);
  const [collectAmount, setCollectAmount] = useState(0);
  const [isSubmittingDebt, setIsSubmittingDebt] = useState(false);

  // Balance Info - Moved to top level to avoid conditional hook call
  const { colorClass, absFormattedBalance, isDebt, isCredit } = useCustomerBalance(customer?.balance || 0);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch customer info
        const { data: custData } = await supabase
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .single();
        
        if (custData) setCustomer(custData);

        // Fetch booking history
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('*, rooms(room_number)')
          .eq('customer_id', customerId)
          .order('check_in_at', { ascending: false });
        
        if (bookingData) setBookings(bookingData);

        // Fetch payment history (ledger)
        const { data: ledgerData } = await supabase
          .from('ledger')
          .select('*')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false });
        
        if (ledgerData) setLedgerEntries(ledgerData);

      } catch (error) {
        console.error('Error fetching customer details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [customerId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!customer) return null;

  // Calculate some stats
  const totalVisits = customer.visit_count || bookings.length;
  const lastVisit = bookings[0]?.check_in_at ? format(new Date(bookings[0].check_in_at), 'dd/MM/yyyy', { locale: vi }) : 'Chưa có';
  
  const handleCollectDebt = async () => {
    if (!customer || collectAmount <= 0) {
      toast.error('Vui lòng nhập số tiền hợp lệ');
      return;
    }

    setIsSubmittingDebt(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Use Atomic RPC for debt collection
      await HotelService.payDebt({
        customerId: customer.id,
        amount: collectAmount,
        method: 'CASH',
        cashier: user?.id || 'unknown',
        note: 'Thu nợ khách hàng (Thanh toán rời)'
      });

      toast.success(`Đã thu nợ ${formatCurrency(collectAmount)} thành công!`);
      
      // 3. Refresh Data
      const { data: updatedCust } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();
        
      if (updatedCust) setCustomer(updatedCust);

      // Refresh ledger
      const { data: updatedLedger } = await supabase
        .from('ledger')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
        
      if (updatedLedger) setLedgerEntries(updatedLedger);

      setIsCollectDebtOpen(false);
      setCollectAmount(0);

    } catch (error) {
      console.error('Error collecting debt:', error);
      toast.error('Có lỗi xảy ra khi thu nợ');
    } finally {
      setIsSubmittingDebt(false);
    }
  };

  // Determine Rank
  const getRank = () => {
    if (customer.total_spent > 10000000 || totalVisits > 20) return { label: 'VIP', color: 'bg-purple-100 text-purple-700 border-purple-200' };
    if (customer.total_spent > 5000000 || totalVisits > 10) return { label: 'Thân thiết', color: 'bg-blue-100 text-blue-700 border-blue-200' };
    if (totalVisits > 2) return { label: 'Quen', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    return { label: 'Khách mới', color: 'bg-slate-100 text-slate-600 border-slate-200' };
  };

  const rank = getRank();

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header Profile */}
      <div className="bg-white p-6 pt-8 rounded-b-[3rem] shadow-sm">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400">
              <User size={40} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-black text-slate-800">{customer.full_name}</h2>
                <span className={cn("px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border", rank.color)}>
                  {rank.label}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-400">
                  <Phone size={14} /> {customer.phone || 'Chưa cập nhật'}
                </div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-400">
                  <CreditCard size={14} /> {customer.id_card || 'Chưa cập nhật'}
                </div>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-3 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
            <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Lượt đến</div>
            <div className="text-lg font-black text-slate-700">{totalVisits}</div>
          </div>
          <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
            <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Chi tiêu</div>
            <div className="text-lg font-black text-emerald-600">{formatCurrency(customer.total_spent)}</div>
          </div>
          <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 relative group">
            <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Công nợ</div>
            <div className={cn("text-lg font-black", colorClass)}>
              {absFormattedBalance}
              {isDebt ? " (Nợ)" : isCredit ? " (Dư)" : ""}
            </div>
            
            {/* Quick Action Button for Debt */}
            {isDebt && (
              <button
                onClick={() => setIsCollectDebtOpen(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white p-2 rounded-xl transition-all shadow-sm active:scale-95"
                title="Thu nợ nhanh"
              >
                <DollarSign size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Collect Debt Modal */}
      <AnimatePresence>
        {isCollectDebtOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Thu nợ khách hàng</h3>
                  <button 
                    onClick={() => setIsCollectDebtOpen(false)}
                    className="p-2 rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 text-center">
                    <span className="text-xs font-bold text-slate-400 uppercase block mb-1">Nợ hiện tại</span>
                    <span className="text-2xl font-black text-rose-600">{absFormattedBalance}</span>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Số tiền khách trả</label>
                    <NumericInput
                      value={collectAmount}
                      onChange={setCollectAmount}
                      placeholder="Nhập số tiền..."
                      className="text-lg bg-slate-50"
                      autoFocus
                    />
                  </div>

                  <button
                    onClick={handleCollectDebt}
                    disabled={isSubmittingDebt || collectAmount <= 0}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-lg shadow-blue-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmittingDebt ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <DollarSign size={20} />
                        XÁC NHẬN THU NỢ
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex gap-2 p-4 pb-0">
        <button 
          onClick={() => setActiveTab('history')}
          className={cn(
            "flex-1 py-4 rounded-t-3xl font-black text-xs uppercase tracking-widest transition-all",
            activeTab === 'history' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
          )}
        >
          Lịch sử ở
        </button>
        <button 
          onClick={() => setActiveTab('payments')}
          className={cn(
            "flex-1 py-4 rounded-t-3xl font-black text-xs uppercase tracking-widest transition-all",
            activeTab === 'payments' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
          )}
        >
          Lịch sử tiền
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 bg-white mx-4 mb-4 rounded-b-3xl shadow-sm">
        {activeTab === 'history' ? (
          <div className="space-y-4">
            {bookings.length > 0 ? bookings.map((booking: any) => (
              <div key={booking.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-black text-xs">
                      {booking.rooms?.room_number}
                    </div>
                    <span className="text-sm font-black text-slate-700 capitalize">{booking.rental_type === 'hourly' ? 'Theo giờ' : booking.rental_type === 'daily' ? 'Theo ngày' : 'Qua đêm'}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    {format(new Date(booking.check_in_at), 'dd/MM/yyyy', { locale: vi })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-xs font-bold text-slate-500">
                    <Clock size={12} />
                    {format(new Date(booking.check_in_at), 'HH:mm')} - {booking.check_out_at ? format(new Date(booking.check_out_at), 'HH:mm') : '...'}
                  </div>
                  <div className="text-sm font-black text-slate-800">{formatCurrency(booking.final_amount || booking.total_amount || 0)}</div>
                </div>
              </div>
            )) : (
              <div className="text-center py-10 text-slate-400 font-bold">Chưa có lịch sử ở</div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {ledgerEntries.length > 0 ? ledgerEntries.map((entry) => {
              const isPositive = entry.type === 'PAYMENT' || entry.type === 'DEPOSIT' || (entry.type === 'DEBT_ADJUSTMENT' && entry.meta?.direction === 'plus');
              return (
                <div key={entry.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "h-8 w-8 rounded-xl flex items-center justify-center",
                        isPositive ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                      )}>
                        <DollarSign size={16} />
                      </div>
                      <span className="text-sm font-black text-slate-700">
                        {entry.type === 'REVENUE' ? (entry.category === 'ROOM' ? 'Tiền phòng' : entry.category === 'SERVICE' ? 'Tiền dịch vụ' : 'Phí phát sinh') : 
                         entry.type === 'PAYMENT' ? (entry.category === 'DEBT_COLLECTION' ? 'Thu nợ' : 'Thanh toán') :
                         entry.type === 'DEPOSIT' ? 'Tiền cọc' :
                         entry.type === 'REFUND' ? 'Hoàn tiền' : 
                         entry.type === 'DEBT_ADJUSTMENT' ? 'Điều chỉnh nợ' : 'Giao dịch'}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-400">
                      {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">{entry.description || 'Không có mô tả'}</span>
                    <div className={cn(
                      "text-sm font-black",
                      isPositive ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {isPositive ? '+' : '-'}{formatCurrency(entry.amount)}
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="text-center py-10 text-slate-400 font-bold">Chưa có lịch sử giao dịch</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
