'use client';

import React, { useEffect, useState } from 'react';
import { 
  X, 
  Search, 
  ArrowUpRight, 
  Calendar, 
  User, 
  Home, 
  Clock,
  Wallet,
  TrendingUp,
  RefreshCw,
  PlusCircle,
  MinusCircle,
  LogOut,
  LogIn
} from 'lucide-react';
import { cashFlowService } from '@/services/cashFlowService';
import { formatMoney } from '@/lib/utils';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

import { useAuth } from '@/providers/AuthProvider';

interface ReceivableDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ReceivableDetailModal({ isOpen, onClose }: ReceivableDetailModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const data = await cashFlowService.getExpectedRevenueDetails(user?.hotel_id);
      setEntries(data);
    } catch (error) {
      console.error('Error fetching expected revenue details:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDetails();
    }
  }, [isOpen]);

  const filteredEntries = entries.filter(item => 
    item.bookings?.rooms?.room_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.bookings?.customers?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalExpected = entries.reduce((sum, item) => sum + Number(item.amount), 0);

  const getEventIcon = (eventType: string, amount: number) => {
    if (amount > 0) {
      if (eventType.includes('checkin')) return <LogIn size={16} className="text-emerald-500" />;
      return <PlusCircle size={16} className="text-emerald-500" />;
    }
    if (eventType.includes('checkout')) return <LogOut size={16} className="text-rose-500" />;
    return <MinusCircle size={16} className="text-rose-500" />;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl bg-white rounded-[32px] md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-300">
        
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="space-y-1">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
              CHI TIẾT DỰ THU
            </h2>
            <p className="hidden md:block text-sm font-bold text-slate-500 uppercase tracking-wide">
              Nhật ký biến động doanh thu dự kiến (Reset sau Night Audit)
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600 border border-transparent hover:border-slate-200"
          >
            <X size={24} />
          </button>
        </div>

        {/* Stats Bar */}
        <div className="px-6 md:px-8 py-4 bg-emerald-50/50 border-b border-emerald-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600">
              <Wallet size={24} />
            </div>
            <div>
              <span className="block text-[10px] font-black text-emerald-600/70 uppercase tracking-widest">TỔNG DỰ THU (HÔM NAY)</span>
              <span className="text-2xl font-black text-emerald-700 tracking-tighter">
                {formatMoney(totalExpected)}
              </span>
            </div>
          </div>

          <button 
            onClick={fetchDetails}
            disabled={loading}
            className="p-3 hover:bg-emerald-100 rounded-2xl transition-colors text-emerald-600 disabled:opacity-50"
          >
            <RefreshCw size={20} className={cn(loading && "animate-spin")} />
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/30">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Đang tải nhật ký dự thu...</p>
            </div>
          ) : filteredEntries.length > 0 ? (
            <div className="space-y-3">
              {filteredEntries.map((item) => (
                <div 
                  key={item.id}
                  className="bg-white border border-slate-100 rounded-2xl p-4 md:p-5 flex items-center justify-between gap-4 hover:shadow-md transition-shadow"
                >
                  {/* Desktop Only Icon */}
                  <div className={cn(
                    "hidden md:flex w-10 h-10 rounded-xl items-center justify-center",
                    Number(item.amount) > 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  )}>
                    {getEventIcon(item.event_type || '', Number(item.amount))}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                      <div className="flex items-center">
                        {/* Hiển thị Badge: Nền tối, ưu tiên dữ liệu JOIN, Fallback bằng cách tách từ description */}
                        {item.bookings?.rooms?.room_number ? (
                          <span className="px-2.5 py-1 bg-slate-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm ring-1 ring-white/10">
                            P.{item.bookings.rooms.room_number}
                          </span>
                        ) : item.description?.match(/P\.\w+/i) ? (
                          <span className="px-2.5 py-1 bg-slate-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm ring-1 ring-white/10">
                            {item.description.match(/P\.\w+/i)[0].toUpperCase()}
                          </span>
                        ) : null}
                      </div>
                      
                      <span className="text-sm font-black text-slate-800">
                        {/* Clean up description to avoid double room numbers */}
                        {item.description?.replace(/^P\.\w+\s+/, '')}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className={cn(
                      "text-lg font-black tracking-tight whitespace-nowrap",
                      Number(item.amount) > 0 ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {Number(item.amount) > 0 ? '+' : ''}{formatMoney(item.amount)}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                      {format(new Date(item.created_at), 'HH:mm - dd/MM')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center gap-4 text-slate-400">
              <div className="p-6 bg-slate-50 rounded-full">
                <Search size={48} strokeWidth={1} />
              </div>
              <p className="text-sm font-black uppercase tracking-widest">Không có biến động dự thu nào trong hôm nay</p>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="p-6 md:p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
           <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
             <Clock size={14} />
             Dữ liệu tự động Reset sau mốc Night Audit
           </div>
           <button 
             onClick={onClose}
             className="px-8 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-black text-slate-600 hover:bg-slate-100 transition-all shadow-sm"
           >
             ĐÓNG
           </button>
        </div>
      </div>
    </div>
  );
}
