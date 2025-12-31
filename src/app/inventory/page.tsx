'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  PieChart as PieChartIcon, 
  Clock, 
  AlertTriangle,
  Search,
  Package,
  List,
  History as HistoryIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Service } from '@/types';
import { InventoryAuditModal } from './_components/InventoryAuditModal';
import { PendingItemsModal } from './_components/PendingItemsModal';
import { cn } from '@/lib/utils';
import { RoleGuard } from '@/components/auth/RoleGuard';
import StockHistory from '../settings/services/_components/StockHistory';

export default function InventoryManagement() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [isPendingItemsModalOpen, setIsPendingItemsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'stock' | 'history'>('stock');

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setServices(data || []);
    } catch (error: any) {
      console.error('Error fetching inventory:', error);
      toast.error('Không thể tải dữ liệu kho: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('inventory_changes')
      .on('postgres_changes', { event: '*', table: 'services', schema: 'public' }, () => fetchData())
      .on('postgres_changes', { event: '*', table: 'bookings', schema: 'public' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <RoleGuard allowedRoles={['admin', 'manager']}>
      <div className="min-h-screen bg-slate-50/50 p-6 lg:p-10 pb-32">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight mb-2">Kho Lương</h1>
              <p className="text-slate-500 font-bold text-sm tracking-wide">Quản lý hàng hóa và đối soát tồn kho</p>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                onClick={() => setIsPendingItemsModalOpen(true)}
                variant="outline"
                className="h-14 px-8 rounded-2xl font-black uppercase text-xs tracking-widest border-2 border-slate-200 hover:bg-slate-50 text-slate-600 gap-2"
              >
                <Clock size={18} /> Hàng treo
              </Button>
              <Button 
                onClick={() => setIsInventoryModalOpen(true)}
                className="h-14 px-8 rounded-2xl font-black uppercase text-xs tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-100 gap-2"
              >
                <PieChartIcon size={18} /> Kiểm kho
              </Button>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-slate-200/50 p-1 rounded-2xl w-full md:w-fit">
            <button
              onClick={() => setActiveTab('stock')}
              className={cn(
                "flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold transition-all",
                activeTab === 'stock' 
                  ? "bg-white text-blue-600 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <List size={18} />
              Tồn kho hiện tại
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                "flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-bold transition-all",
                activeTab === 'history' 
                  ? "bg-white text-blue-600 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <HistoryIcon size={18} />
              Lịch sử nhập xuất
            </button>
          </div>

          <div className="mt-8">
            {activeTab === 'stock' ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Danh mục hàng hóa</h2>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                        <input 
                          type="text"
                          placeholder="Tìm kiếm hàng..."
                          className="pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none w-64"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-50">
                            <th className="text-left py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Tên món</th>
                            <th className="text-center py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Đơn vị</th>
                            <th className="text-center py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Tồn kho</th>
                            <th className="text-right py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Đơn giá</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {filteredServices.map((service) => (
                            <tr key={service.id} className="group hover:bg-slate-50/50 transition-colors">
                              <td className="py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                    <Package size={20} />
                                  </div>
                                  <span className="font-bold text-slate-700">{service.name}</span>
                                </div>
                              </td>
                              <td className="py-4 text-center font-bold text-slate-500">{service.unit}</td>
                              <td className="py-4 text-center">
                                <span className={cn(
                                  "px-3 py-1 rounded-full text-xs font-black",
                                  service.stock <= 5 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                                )}>
                                  {service.stock}
                                </span>
                              </td>
                              <td className="py-4 text-right font-black text-slate-900">{service.price.toLocaleString()}đ</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-slate-900 p-8 rounded-3xl text-white space-y-6 shadow-xl shadow-slate-200">
                    <div className="flex items-center gap-3 opacity-60">
                      <AlertTriangle size={20} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Cảnh báo tồn kho</span>
                    </div>
                    <div className="space-y-4">
                      {services.filter(s => s.stock <= 5).slice(0, 5).map(s => (
                        <div key={s.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                          <span className="font-bold text-sm">{s.name}</span>
                          <span className="text-rose-400 font-black text-sm">{s.stock} {s.unit}</span>
                        </div>
                      ))}
                      {services.filter(s => s.stock <= 5).length === 0 && (
                        <p className="text-slate-400 text-sm font-bold italic">Chưa có mặt hàng nào sắp hết.</p>
                      )}
                    </div>
                    <Button className="w-full h-12 rounded-xl bg-white text-slate-900 font-black uppercase text-xs tracking-widest hover:bg-slate-100">
                      Nhập hàng ngay
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <StockHistory />
              </div>
            )}
          </div>
        </div>
      </div>

      <InventoryAuditModal
        isOpen={isInventoryModalOpen}
        onClose={() => {
          setIsInventoryModalOpen(false);
          fetchData();
        }}
        services={services} 
      />

      <PendingItemsModal
        isOpen={isPendingItemsModalOpen}
        onClose={() => setIsPendingItemsModalOpen(false)}
      />
    </RoleGuard>
  );
}
