'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/lib/supabase';
import { Room } from '@/types';
import { cn, formatCurrency, formatInputCurrency, parseCurrency } from '@/lib/utils';
import { PlusCircle, Edit, Trash2, X, Save, ChevronLeft, Plus, Search, Building2, MapPin, DollarSign, Mic, Clock, Calendar, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { useNotification } from '@/context/NotificationContext';
import Link from 'next/link';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// --- ZOD SCHEMA --- //
const roomSchema = z.object({
  room_number: z.string().min(1, 'Số phòng không được trống'),
  area: z.string().min(1, 'Khu vực không được trống'),
  prices: z.object({
    hourly: z.coerce.number().min(0, 'Giá không hợp lệ'),
    next_hour: z.coerce.number().min(0, 'Giá không hợp lệ'),
    daily: z.coerce.number().min(0, 'Giá không hợp lệ'),
    overnight: z.coerce.number().min(0, 'Giá không hợp lệ'),
  }),
  voice_alias: z.string().optional(),
  enable_overnight: z.boolean().default(true),
});

type RoomFormData = z.infer<typeof roomSchema>;

// --- MAIN COMPONENT --- //
export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const { showNotification } = useNotification();
  const [groupedRooms, setGroupedRooms] = useState<Record<string, Room[]>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
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

  // --- DATA FETCHING --- //
  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('rooms').select('*').order('area').order('room_number');
      if (error) {
        showNotification('Lỗi khi tải danh sách phòng.', 'error');
        console.error(error);
      } else {
        setRooms(data);
        groupRoomsByArea(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const groupRoomsByArea = (data: Room[]) => {
    const groups = data.reduce((acc, room) => {
      const area = room.area || 'Chưa phân loại';
      if (!acc[area]) acc[area] = [];
      acc[area].push(room);
      return acc;
    }, {} as Record<string, Room[]>);
    setGroupedRooms(groups);
  };

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
    const { error } = await supabase
      .from('rooms')
      .update({ enable_overnight: newStatus })
      .eq('id', room.id);
    if (error) {
      showNotification('Cập nhật thất bại!', 'error');
    } else {
      showNotification(`Phòng ${room.room_number} đã ${newStatus ? 'cho phép' : 'chặn'} bán đêm.`, 'success');
      fetchRooms();
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
          fetchRooms();
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="pb-32 pt-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/settings" className="p-2 -ml-2 rounded-full active:bg-slate-200 transition-colors">
          <ChevronLeft className="h-6 w-6 text-slate-600" />
        </Link>
        <h1 className="text-xl font-bold text-slate-800">Quản lý Phòng</h1>
      </div>

      {/* Search Bar */}
      <div className="mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm kiếm phòng hoặc khu vực..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-14 w-full rounded-2xl bg-slate-200/50 pl-12 pr-4 text-base font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-inner"
          />
        </div>
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
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                        <p className="text-sm font-bold text-slate-400">{formatCurrency(room.prices?.daily || 0)}đ / ngày</p>
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
                        {formatCurrency(room.prices?.hourly || 0)}đ/h đầu
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          );
        })}

        {rooms.length === 0 && !loading && (
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
      <div className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto">
        <button
          onClick={() => handleOpenModal()}
          className="flex h-[56px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-base font-bold text-white shadow-xl shadow-blue-200 active:scale-[0.96] transition-all"
        >
          <Plus className="h-5 w-5" />
          THÊM PHÒNG MỚI
        </button>
      </div>

      <RoomModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        room={editingRoom}
        onSave={fetchRooms}
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
}

function RoomModal({ isOpen, onClose, room, onSave }: RoomModalProps) {
  const { showNotification } = useNotification();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RoomFormData>({
    resolver: zodResolver(roomSchema),
  });

  useEffect(() => {
    if (isOpen) {
      if (room) {
        reset({
          room_number: room.room_number,
          area: room.area,
          prices: {
            hourly: room.prices?.hourly || 0,
            next_hour: room.prices?.next_hour || 0,
            daily: room.prices?.daily || 0,
            overnight: room.prices?.overnight || 0,
          },
          voice_alias: room.voice_alias || '',
          enable_overnight: room.enable_overnight ?? true,
        });
      } else {
        reset({
          room_number: '',
          area: '',
          prices: { hourly: 0, next_hour: 0, daily: 0, overnight: 0 },
          voice_alias: '',
          enable_overnight: true,
        });
      }
    }
  }, [isOpen, room, reset]);

  const onSubmit = async (data: RoomFormData) => {
    const payload = {
      ...data,
      prices: {
        hourly: Number(data.prices.hourly),
        next_hour: Number(data.prices.next_hour),
        daily: Number(data.prices.daily),
        overnight: Number(data.prices.overnight),
      }
    };

    const { error } = room
      ? await supabase.from('rooms').update(payload).eq('id', room.id)
      : await supabase.from('rooms').insert(payload);

    if (error) {
      showNotification(error.message, 'error');
    } else {
      showNotification(room ? 'Cập nhật phòng thành công!' : 'Đã tạo phòng mới!', 'success');
      onSave();
      onClose();
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
                </div>

                {/* Pricing Card */}
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-4">
                  <div className="flex items-center gap-2 text-emerald-600 mb-2">
                    <DollarSign size={18} />
                    <span className="font-bold text-sm">Cài đặt giá (VNĐ)</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <Controller
                      name="prices.hourly"
                      control={control}
                      render={({ field }) => (
                        <FormCurrencyInput 
                          label="Giá giờ đầu" 
                          icon={<Clock size={14} />}
                          value={field.value} 
                          onChange={field.onChange} 
                          error={errors.prices?.hourly} 
                        />
                      )}
                    />
                    <Controller
                      name="prices.next_hour"
                      control={control}
                      render={({ field }) => (
                        <FormCurrencyInput 
                          label="Giá giờ tiếp theo" 
                          icon={<Clock size={14} className="opacity-50" />}
                          value={field.value} 
                          onChange={field.onChange} 
                          error={errors.prices?.next_hour} 
                        />
                      )}
                    />
                    <Controller
                      name="prices.daily"
                      control={control}
                      render={({ field }) => (
                        <FormCurrencyInput 
                          label="Giá theo ngày" 
                          icon={<Calendar size={14} />}
                          value={field.value} 
                          onChange={field.onChange} 
                          error={errors.prices?.daily} 
                        />
                      )}
                    />
                    <Controller
                      name="prices.overnight"
                      control={control}
                      render={({ field }) => (
                        <FormCurrencyInput 
                          label="Giá qua đêm" 
                          icon={<Smartphone size={14} />}
                          value={field.value} 
                          onChange={field.onChange} 
                          error={errors.prices?.overnight} 
                        />
                      )}
                    />
                  </div>
                </div>

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
                      Lưu thay đổi
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

// --- CURRENCY INPUT COMPONENT --- //
interface FormCurrencyInputProps {
  label: string;
  icon?: React.ReactNode;
  value: number;
  onChange: (val: number) => void;
  error?: any;
}

function FormCurrencyInput({ label, icon, value, onChange, error }: FormCurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(formatInputCurrency(value?.toString() || '0'));

  useEffect(() => {
    let isMounted = true;
    const formatted = formatInputCurrency(value?.toString() || '0');
    if (isMounted && displayValue !== formatted) {
      setDisplayValue(formatted);
    }
    return () => { isMounted = false; };
  }, [value, displayValue]);

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider flex items-center gap-1">
        {icon} {label}
      </label>
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            const formatted = formatInputCurrency(e.target.value);
            setDisplayValue(formatted);
            onChange(parseCurrency(formatted));
          }}
          className={cn(
            'h-14 w-full rounded-2xl border-transparent bg-slate-50 px-4 text-base font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300',
            error ? 'ring-2 ring-red-500' : ''
          )}
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">đ</span>
      </div>
      {error && <p className="ml-1 text-[10px] font-bold text-red-500 uppercase tracking-tighter">{error.message}</p>}
    </div>
  );
}

// --- FORM INPUT COMPONENT --- //
interface FormInputProps {
  label: string;
  name: string;
  register: any;
  error?: any;
  type?: string;
  placeholder?: string;
}

function FormInput({ label, name, register, error, type = 'text', placeholder }: FormInputProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">{label}</label>
      <input
        id={name}
        type={type}
        placeholder={placeholder}
        {...register(name)}
        className={cn(
          'h-14 w-full rounded-2xl border-transparent bg-slate-50 px-4 text-base font-bold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-300',
          error ? 'ring-2 ring-red-500' : ''
        )}
      />
      {error && <p className="ml-1 text-[10px] font-bold text-red-500 uppercase tracking-tighter">{error.message}</p>}
    </div>
  );
}

