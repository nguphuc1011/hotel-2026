'use client';

import React, { useEffect, useState } from 'react';
import { 
  X, 
  Receipt, 
  Calendar, 
  User, 
  Home, 
  Clock,
  ChevronDown,
  ChevronUp,
  Package,
  FileText
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { bookingService, BookingBill } from '@/services/bookingService';
import { cn } from '@/lib/utils';
import BillBreakdown from '@/components/dashboard/BillBreakdown';
import { format } from 'date-fns';

interface BookingHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
}

export default function BookingHistoryModal({ isOpen, onClose, bookingId }: BookingHistoryModalProps) {
  const [bill, setBill] = useState<BookingBill | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [bookingServices, setBookingServices] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && bookingId) {
      fetchBookingDetails();
    }
  }, [isOpen, bookingId]);

  const fetchBookingDetails = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Bill using existing RPC
      const billData = await bookingService.calculateBill(bookingId);
      setBill(billData);

      // 2. Fetch Booking Services for detail list
      const { data: servicesData } = await supabase
        .from('booking_services')
        .select(`
          *,
          service:services(*)
        `)
        .eq('booking_id', bookingId);
      
      setBookingServices(servicesData || []);
    } catch (error) {
      console.error('Error fetching booking history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Receipt size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tight">Chi tiết hóa đơn</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mã: {bookingId.slice(0, 8)}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Đang tải dữ liệu...</p>
            </div>
          ) : bill ? (
            <>
              {/* Quick Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Home size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Phòng</span>
                  </div>
                  <div className="text-xl font-black text-slate-800">{bill.room_number}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <User size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Khách hàng</span>
                  </div>
                  <div className="text-xl font-black text-slate-800 truncate">{bill.customer_name}</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Calendar size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Vào lúc</span>
                  </div>
                  <div className="text-sm font-bold text-slate-700">
                    {format(new Date(bill.check_in_at), 'HH:mm - dd/MM/yyyy')}
                  </div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Clock size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Ra lúc</span>
                  </div>
                  <div className="text-sm font-bold text-slate-700">
                    {format(new Date(bill.check_out_at), 'HH:mm - dd/MM/yyyy')}
                  </div>
                </div>
              </div>

              {/* Bill Summary Card (Like RoomFolio) */}
              <div 
                onClick={() => setShowDetails(!showDetails)}
                className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white shadow-lg shadow-blue-900/20 cursor-pointer"
              >
                <div className="relative z-10">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-100">Tổng thanh toán</span>
                    <div className="w-8 h-8 flex items-center justify-center bg-white/20 rounded-full">
                      {showDetails ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>
                  <div className="text-4xl font-black tracking-tighter mb-2">
                    {bill.final_amount.toLocaleString()}đ
                  </div>
                  
                  {showDetails && (
                    <div className="mt-6 pt-6 border-t border-white/20 animate-in slide-in-from-top-2 duration-300">
                      <BillBreakdown bill={bill} isDark={true} />
                    </div>
                  )}
                </div>
              </div>

              {/* Services List */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Package size={16} className="text-slate-400" />
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dịch vụ đã sử dụng</h4>
                </div>
                
                <div className="bg-white rounded-[24px] border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {bookingServices.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 italic text-sm">Không có dịch vụ nào</div>
                  ) : (
                    bookingServices.map((item, idx) => (
                      <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                            {item.quantity}x
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{item.service?.name}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              {item.price_at_time.toLocaleString()}đ
                            </div>
                          </div>
                        </div>
                        <div className="font-black text-slate-700 text-lg">
                          {(item.quantity * item.price_at_time).toLocaleString()}đ
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Audit/Notes if any */}
              {bill.explanation && bill.explanation.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <FileText size={16} className="text-slate-400" />
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ghi chú tính tiền</h4>
                  </div>
                  <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 space-y-2">
                    {bill.explanation.map((line, idx) => (
                      <div key={idx} className="text-xs font-bold text-amber-800 flex gap-2">
                        <span className="opacity-40">•</span>
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
              <Receipt size={48} className="opacity-10" />
              <p className="font-bold">Không tìm thấy dữ liệu hóa đơn</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl font-black uppercase tracking-widest transition-all"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
