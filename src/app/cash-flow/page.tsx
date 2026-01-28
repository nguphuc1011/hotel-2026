'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Filter, Calendar as CalendarIcon, ArrowUpRight, ArrowDownRight, Trash2, Eye, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { cashFlowService, CashFlowTransaction, CashFlowStats, Wallet } from '@/services/cashFlowService';
import TransactionModal from './components/TransactionModal';
import WalletCards from './components/WalletCards';
import OwnerDebtSection from './components/OwnerDebtSection';
import BookingHistoryModal from './components/BookingHistoryModal';
import CashFlowStatsComponent from './components/CashFlowStats';
import { toLocalISOString, parseLocalISO, getEndOfDay } from '@/lib/dateUtils';
import { formatMoney } from '@/utils/format';

export default function CashFlowPage() {
  const [transactions, setTransactions] = useState<CashFlowTransaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [historyModal, setHistoryModal] = useState<{ open: boolean; bookingId: string | null }>({
    open: false,
    bookingId: null
  });
  
  // Filter state
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Đầu tháng
    end: new Date(new Date().setHours(23, 59, 59, 999)) // Cuối ngày hôm nay
  });
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [paymentMethod, setPaymentMethod] = useState<'ALL' | 'cash' | 'transfer' | 'credit_card'>('ALL');

  const fetchData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      // Fetch Wallets
      const walletsData = await cashFlowService.getWallets();
      setWallets(walletsData);

      // Fetch List
      const { data } = await cashFlowService.getTransactions(1, 100, {
        startDate: dateRange.start,
        endDate: dateRange.end,
        type: typeFilter === 'ALL' ? undefined : typeFilter,
        paymentMethod: paymentMethod === 'ALL' ? undefined : paymentMethod,
      });
      setTransactions(data);
    } catch (error) {
      console.error(error);
      if (!isBackground) toast.error('Không thể tải dữ liệu thu chi');
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Subscribe to Realtime changes
    const channel = supabase
      .channel('cash-flow-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_flow' },
        (payload) => {
          console.log('Realtime update:', payload);
          fetchData(true);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wallets' },
        (payload) => {
           // Wallet balance update
           fetchData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateRange, typeFilter, paymentMethod]);

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa giao dịch này?')) return;
    try {
      await cashFlowService.deleteTransaction(id);
      toast.success('Đã xóa giao dịch');
      fetchData();
    } catch (error) {
      toast.error('Không thể xóa giao dịch (Có thể là giao dịch tự động)');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-system p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-main tracking-tight">Quản Lý Thu Chi</h1>
          <p className="text-text-muted mt-1">Theo dõi dòng tiền và sức khỏe tài chính hệ thống</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-900/40 flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus size={20} />
          Tạo Phiếu Mới
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
          <CalendarIcon size={16} />
          <span className="text-sm font-medium">Kỳ báo cáo:</span>
        </div>
        
        <input 
          type="date" 
          value={toLocalISOString(dateRange.start)}
          onChange={(e) => setDateRange(prev => ({ ...prev, start: parseLocalISO(e.target.value) }))}
          className="bg-white border border-gray-200 text-gray-900 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <span className="text-gray-400">-</span>
        <input 
          type="date" 
          value={toLocalISOString(dateRange.end)}
          onChange={(e) => {
            const date = parseLocalISO(e.target.value);
            // End of day
            const endOfDay = getEndOfDay(date);
            setDateRange(prev => ({ ...prev, end: endOfDay }));
          }}
          className="bg-white border border-gray-200 text-gray-900 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />

        <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block" />

        <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-200">
            <button 
                onClick={() => setTypeFilter('ALL')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${typeFilter === 'ALL' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
                Tất cả
            </button>
            <button 
                onClick={() => setTypeFilter('IN')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${typeFilter === 'IN' ? 'bg-green-50 text-green-700 shadow-sm' : 'text-gray-500 hover:text-green-700'}`}
            >
                Thu
            </button>
            <button 
                onClick={() => setTypeFilter('OUT')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${typeFilter === 'OUT' ? 'bg-red-50 text-red-700 shadow-sm' : 'text-gray-500 hover:text-red-700'}`}
            >
                Chi
            </button>
        </div>

        <div className="h-6 w-px bg-gray-200 mx-2 hidden md:block" />

        <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as any)}
            className="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 outline-none h-[38px]"
        >
            <option value="ALL">Tất cả HTTT</option>
            <option value="cash">Tiền mặt</option>
            <option value="transfer">Chuyển khoản</option>
            <option value="credit_card">Thẻ tín dụng</option>
        </select>
      </div>

      <WalletCards 
        wallets={wallets} 
        loading={loading} 
        selectedWalletId={selectedWalletId}
        onSelectWallet={(id) => {
          setSelectedWalletId(id);
          if (id) {
            setPaymentMethod('ALL');
            setTypeFilter('ALL');
          }
        }}
      />

      <OwnerDebtSection onUpdate={fetchData} />

      {/* Transaction List */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-2">
            <h3 className="text-lg font-bold text-gray-900">Lịch sử giao dịch</h3>
            <span className="text-sm text-gray-500">{transactions.length} bản ghi</span>
        </div>
        
        <div className="space-y-3">
          {loading ? (
            <div className="p-8 text-center text-gray-500 bg-white rounded-xl border border-gray-100">Đang tải dữ liệu...</div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center text-gray-500 bg-white rounded-xl border border-gray-100">Chưa có giao dịch nào trong khoảng thời gian này.</div>
          ) : (
            transactions.map((tx) => {
              const dateObj = new Date(tx.occurred_at);
              const timeStr = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
              const dateStr = dateObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
              
              // Viết tắt thông minh (Điều 6)
              const smartDescription = (tx.description || tx.category || '')
                .replace(/Phòng/g, 'P')
                .replace(/Dịch vụ/g, 'DV');

              return (
                <div 
                  key={tx.id} 
                  onClick={() => tx.ref_id && (tx.category === 'Tiền phòng' || tx.category === 'ROOM') && setHistoryModal({ open: true, bookingId: tx.ref_id })}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm hover:border-purple-200 transition-all group cursor-pointer overflow-hidden flex items-center h-[72px]"
                >
                  {/* Cột Chỉ số Thời gian (Side-Badge Time Capsule) */}
                  <div className="flex items-center h-full">
                    <div className={`w-[18px] h-full flex flex-col items-center justify-center text-white ${
                      tx.flow_type === 'OUT' ? 'bg-rose-500' :
                      tx.payment_method_code === 'credit' ? 'bg-blue-500' : 
                      'bg-emerald-500'
                    }`}>
                      {tx.flow_type === 'IN' ? <ArrowUp size={14} strokeWidth={3} /> : <ArrowDown size={14} strokeWidth={3} />}
                    </div>
                    <div className="px-3 flex flex-col justify-center min-w-[70px] border-r border-gray-50 h-full bg-gray-50/50">
                      <span className="text-[13px] font-black text-black leading-none mb-1">{timeStr}</span>
                      <span className="text-[9px] font-bold text-gray-400 leading-none">{dateStr}</span>
                    </div>
                  </div>

                  {/* Nội dung Giao dịch (Content Info) */}
                  <div className="flex-1 px-4 min-w-0">
                    <p className="text-[13px] font-bold text-slate-700 line-clamp-1">
                      {smartDescription}
                    </p>
                    {tx.is_auto && (
                      <span className="text-[8px] font-black bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded uppercase tracking-tighter border border-blue-100 w-fit mt-1 block">
                        Hệ thống
                      </span>
                    )}
                  </div>

                  {/* Con số Tài chính & Huy hiệu Phương thức (Amount & Method) */}
                  <div className="px-4 text-right flex flex-col justify-center">
                    <div className="relative inline-block">
                      <span className={`text-[16px] font-black tracking-tighter leading-none ${
                        tx.flow_type === 'OUT' ? 'text-rose-500' :
                        tx.payment_method_code === 'credit' ? 'text-blue-500' : 
                        'text-emerald-500'
                      }`}>
                        {tx.flow_type === 'IN' ? '+' : '-'}{formatMoney(tx.amount).replace('₫', '').trim()}
                      </span>
                      {/* Huy hiệu Phương thức (Superscript Badge) */}
                      {tx.payment_method_code && (
                        <span className={`absolute -top-3 -right-2 text-[6px] font-black px-1 py-0.5 rounded shadow-sm uppercase ${
                          tx.payment_method_code.toLowerCase() === 'credit'
                            ? 'bg-blue-100 text-blue-700 border border-blue-200'
                            : (tx.payment_method_code.toLowerCase() === 'cash' || tx.payment_method_code.toLowerCase() === 'tm') 
                            ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                            : 'bg-purple-100 text-purple-700 border border-purple-200'
                        }`}>
                          {tx.payment_method_code.toLowerCase() === 'credit' ? 'NỢ' :
                           (tx.payment_method_code.toLowerCase() === 'cash' || tx.payment_method_code.toLowerCase() === 'tm') ? 'TM' : 'CK'}
                        </span>
                      )}
                    </div>
                    <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest mt-1">
                      {tx.verified_by_staff_name || 'SYSTEM'}
                    </span>
                  </div>

                  {/* Chỉ báo Chi tiết (Detail Indicator) */}
                  <div className="pr-3 pl-1">
                    <ChevronRight size={18} className="text-slate-200 group-hover:text-purple-400 transition-colors" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <TransactionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchData} 
      />

      {historyModal.bookingId && (
        <BookingHistoryModal
          isOpen={historyModal.open}
          onClose={() => setHistoryModal({ open: false, bookingId: null })}
          bookingId={historyModal.bookingId}
        />
      )}
    </div>
  );
}
