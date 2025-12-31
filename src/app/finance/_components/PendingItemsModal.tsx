'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  X, 
  Search, 
  Loader2, 
  Package, 
  Clock,
  Home,
  AlertCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface PendingService {
  room_number: string;
  booking_id: string;
  check_in_at: string;
  service_name: string;
  quantity: number;
  price: number;
  total_amount: number;
}

interface PendingItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PendingItemsModal({ isOpen, onClose }: PendingItemsModalProps) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PendingService[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchPendingItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('view_pending_services')
        .select('*')
        .order('room_number');

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error fetching pending items:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPendingItems();

      // Subscribe to real-time changes on bookings
      const channel = supabase
        .channel('finance-pending-items-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings' },
          () => {
            fetchPendingItems();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [isOpen]);

  const filteredItems = items.filter(item => 
    item.room_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.service_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPending = items.reduce((sum, item) => sum + item.total_amount, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-3xl border-none shadow-2xl bg-slate-50">
        <DialogHeader className="p-8 bg-white border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                  <Clock size={24} />
                </div>
                Hàng Đang Treo (Pending Items)
              </DialogTitle>
              <p className="text-slate-500 font-bold text-sm mt-1 tracking-wide uppercase">
                Danh sách dịch vụ đã dùng nhưng chưa thanh toán
              </p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
            >
              <X size={24} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tổng giá trị treo</p>
              <p className="text-2xl font-black text-slate-900">{totalPending.toLocaleString()}đ</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Số lượng món</p>
              <p className="text-2xl font-black text-slate-900">{items.length}</p>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <Input 
                placeholder="Tìm phòng hoặc món..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-full pl-12 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:ring-0 transition-all font-bold text-sm bg-white"
              />
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-8 pt-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="animate-spin text-blue-600" size={40} />
              <p className="text-slate-500 font-bold text-sm animate-pulse">Đang quét kho lương...</p>
            </div>
          ) : filteredItems.length > 0 ? (
            <div className="space-y-3 mt-6">
              {filteredItems.map((item, idx) => (
                <div 
                  key={`${item.booking_id}-${idx}`}
                  className="group bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex flex-col items-center justify-center border border-slate-100 group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors">
                      <Home size={20} className="text-slate-400 group-hover:text-blue-500" />
                      <span className="text-[10px] font-black text-slate-900 mt-1">{item.room_number}</span>
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 text-lg uppercase tracking-tight">{item.service_name}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-black uppercase">
                          SL: {item.quantity}
                        </span>
                        <span className="text-slate-400 text-xs font-bold">
                          Đơn giá: {item.price.toLocaleString()}đ
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-400 text-xs font-bold">
                          Check-in: {format(new Date(item.check_in_at), 'HH:mm dd/MM', { locale: vi })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-slate-900">{item.total_amount.toLocaleString()}đ</p>
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mt-1">Chưa thanh toán</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                <Package size={40} />
              </div>
              <h3 className="text-xl font-black text-slate-900 uppercase">Kho lương sạch bóng</h3>
              <p className="text-slate-500 font-bold text-sm mt-2 max-w-xs">
                Hiện không có dịch vụ nào đang bị treo trên hệ thống.
              </p>
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-900 text-white shrink-0 flex items-center justify-between rounded-b-3xl">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-amber-400" size={20} />
            <p className="text-xs font-bold text-slate-300">
              Dữ liệu được cập nhật thời gian thực từ Folio các phòng đang ở.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-black text-xs uppercase tracking-widest transition-colors"
          >
            Đóng
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
