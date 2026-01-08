'use client';

import { useState, useEffect, useMemo } from 'react';
import useSWR, { mutate } from 'swr';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/lib/supabase';
import { Room, RoomCategory } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';
import { 
  PlusCircle, 
  Edit, 
  Trash2, 
  X, 
  Save, 
  ChevronLeft, 
  Plus, 
  Search, 
  Building2, 
  MapPin, 
  DollarSign, 
  Mic, 
  Clock, 
  Calendar, 
  Moon, 
  ArrowRight,
  Layers,
  Settings2,
  LayoutGrid
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { useNotification } from '@/context/NotificationContext';
import Link from 'next/link';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { NumericInput } from '@/components/ui/NumericInput';
import { toast } from 'sonner';

// --- ZOD SCHEMA --- //
const roomSchema = z.object({
  room_number: z.string().min(1, 'Số phòng không được trống'),
  area: z.string().min(1, 'Khu vực không được trống'),
  category_id: z.string().min(1, 'Bắt buộc phải chọn Loại phòng để có giá'),
  voice_alias: z.string().optional(),
  enable_overnight: z.boolean().default(true),
});

type RoomFormData = z.infer<typeof roomSchema>;

const fetchRoomsData = async () => {
  // Lấy dữ liệu phòng kèm thông tin loại phòng
  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select('*, category:room_categories(*)')
    .order('room_number');
     
  if (roomsError) {
    console.error('Error fetching rooms:', roomsError);
    throw roomsError;
  }

  // Lấy danh sách tất cả loại phòng
  const { data: categories, error: catError } = await supabase
    .from('room_categories')
    .select('*')
    .order('name');
     
  if (catError) {
    console.error('Error fetching categories:', catError);
  }

  // Lấy cài đặt hệ thống
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('key', 'system_settings')
    .maybeSingle();
  
  return {
    rooms: rooms || [],
    categories: categories || [],
    settings: settings?.value || {}
  };
};

// --- MAIN COMPONENT --- //
export default function RoomsPage() {
  const { data, error, isLoading: initialLoading, isValidating } = useSWR('rooms_and_settings', fetchRoomsData, {
    revalidateOnFocus: false, // Tắt tự động load lại khi focus để tránh reload ngoài ý muốn
    dedupingInterval: 5000,
  });
  
  const rooms = data?.rooms || [];
  const categories = data?.categories || [];
  const settings = data?.settings || {};
  
  // Chỉ hiện loading xoay vòng ở lần tải đầu tiên
  const loading = initialLoading && !data;
  
  const baseHours = settings.baseHours || 1;
  const hourUnit = settings.hourUnit || 60;

  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<'rooms' | 'types'>('rooms');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // --- Category Management State --- //
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<Partial<RoomCategory>>({
    name: '',
    prices: {
      hourly: 0,
      next_hour: 0,
      overnight: 0,
      daily: 0
    },
    surcharge_hourly_rate: 0
  });

  // --- DATA PROCESSING --- //
  const groupedRooms = useMemo(() => {
    if (!rooms) return {};
    return rooms.reduce((acc, room) => {
      const area = room.area || 'Chưa phân loại';
      if (!acc[area]) acc[area] = [];
      acc[area].push(room);
      return acc;
    }, {} as Record<string, Room[]>);
  }, [rooms]);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: 'danger' | 'info';
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  // --- ACTIONS --- //
  const handleOpenModal = (room: Room | null = null) => {
    setEditingRoom(room);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRoom(null);
  };

  const handleToggleOvernight = async (room: Room) => {
    const newStatus = !room.enable_overnight;
    
    // Optimistic update
    const newRooms = rooms.map(r => r.id === room.id ? { ...r, enable_overnight: newStatus } : r);
    mutate('rooms_and_settings', { ...data, rooms: newRooms }, false);

    const { error } = await supabase
      .from('rooms')
      .update({ enable_overnight: newStatus })
      .eq('id', room.id);
    
    if (error) {
      showNotification('Cập nhật thất bại!', 'error');
      mutate('rooms_and_settings');
    } else {
      showNotification(`Phòng ${room.room_number} đã ${newStatus ? 'cho phép' : 'chặn'} bán đêm.`, 'success');
      mutate('rooms_and_settings');
    }
  };

  const handleDeleteRoom = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Xóa phòng',
      description: 'Bạn có chắc chắn muốn xóa phòng này? Hành động này không thể hoàn tác.',
      onConfirm: async () => {
        const { error } = await supabase.from('rooms').delete().eq('id', id);
        if (error) {
          showNotification('Xóa phòng thất bại.', 'error');
        } else {
          showNotification('Đã xóa phòng thành công.', 'success');
          mutate('rooms_and_settings');
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // --- Category Actions --- //
  const handleAddCategory = async () => {
    if (!newCategory.name) {
      toast.error('Vui lòng nhập tên loại phòng');
      return;
    }

    try {
      // Chuẩn bị dữ liệu sạch và đảm bảo kiểu dữ liệu là Number
      const payload = {
        name: newCategory.name,
        prices: {
          hourly: Number(newCategory.prices?.hourly) || 0,
          next_hour: Number(newCategory.prices?.next_hour) || 0,
          overnight: Number(newCategory.prices?.overnight) || 0,
          daily: Number(newCategory.prices?.daily) || 0
        },
        surcharge_hourly_rate: Number(newCategory.surcharge_hourly_rate) || 0
      };

      const { error } = await supabase
        .from('room_categories')
        .insert([payload]);

      if (error) throw error;
      
      toast.success('Đã thêm loại phòng mới');
      setNewCategory({
        name: '',
        prices: {
          hourly: 0,
          next_hour: 0,
          overnight: 0,
          daily: 0
        },
        surcharge_hourly_rate: 0
      });
      mutate('rooms_and_settings');
    } catch (error: any) {
      console.error('Error adding category:', error);
      toast.error('Lỗi khi thêm: ' + (error.message || 'Không thể tạo loại phòng'));
    }
  };

  const handleUpdateCategory = async (cat: RoomCategory) => {
    try {
      // Đảm bảo dữ liệu gửi đi là số và sạch
      const payload = {
        name: cat.name,
        prices: {
          hourly: Number(cat.prices.hourly) || 0,
          next_hour: Number(cat.prices.next_hour) || 0,
          overnight: Number(cat.prices.overnight) || 0,
          daily: Number(cat.prices.daily) || 0
        },
        surcharge_hourly_rate: Number(cat.surcharge_hourly_rate) || 0
      };

      const { error } = await supabase
        .from('room_categories')
        .update(payload)
        .eq('id', cat.id);

      if (error) throw error;
      
      toast.success('Đã cập nhật loại phòng');
      setEditingCatId(null);
      mutate('rooms_and_settings');
    } catch (error: any) {
      console.error('Error updating category:', error);
      toast.error('Lỗi khi cập nhật: ' + (error.message || 'Không thể lưu thay đổi'));
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa loại phòng này? Các phòng thuộc loại này sẽ cần được gán lại.')) return;

    try {
      const { error } = await supabase
        .from('room_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Đã xóa loại phòng');
      mutate('rooms_and_settings');
    } catch (error: any) {
      toast.error('Lỗi khi xóa: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="pb-32 pt-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="p-2 -ml-2 rounded-full active:bg-slate-200 transition-colors">
            <ChevronLeft className="h-6 w-6 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Quản lý Phòng</h1>
            <div className="flex items-center gap-2">
              <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Hợp nhất Danh sách & Loại phòng</p>
              {isValidating && (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
              )}
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1.5 bg-slate-100 rounded-[1.5rem] w-fit">
          <button
            onClick={() => setActiveTab('rooms')}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all",
              activeTab === 'rooms' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <LayoutGrid size={18} />
            Danh sách phòng
          </button>
          <button
            onClick={() => setActiveTab('types')}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all",
              activeTab === 'types' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Layers size={18} />
            Loại phòng & Giá
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'rooms' ? (
          <motion.div
            key="rooms-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm phòng hoặc khu vực..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-14 w-full rounded-2xl bg-white border border-slate-100 pl-12 pr-4 text-base font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
              />
            </div>

            {/* Room List Grouped by Area */}
            <div className="space-y-8">
              {Object.entries(groupedRooms).map(([area, roomsInArea]) => {
                const filteredRooms = roomsInArea.filter(r => 
                  r.room_number.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  area.toLowerCase().includes(searchQuery.toLowerCase())
                );

                if (filteredRooms.length === 0) return null;

                return (
                  <section key={area} className="space-y-4">
                    <div className="flex items-center gap-2 px-2">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">{area}</h2>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {filteredRooms.map((room) => (
                        <motion.div
                          key={room.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="group relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-2xl font-black text-slate-800">P.{room.room_number}</span>
                                {room.enable_overnight && (
                                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 uppercase tracking-tighter">Qua đêm</span>
                                )}
                              </div>
                              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                                {room.category?.name || 'Chưa gán loại'}
                              </p>
                              <p className="text-sm font-bold text-slate-400">{formatCurrency(room.prices?.daily || 0)} / ngày</p>
                            </div>
                            <div className="flex gap-1">
                              <button 
                                onClick={() => handleOpenModal(room)}
                                className="rounded-full p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                              >
                                <Edit size={18} />
                              </button>
                              <button 
                                onClick={() => handleDeleteRoom(room.id)}
                                className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-4">
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={room.enable_overnight}
                                onCheckedChange={() => handleToggleOvernight(room)}
                              />
                              <span className="text-xs font-bold text-slate-500">Bán đêm</span>
                            </div>
                            <div className="text-xs font-bold text-blue-600">
                              {formatCurrency(room.prices?.hourly || 0)}/{baseHours}h đầu
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </section>
                );
              })}

              {rooms.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-slate-200 py-20 text-slate-400 bg-white/50">
                  <div className="mb-4 rounded-full bg-slate-100 p-6">
                    <Building2 className="h-12 w-12 opacity-20" />
                  </div>
                  <p className="text-lg font-bold">Chưa có phòng nào</p>
                  <p className="text-sm">Bấm nút bên dưới để thêm phòng đầu tiên</p>
                </div>
              )}
            </div>

            {/* Floating Action Button */}
            <div className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto md:relative md:bottom-0 md:left-0 md:right-0 md:mx-0">
              <button
                onClick={() => handleOpenModal()}
                className="flex h-[56px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-base font-bold text-white shadow-xl shadow-blue-200 active:scale-[0.96] transition-all"
              >
                <Plus className="h-5 w-5" />
                THÊM PHÒNG MỚI
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="types-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {/* Form thêm loại phòng */}
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 space-y-6">
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Plus size={20} className="text-blue-600" />
                Thêm loại phòng mới
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
                <div className="lg:col-span-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Tên loại phòng</label>
                  <input 
                    type="text"
                    value={newCategory.name}
                    onChange={e => setNewCategory({...newCategory, name: e.target.value})}
                    placeholder="Vd: VIP Single"
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Giá giờ đầu</label>
                  <NumericInput 
                    value={newCategory.prices?.hourly || 0}
                    onChange={val => setNewCategory({
                      ...newCategory, 
                      prices: { ...newCategory.prices!, hourly: val }
                    })}
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Giá giờ tiếp</label>
                  <NumericInput 
                    value={newCategory.prices?.next_hour || 0}
                    onChange={val => setNewCategory({
                      ...newCategory, 
                      prices: { ...newCategory.prices!, next_hour: val }
                    })}
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Giá qua đêm</label>
                  <NumericInput 
                    value={newCategory.prices?.overnight || 0}
                    onChange={val => setNewCategory({
                      ...newCategory, 
                      prices: { ...newCategory.prices!, overnight: val }
                    })}
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Giá theo ngày</label>
                  <NumericInput 
                    value={newCategory.prices?.daily || 0}
                    onChange={val => setNewCategory({
                      ...newCategory, 
                      prices: { ...newCategory.prices!, daily: val }
                    })}
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] mb-2">Phụ thu mỗi giờ</label>
                  <NumericInput 
                    value={newCategory.surcharge_hourly_rate || 0}
                    onChange={val => setNewCategory({
                      ...newCategory, 
                      surcharge_hourly_rate: val
                    })}
                    className="w-full px-4 py-3 bg-orange-50 border-none rounded-2xl font-bold text-orange-600 focus:ring-2 focus:ring-orange-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button 
                  onClick={handleAddCategory}
                  className="px-8 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
                >
                  <Plus size={20} />
                  TẠO LOẠI PHÒNG
                </button>
              </div>
            </div>

            {/* Danh sách loại phòng */}
            <div className="grid grid-cols-1 gap-6">
              {categories.map(cat => (
                <div 
                  key={cat.id}
                  className="group bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 hover:border-blue-200 transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                    <div className="flex-1 flex items-center gap-4">
                      <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                        <Layers size={28} />
                      </div>
                      <div>
                        {editingCatId === cat.id ? (
                          <input 
                            type="text"
                            value={cat.name}
                            onChange={e => {
                              const newCats = categories.map(c => c.id === cat.id ? {...c, name: e.target.value} : c);
                              mutate('rooms_and_settings', { ...data, categories: newCats }, false);
                            }}
                            className="text-xl font-black text-slate-800 bg-slate-50 border-none rounded-lg px-2 py-1"
                          />
                        ) : (
                          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight group-hover:text-blue-600 transition-colors">
                            {cat.name}
                          </h3>
                        )}
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1">
                          ID: {cat.id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 lg:gap-8 flex-[2]">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <Clock size={12} className="text-blue-500" /> Giờ đầu
                        </div>
                        {editingCatId === cat.id ? (
                          <NumericInput 
                            value={cat.prices.hourly}
                            onChange={val => {
                              const newCats = categories.map(c => c.id === cat.id ? {...c, prices: {...c.prices, hourly: val}} : c);
                              mutate('rooms_and_settings', { ...data, categories: newCats }, false);
                            }}
                            className="font-bold text-slate-700 bg-slate-50 border-none rounded-lg px-2 py-1 w-full"
                          />
                        ) : (
                          <p className="text-lg font-black text-slate-700">{formatCurrency(cat.prices.hourly)}đ</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <ArrowRight size={12} className="text-emerald-500" /> Giờ tiếp
                        </div>
                        {editingCatId === cat.id ? (
                          <NumericInput 
                            value={cat.prices.next_hour}
                            onChange={val => {
                              const newCats = categories.map(c => c.id === cat.id ? {...c, prices: {...c.prices, next_hour: val}} : c);
                              mutate('rooms_and_settings', { ...data, categories: newCats }, false);
                            }}
                            className="font-bold text-slate-700 bg-slate-50 border-none rounded-lg px-2 py-1 w-full"
                          />
                        ) : (
                          <p className="text-lg font-black text-slate-700">{formatCurrency(cat.prices.next_hour)}đ</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <Moon size={12} className="text-indigo-500" /> Qua đêm
                        </div>
                        {editingCatId === cat.id ? (
                          <NumericInput 
                            value={cat.prices.overnight}
                            onChange={val => {
                              const newCats = categories.map(c => c.id === cat.id ? {...c, prices: {...c.prices, overnight: val}} : c);
                              mutate('rooms_and_settings', { ...data, categories: newCats }, false);
                            }}
                            className="font-bold text-slate-700 bg-slate-50 border-none rounded-lg px-2 py-1 w-full"
                          />
                        ) : (
                          <p className="text-lg font-black text-slate-700">{formatCurrency(cat.prices.overnight)}đ</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <Calendar size={12} className="text-rose-500" /> Ngày
                        </div>
                        {editingCatId === cat.id ? (
                          <NumericInput 
                            value={cat.prices.daily}
                            onChange={val => {
                              const newCats = categories.map(c => c.id === cat.id ? {...c, prices: {...c.prices, daily: val}} : c);
                              mutate('rooms_and_settings', { ...data, categories: newCats }, false);
                            }}
                            className="font-bold text-slate-700 bg-slate-50 border-none rounded-lg px-2 py-1 w-full"
                          />
                        ) : (
                          <p className="text-lg font-black text-slate-700">{formatCurrency(cat.prices.daily)}đ</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[10px] font-black text-orange-500 uppercase tracking-wider">
                          <Plus size={12} className="text-orange-500" /> Phụ thu
                        </div>
                        {editingCatId === cat.id ? (
                          <NumericInput 
                            value={cat.surcharge_hourly_rate || 0}
                            onChange={val => {
                              const newCats = categories.map(c => c.id === cat.id ? {...c, surcharge_hourly_rate: val} : c);
                              mutate('rooms_and_settings', { ...data, categories: newCats }, false);
                            }}
                            className="font-bold text-orange-600 bg-orange-50 border-none rounded-lg px-2 py-1 w-full"
                          />
                        ) : (
                          <p className="text-lg font-black text-orange-600">{formatCurrency(cat.surcharge_hourly_rate || 0)}đ</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 lg:pl-6 border-t lg:border-t-0 lg:border-l border-slate-100 pt-4 lg:pt-0">
                      {editingCatId === cat.id ? (
                        <>
                          <button 
                            onClick={() => handleUpdateCategory(cat)}
                            className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-100 transition-colors"
                            title="Lưu"
                          >
                            <Save size={20} />
                          </button>
                          <button 
                            onClick={() => {
                              setEditingCatId(null);
                              mutate('rooms_and_settings');
                            }}
                            className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-slate-100 transition-colors"
                            title="Hủy"
                          >
                            <Plus className="rotate-45" size={20} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => setEditingCatId(cat.id)}
                            className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 transition-colors"
                            title="Chỉnh sửa"
                          >
                            <Settings2 size={20} />
                          </button>
                          <button 
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-3 bg-rose-50 text-rose-600 rounded-2xl hover:bg-rose-100 transition-colors"
                            title="Xóa"
                          >
                            <Trash2 size={20} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {categories.length === 0 && (
                <div className="text-center py-20 bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
                  <Layers className="mx-auto text-slate-300 mb-4" size={48} />
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Chưa có loại phòng nào</p>
                  <p className="text-slate-400 text-xs mt-1">Hãy thêm loại phòng đầu tiên ở phía trên.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <RoomModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        room={editingRoom}
        onSave={() => mutate('rooms_and_settings')}
        baseHours={baseHours}
        hourUnit={hourUnit}
        categories={categories}
      />

      <ConfirmDialog
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        variant={confirmConfig.variant}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

// --- MODAL COMPONENT --- //
interface RoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room | null;
  onSave: () => void;
  baseHours: number;
  hourUnit: number;
  categories: RoomCategory[];
}

function RoomModal({ isOpen, onClose, room, onSave, baseHours, hourUnit, categories }: RoomModalProps) {
  const { showNotification } = useNotification();
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RoomFormData>({
    resolver: zodResolver(roomSchema),
  });

  const selectedCategoryId = watch('category_id');
  const selectedCategory = useMemo(() => categories.find(c => c.id === selectedCategoryId), [selectedCategoryId, categories]);

  useEffect(() => {
    if (isOpen) {
      if (room) {
        reset({
          room_number: room.room_number,
          area: room.area,
          category_id: room.category_id || '',
          voice_alias: room.voice_alias || '',
          enable_overnight: room.enable_overnight ?? true,
        });
      } else {
        reset({
          room_number: '',
          area: '',
          category_id: '',
          voice_alias: '',
          enable_overnight: true,
        });
      }
    }
  }, [isOpen, room, reset]);

  const onSubmit = async (data: RoomFormData) => {
    try {
      if (room) {
        const { error } = await supabase
          .from('rooms')
          .update(data)
          .eq('id', room.id);
        
        if (error) throw error;
        showNotification('Cập nhật phòng thành công.', 'success');
      } else {
        const { error } = await supabase.from('rooms').insert([data]);
        if (error) throw error;
        showNotification('Thêm phòng mới thành công.', 'success');
      }
      onSave();
      onClose();
    } catch (error) {
      showNotification('Có lỗi xảy ra.', 'error');
      console.error(error);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
          >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-8 overflow-y-auto">
              <div className="flex items-center justify-between pt-4">
                <h2 className="text-xl font-bold text-slate-800">{room ? 'Sửa thông tin phòng' : 'Tạo phòng mới'}</h2>
                <button type="button" onClick={onClose} className="rounded-full bg-slate-200 p-3 text-slate-500 hover:bg-slate-300 transition-all">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6 flex-1">
                {/* Basic Info Card */}
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4">
                   <div className="flex items-center gap-2 text-blue-600 mb-2">
                    <Building2 size={18} />
                    <span className="font-bold text-sm">Thông tin cơ bản</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormInput label="Số phòng" name="room_number" register={register} error={errors.room_number} placeholder="VD: 101" />
                    <FormInput label="Khu vực" name="area" register={register} error={errors.area} placeholder="VD: Tầng 1" />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Loại phòng (Bắt buộc để có giá)</label>
                    <div className="relative">
                      <select
                        {...register('category_id')}
                        className={cn(
                          "w-full h-14 rounded-2xl bg-slate-100 border-none px-4 font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all outline-none appearance-none shadow-inner",
                          errors.category_id && "ring-2 ring-red-500"
                        )}
                      >
                        <option value="">-- Chọn Loại phòng --</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <Building2 size={18} />
                      </div>
                    </div>
                    {errors.category_id && <p className="ml-1 text-[10px] font-bold text-red-500 uppercase">{errors.category_id.message}</p>}
                  </div>
                </div>

                {/* Pricing Info (Read-only) */}
                <AnimatePresence>
                  {selectedCategory && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-emerald-50 rounded-[2rem] p-6 border border-emerald-100 space-y-4 overflow-hidden"
                    >
                      <div className="flex items-center justify-between text-emerald-700">
                        <div className="flex items-center gap-2">
                          <DollarSign size={18} />
                          <span className="font-black text-xs uppercase tracking-widest">Bảng giá Loại phòng</span>
                        </div>
                        <span className="px-3 py-1 bg-emerald-100 rounded-full text-[10px] font-black uppercase">Áp dụng tự động</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <PriceBadge label={`Gói ${baseHours}h`} value={selectedCategory.prices.hourly} />
                        <PriceBadge label={`Thêm ${hourUnit}p`} value={selectedCategory.prices.next_hour} />
                        <PriceBadge label="Giá ngày" value={selectedCategory.prices.daily} />
                        <PriceBadge label="Qua đêm" value={selectedCategory.prices.overnight} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Advanced Card */}
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4">
                  <div className="flex items-center gap-2 text-indigo-600 mb-2">
                    <Mic size={18} />
                    <span className="font-bold text-sm">Nâng cao & AI</span>
                  </div>
                  <FormInput label="Tên gọi khác (cho AI)" name="voice_alias" register={register} error={errors.voice_alias} placeholder="VD: Một linh một" />
                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-slate-800">Cho phép bán đêm</p>
                      <p className="text-xs text-slate-400">Hiển thị trong lịch đặt phòng đêm</p>
                    </div>
                    <Controller
                      name="enable_overnight"
                      control={control}
                      render={({ field }) => (
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose} className="flex-1 h-14 rounded-2xl bg-slate-200 font-bold text-slate-600 hover:bg-slate-300 transition-colors">Hủy</button>
                <button 
                  type="submit" 
                  disabled={isSubmitting} 
                  className="flex-[2] flex h-14 items-center justify-center rounded-2xl bg-blue-600 font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-100"
                >
                  {isSubmitting ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  ) : (
                    <>
                      <Save className="mr-2" size={20}/>
                      Lưu thông tin
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function FormInput({ label, name, register, error, placeholder }: any) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      <input
        {...register(name)}
        placeholder={placeholder}
        className={cn(
          "w-full h-14 rounded-2xl bg-slate-100 border-none px-4 font-bold text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 transition-all outline-none shadow-inner",
          error && "ring-2 ring-red-500"
        )}
      />
      {error && <p className="ml-1 text-[10px] font-bold text-red-500 uppercase">{error.message}</p>}
    </div>
  );
}

function PriceBadge({ label, value }: { label: string, value: number }) {
  return (
    <div className="bg-white/60 backdrop-blur-sm p-3 rounded-2xl flex items-center justify-between">
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{label}</span>
      <span className="text-sm font-black text-slate-700">{formatCurrency(value)}đ</span>
    </div>
  );
}
