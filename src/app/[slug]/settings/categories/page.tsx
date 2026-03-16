'use client';

import { useState, useEffect } from 'react';
import { 
  ChevronLeft, BedDouble, Clock, ShieldCheck, Plus, Trash2, 
  Settings2, Copy, LayoutGrid, List, Users, Save, Edit3,
  ArrowLeft, X, Info, Layers
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/controls';
import { settingsService, RoomCategory } from '@/services/settingsService';
import { roomService, Room } from '@/services/roomService';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';
import { cn } from '@/lib/utils';

export default function CategoriesPage() {
  const { confirm: confirmDialog } = useGlobalDialog();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'categories' | 'rooms'>('categories');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  // Room Editing State
  const [editingRoom, setEditingRoom] = useState<Partial<Room> | null>(null);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [cats, roomList] = await Promise.all([
        settingsService.getRoomCategories(),
        roomService.getRooms()
      ]);
      setCategories(cats || []);
      setRooms(roomList || []);
    } catch (error) {
      console.error('Error in fetchData:', error);
      toast.error('Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  // --- Category Handlers ---
  const handleCreateCategory = async () => {
    try {
      const newCat: Partial<RoomCategory> = {
        name: `Hạng phòng mới ${categories.length + 1}`,
        max_adults: 2,
        max_children: 1,
        price_daily: 600000,
        price_hourly: 150000,
        price_next_hour: 50000,
        hourly_unit: 60,
        base_hourly_limit: 1,
        price_overnight: 400000,
        overnight_enabled: true,
        price_overnight_late_hour: 12,
        auto_surcharge_enabled: true,
        surcharge_mode: 'amount',
        hourly_surcharge_amount: 50000,
        extra_person_enabled: true,
        extra_person_method: 'fixed',
        price_extra_adult: 100000,
        price_extra_child: 50000
      };
      await settingsService.createRoomCategory(newCat);
      await fetchData();
      toast.success('Đã tạo hạng phòng mới');
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('Có lỗi xảy ra khi tạo hạng phòng');
    }
  };

  const handleCopyCategory = async (category: RoomCategory) => {
    try {
      const { id, ...rest } = category;
      const newCat: Partial<RoomCategory> = {
        ...rest,
        name: `${category.name} (Bản sao)`,
      };
      await settingsService.createRoomCategory(newCat);
      await fetchData();
      toast.success('Đã sao chép hạng phòng');
    } catch (error) {
      console.error('Error copying category:', error);
      toast.error('Có lỗi xảy ra khi sao chép hạng phòng');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const isConfirmed = await confirmDialog({
      title: 'Xóa hạng phòng',
      message: 'Bạn có chắc chắn muốn xóa hạng phòng này không? Các phòng thuộc hạng này sẽ bị ảnh hưởng.',
      confirmLabel: 'Xóa ngay',
      cancelLabel: 'Hủy',
      destructive: true
    });
    if (!isConfirmed) return;
    
    try {
        await settingsService.deleteRoomCategory(id);
        await fetchData();
        toast.success('Đã xóa hạng phòng');
    } catch (error) {
        console.error('Error deleting category:', error);
        toast.error('Có lỗi xảy ra khi xóa hạng phòng');
    }
  };

  const handleSaveCategories = async () => {
    setSaving(true);
    try {
      await Promise.all(
        categories.map(c => settingsService.updateRoomCategory(c.id, c))
      );
      toast.success('Đã lưu cấu hình hạng phòng');
      await fetchData();
    } catch (error) {
      console.error('Failed to save categories:', error);
      toast.error('Có lỗi xảy ra khi lưu cấu hình');
    } finally {
      setSaving(false);
    }
  };

  // --- Room Handlers ---
  const handleSaveRoom = async () => {
    if (!editingRoom) return;
    
    if (!editingRoom.name && !editingRoom.room_number) {
      toast.error('Vui lòng nhập số phòng');
      return;
    }
    if (!editingRoom.category_id) {
      toast.error('Vui lòng chọn hạng phòng');
      return;
    }

    try {
      let result;
      if (editingRoom.id) {
        result = await roomService.updateRoom(editingRoom.id, editingRoom);
      } else {
        result = await roomService.createRoom(editingRoom);
      }

      if (!result) {
        toast.error('Lưu thất bại. Vui lòng kiểm tra lại thông tin.');
        return;
      }

      setIsRoomModalOpen(false);
      setEditingRoom(null);
      await fetchData();
      toast.success('Đã lưu phòng thành công');
    } catch (error) {
      console.error('Error saving room:', error);
      toast.error('Lỗi khi lưu phòng');
    }
  };

  const handleDeleteRoom = async (id: string) => {
    const isConfirmed = await confirmDialog({
      title: 'Xóa phòng',
      message: 'Xác nhận xóa phòng này khỏi hệ thống?',
      confirmLabel: 'Xóa',
      cancelLabel: 'Hủy',
      destructive: true
    });
    if (!isConfirmed) return;
    
    try {
      await roomService.deleteRoom(id);
      await fetchData();
      toast.success('Đã xóa phòng');
    } catch (error) {
      console.error('Error deleting room:', error);
      toast.error('Lỗi khi xóa phòng');
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-slate-900 font-sans selection:bg-slate-900 selection:text-white pb-40">
      
      {/* 1. TOP NAV */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-[1400px] mx-auto px-4 md:px-10 h-20 md:h-24 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()}
              className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white rounded-full border border-slate-200 shadow-sm hover:bg-slate-50 transition-all active:scale-90"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 leading-none">Hạng phòng & Sơ đồ</h1>
              <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Cấu hình cơ sở vật chất</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {activeTab === 'categories' ? (
              <button 
                onClick={handleSaveCategories}
                disabled={saving}
                className="h-10 md:h-12 px-5 md:px-8 bg-slate-900 text-white rounded-full text-[13px] font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200 disabled:opacity-50"
              >
                {saving ? <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> : <Save size={18} />}
                <span>{saving ? 'Đang lưu...' : 'Lưu hạng phòng'}</span>
              </button>
            ) : (
              <button 
                onClick={() => {
                  setEditingRoom({ status: 'available' });
                  setIsRoomModalOpen(true);
                }}
                className="h-10 md:h-12 px-5 md:px-8 bg-slate-900 text-white rounded-full text-[13px] font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
              >
                <Plus size={18} />
                <span>Thêm phòng</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 md:px-10 py-8 md:py-12 space-y-10 md:space-y-16">
        
        {/* 2. TAB NAVIGATION */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-1.5 px-2">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Cấu hình sơ đồ</h2>
            <p className="text-slate-400 font-bold text-sm md:text-base">Quản lý các loại phòng và danh sách phòng thực tế</p>
          </div>

          <div className="flex items-center gap-1.5 p-1.5 bg-white/80 backdrop-blur-md rounded-full border border-slate-200/60 shadow-sm self-start md:self-auto">
            <button 
              onClick={() => setActiveTab('categories')}
              className={cn(
                "px-6 md:px-8 py-2.5 rounded-full text-[12px] md:text-[13px] font-bold transition-all uppercase tracking-widest flex items-center gap-2",
                activeTab === 'categories' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <LayoutGrid size={16} /> Hạng phòng
            </button>
            <button 
              onClick={() => setActiveTab('rooms')}
              className={cn(
                "px-6 md:px-8 py-2.5 rounded-full text-[12px] md:text-[13px] font-bold transition-all uppercase tracking-widest flex items-center gap-2",
                activeTab === 'rooms' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <List size={16} /> Danh sách phòng
            </button>
          </div>
        </div>

        {/* 3. CONTENT AREA */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {activeTab === 'categories' && (
            <div className="grid grid-cols-1 gap-10 md:gap-16">
              {categories.map((cat, index) => (
                <div key={cat.id} className="bg-white/80 backdrop-blur-xl rounded-[40px] p-8 md:p-12 border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] flex flex-col relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none -rotate-12">
                    <BedDouble size={250} strokeWidth={0.5} />
                  </div>

                  {/* Card Header */}
                  <div className="relative z-10 flex flex-col md:flex-row md:items-start justify-between gap-8 mb-12">
                    <div className="flex items-center gap-6 flex-1">
                      <div className="w-20 h-20 rounded-[32px] bg-blue-50 text-blue-500 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500">
                        <BedDouble size={40} />
                      </div>
                      <div className="flex-1 space-y-4">
                        <div className="relative group/input">
                          <input 
                            value={cat.name}
                            onChange={(e) => {
                              const newCats = [...categories];
                              newCats[index].name = e.target.value;
                              setCategories(newCats);
                            }}
                            className="text-3xl md:text-4xl font-black bg-transparent border-none focus:outline-none focus:ring-0 p-0 w-full text-slate-900 placeholder:text-slate-200 tracking-tight"
                            placeholder="Tên hạng phòng"
                          />
                          <div className="absolute -bottom-2 left-0 w-full h-1 bg-slate-50 group-focus-within/input:bg-blue-500/20 transition-all rounded-full" />
                        </div>
                        
                        <div className="flex items-center gap-4">
                           <div className="flex items-center gap-3 bg-slate-50/50 px-4 py-2 rounded-2xl border border-slate-100">
                              <Users size={16} className="text-slate-400"/>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lớn:</span>
                              <input 
                                type="number" 
                                className="w-10 font-black bg-transparent border-none text-center focus:outline-none text-slate-900 text-lg"
                                value={cat.max_adults}
                                onChange={(e) => {
                                  const newCats = [...categories];
                                  newCats[index].max_adults = Number(e.target.value);
                                  setCategories(newCats);
                                }}
                              />
                           </div>
                           <div className="flex items-center gap-3 bg-slate-50/50 px-4 py-2 rounded-2xl border border-slate-100">
                              <Users size={16} className="text-slate-400"/>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trẻ:</span>
                              <input 
                                type="number" 
                                className="w-10 font-black bg-transparent border-none text-center focus:outline-none text-slate-900 text-lg"
                                value={cat.max_children}
                                onChange={(e) => {
                                  const newCats = [...categories];
                                  newCats[index].max_children = Number(e.target.value);
                                  setCategories(newCats);
                                }}
                              />
                           </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => handleCopyCategory(cat)} className="w-12 h-12 flex items-center justify-center bg-slate-50 hover:bg-slate-900 hover:text-white rounded-full text-slate-400 transition-all" title="Sao chép">
                        <Copy size={20} />
                      </button>
                      <button onClick={() => handleDeleteCategory(cat.id)} className="w-12 h-12 flex items-center justify-center bg-rose-50 hover:bg-rose-500 hover:text-white rounded-full text-rose-400 transition-all" title="Xóa">
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>

                  {/* Pricing Grid */}
                  <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
                    
                    {/* Hourly Section */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
                        <Clock className="text-blue-500" size={18} />
                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Giá Theo Giờ (Block)</h3>
                      </div>
                      
                      <div className="space-y-6">
                        <div className="bg-slate-50/50 p-8 rounded-[32px] border border-slate-100 space-y-5">
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Block Đầu Tiên</p>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-400">Thời gian (Giờ)</span>
                                    <input 
                                        type="number"
                                        className="w-20 text-center font-black bg-white border border-slate-100 rounded-xl py-2 text-lg text-slate-900 outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                                        value={cat.base_hourly_limit || 1}
                                        onChange={(e) => {
                                            const newCats = [...categories];
                                            newCats[index].base_hourly_limit = Number(e.target.value);
                                            setCategories(newCats);
                                        }}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <span className="text-xs font-bold text-slate-400">Giá tiền</span>
                                    <MoneyInput 
                                        value={cat.price_hourly}
                                        onChange={(val) => {
                                            const newCats = [...categories];
                                            newCats[index].price_hourly = val;
                                            setCategories(newCats);
                                        }}
                                        className="h-16 rounded-[24px] bg-white border-transparent font-black text-2xl px-6 focus:ring-4 focus:ring-blue-500/5 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50/50 p-8 rounded-[32px] border border-slate-100 space-y-5">
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Block Tiếp Theo</p>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-400">Thời gian (Phút)</span>
                                    <input 
                                        type="number"
                                        className="w-20 text-center font-black bg-white border border-slate-100 rounded-xl py-2 text-lg text-slate-900 outline-none focus:ring-4 focus:ring-blue-500/5 transition-all"
                                        value={cat.hourly_unit || 60}
                                        onChange={(e) => {
                                            const newCats = [...categories];
                                            newCats[index].hourly_unit = Number(e.target.value);
                                            setCategories(newCats);
                                        }}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <span className="text-xs font-bold text-slate-400">Giá tiền</span>
                                    <MoneyInput 
                                        value={cat.price_next_hour}
                                        onChange={(val) => {
                                            const newCats = [...categories];
                                            newCats[index].price_next_hour = val;
                                            setCategories(newCats);
                                        }}
                                        className="h-16 rounded-[24px] bg-white border-transparent font-black text-2xl px-6 focus:ring-4 focus:ring-blue-500/5 transition-all"
                                    />
                                </div>
                            </div>
                        </div>
                      </div>
                    </div>

                    {/* Daily & Overnight Section */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 pb-4 border-b border-slate-50">
                        <Layers className="text-indigo-500" size={18} />
                        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Giá Ngày & Qua Đêm</h3>
                      </div>
                      
                      <div className="space-y-6">
                        <div className="p-8 rounded-[32px] border border-slate-100 bg-white shadow-sm space-y-3">
                          <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Giá Theo Ngày</label>
                          <MoneyInput 
                            value={cat.price_daily}
                            onChange={(val) => {
                               const newCats = [...categories];
                               newCats[index].price_daily = val;
                               setCategories(newCats);
                            }}
                            className="h-16 md:h-24 text-2xl md:text-4xl rounded-[24px] md:rounded-[32px] bg-slate-50 border-transparent font-black px-6 md:px-8 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all"
                          />
                        </div>

                        <div className="p-8 rounded-[32px] border border-slate-100 bg-white shadow-sm space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Giá Qua Đêm</label>
                                <Switch 
                                    checked={cat.overnight_enabled ?? true}
                                    onChange={(checked: boolean) => {
                                        const newCats = [...categories];
                                        newCats[index].overnight_enabled = checked;
                                        setCategories(newCats);
                                    }}
                                />
                            </div>
                            {cat.overnight_enabled !== false ? (
                                <MoneyInput 
                                    value={cat.price_overnight}
                                    onChange={(val) => {
                                        const newCats = [...categories];
                                        newCats[index].price_overnight = val;
                                        setCategories(newCats);
                                    }}
                                    className="h-16 md:h-24 text-2xl md:text-4xl rounded-[24px] md:rounded-[32px] bg-slate-50 border-transparent font-black px-6 md:px-8 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all"
                                />
                            ) : (
                                <div className="h-16 md:h-24 flex items-center justify-center bg-slate-50 rounded-[24px] md:rounded-[32px] border border-dashed border-slate-200">
                                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Không áp dụng giá Đêm</span>
                                </div>
                            )}
                        </div>
                      </div>
                    </div>

                    {/* Surcharges Section */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between pb-4 border-b border-slate-50 px-2">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className="text-emerald-500" size={18} />
                          <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Phụ Thu</h3>
                        </div>
                        <Switch 
                          checked={cat.auto_surcharge_enabled ?? false}
                          onChange={(checked: boolean) => {
                              const newCats = [...categories];
                              newCats[index].auto_surcharge_enabled = checked;
                              setCategories(newCats);
                          }}
                        />
                      </div>
                      
                      <div className="space-y-6">
                        {cat.auto_surcharge_enabled && (
                            <div className="bg-emerald-50/30 border border-emerald-100/50 p-8 rounded-[32px] space-y-6 animate-in slide-in-from-top-2">
                                <div className="flex bg-white/50 p-1.5 rounded-2xl border border-emerald-100/50">
                                    <button
                                        className={cn(
                                            "flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                                            (cat.surcharge_mode || 'amount') === 'amount' ? "bg-white text-emerald-600 shadow-sm" : "text-emerald-400"
                                        )}
                                        onClick={() => {
                                            const newCats = [...categories];
                                            newCats[index].surcharge_mode = 'amount';
                                            setCategories(newCats);
                                        }}
                                    > Theo tiền </button>
                                    <button
                                        className={cn(
                                            "flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                                            cat.surcharge_mode === 'percent' ? "bg-white text-emerald-600 shadow-sm" : "text-emerald-400"
                                        )}
                                        onClick={() => {
                                            const newCats = [...categories];
                                            newCats[index].surcharge_mode = 'percent';
                                            if (!newCats[index].surcharge_rules || newCats[index].surcharge_rules.length === 0) {
                                                newCats[index].surcharge_rules = [{ type: 'Late', from_minute: 0, to_minute: 60, percentage: 10 }];
                                            }
                                            setCategories(newCats);
                                        }}
                                    > Theo % </button>
                                </div>
                                
                                {(cat.surcharge_mode || 'amount') === 'amount' ? (
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest ml-2">Số tiền mỗi giờ trễ</label>
                                        <MoneyInput 
                                            value={cat.hourly_surcharge_amount || 0}
                                            onChange={(val) => {
                                                const newCats = [...categories];
                                                newCats[index].hourly_surcharge_amount = val;
                                                setCategories(newCats);
                                            }}
                                            className="h-16 text-xl bg-white border-transparent rounded-[24px] font-black px-6 text-emerald-600"
                                        />
                                    </div>
                                ) : (
                                  <div className="space-y-3">
                                    {(cat.surcharge_rules || []).map((rule, rIndex) => (
                                        <div key={rIndex} className="bg-white p-5 rounded-[24px] border border-emerald-100 relative group">
                                            <div className="flex justify-between items-center mb-4 border-b border-emerald-50 pb-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{rule.type === 'Late' ? 'Quá giờ' : 'Vào sớm'}</span>
                                                <button onClick={() => {
                                                    const newCats = [...categories];
                                                    const newRules = [...(newCats[index].surcharge_rules || [])];
                                                    newRules.splice(rIndex, 1);
                                                    newCats[index].surcharge_rules = newRules;
                                                    setCategories(newCats);
                                                }} className="text-emerald-200 hover:text-rose-500 transition-colors"><Trash2 size={14}/></button>
                                            </div>
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="space-y-1">
                                                    <span className="text-[8px] font-black text-slate-300 uppercase">Từ (phút)</span>
                                                    <input type="number" className="w-full text-center font-black bg-slate-50 rounded-lg py-1.5 text-sm outline-none" value={rule.from_minute} onChange={(e) => {
                                                        const newCats = [...categories];
                                                        const newRules = [...(newCats[index].surcharge_rules || [])];
                                                        newRules[rIndex] = { ...newRules[rIndex], from_minute: Number(e.target.value) };
                                                        newCats[index].surcharge_rules = newRules;
                                                        setCategories(newCats);
                                                    }} />
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[8px] font-black text-slate-300 uppercase">Đến (phút)</span>
                                                    <input type="number" className="w-full text-center font-black bg-slate-50 rounded-lg py-1.5 text-sm outline-none" value={rule.to_minute} onChange={(e) => {
                                                        const newCats = [...categories];
                                                        const newRules = [...(newCats[index].surcharge_rules || [])];
                                                        newRules[rIndex] = { ...newRules[rIndex], to_minute: Number(e.target.value) };
                                                        newCats[index].surcharge_rules = newRules;
                                                        setCategories(newCats);
                                                    }} />
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[8px] font-black text-slate-300 uppercase">Phụ thu %</span>
                                                    <input type="number" className="w-full text-center font-black bg-emerald-50 text-emerald-600 rounded-lg py-1.5 text-sm outline-none" value={rule.percentage} onChange={(e) => {
                                                        const newCats = [...categories];
                                                        const newRules = [...(newCats[index].surcharge_rules || [])];
                                                        newRules[rIndex] = { ...newRules[rIndex], percentage: Number(e.target.value) };
                                                        newCats[index].surcharge_rules = newRules;
                                                        setCategories(newCats);
                                                    }} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <button onClick={() => {
                                        const newCats = [...categories];
                                        const newRules = [...(newCats[index].surcharge_rules || [])];
                                        newRules.push({ type: 'Late', from_minute: 0, to_minute: 60, percentage: 10 });
                                        newCats[index].surcharge_rules = newRules;
                                        setCategories(newCats);
                                    }} className="w-full py-3 bg-white/50 rounded-2xl border border-emerald-100 border-dashed text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:bg-white hover:text-emerald-600 transition-all">+ Thêm mốc phụ thu</button>
                                  </div>
                                )}
                            </div>
                        )}

                        {/* Extra Person Settings */}
                        <div className="bg-white border border-slate-100 p-8 rounded-[32px] shadow-sm space-y-6">
                          <div className="flex items-center justify-between px-2">
                            <div className="space-y-0.5">
                              <p className="text-sm font-black text-slate-900 tracking-tight">Phụ thu quá người</p>
                              <p className="text-[10px] font-bold text-slate-400">Thêm người lớn hoặc trẻ em</p>
                            </div>
                            <Switch 
                              checked={cat.extra_person_enabled}
                              onChange={(checked: boolean) => {
                                  const newCats = [...categories];
                                  newCats[index].extra_person_enabled = checked;
                                  setCategories(newCats);
                              }}
                            />
                          </div>
                          
                          {cat.extra_person_enabled && (
                             <div className="space-y-5 animate-in slide-in-from-top-2">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Người lớn</label>
                                        <MoneyInput 
                                            value={cat.price_extra_adult || 0}
                                            onChange={(val) => {
                                                const newCats = [...categories];
                                                newCats[index].price_extra_adult = val;
                                                setCategories(newCats);
                                            }}
                                            className="h-14 bg-slate-50 border-transparent rounded-2xl font-black text-lg px-4"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2">Trẻ em</label>
                                        <MoneyInput 
                                            value={cat.price_extra_child || 0}
                                            onChange={(val) => {
                                                const newCats = [...categories];
                                                newCats[index].price_extra_child = val;
                                                setCategories(newCats);
                                            }}
                                            className="h-14 bg-slate-50 border-transparent rounded-2xl font-black text-lg px-4"
                                        />
                                    </div>
                                </div>
                             </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <button 
                onClick={handleCreateCategory}
                className="group rounded-[40px] p-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 bg-white/50 hover:bg-white hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-500 min-h-[240px]"
              >
                <div className="w-20 h-20 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shadow-sm mb-6 group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white transition-all duration-500">
                    <Plus size={40} />
                </div>
                <span className="font-black text-lg uppercase tracking-[0.3em] text-slate-300 group-hover:text-blue-500 transition-colors">Thêm hạng phòng mới</span>
              </button>
            </div>
          )}

          {activeTab === 'rooms' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {rooms.map((room) => {
                  const category = categories.find(c => c.id === room.category_id);
                  return (
                    <div key={room.id} className="bg-white/80 backdrop-blur-xl rounded-[40px] p-8 border border-white shadow-[0_10px_40px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.05)] hover:scale-[1.05] transition-all duration-500 group relative overflow-hidden flex flex-col justify-between min-h-[220px]">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50/50 rounded-bl-[100px] -mr-8 -mt-8 opacity-0 group-hover:opacity-100 transition-all duration-700 pointer-events-none" />
                       
                       <div className="relative z-10">
                          <div className="flex justify-between items-start mb-6">
                             <div className="w-16 h-16 bg-slate-900 text-white rounded-[24px] flex items-center justify-center font-black text-2xl shadow-xl shadow-slate-200 group-hover:rotate-6 transition-transform duration-500">
                                {room.name}
                             </div>
                             <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                                <button onClick={() => { setEditingRoom(room); setIsRoomModalOpen(true); }} className="w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-500 rounded-full hover:bg-blue-500 hover:text-white transition-all">
                                    <Edit3 size={16} />
                                </button>
                                <button onClick={() => handleDeleteRoom(room.id)} className="w-10 h-10 flex items-center justify-center bg-rose-50 text-rose-500 rounded-full hover:bg-rose-500 hover:text-white transition-all">
                                    <Trash2 size={16} />
                                </button>
                             </div>
                          </div>

                          <div className="space-y-1">
                             <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Phân loại</p>
                             <h3 className="font-black text-slate-800 text-xl tracking-tight truncate">
                                {category?.name || '---'}
                             </h3>
                          </div>
                       </div>

                       <div className="relative z-10 mt-6 pt-6 border-t border-slate-50 flex items-center justify-between">
                          <span className={cn(
                             "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border",
                             room.status === 'available' ? 'bg-emerald-50 text-emerald-500 border-emerald-100' :
                             room.status === 'occupied' ? 'bg-blue-50 text-blue-500 border-blue-100' :
                             room.status === 'dirty' ? 'bg-amber-50 text-amber-500 border-amber-100' :
                             'bg-slate-50 text-slate-400 border-slate-100'
                          )}>
                             {room.status === 'available' ? 'Sẵn sàng' :
                              room.status === 'occupied' ? 'Đang ở' :
                              room.status === 'dirty' ? 'Chưa dọn' : 'Bảo trì'}
                          </span>
                          <div className="flex items-center gap-1.5 text-slate-200">
                             <div className="w-1.5 h-1.5 rounded-full bg-current" />
                             <div className="w-1.5 h-1.5 rounded-full bg-current" />
                             <div className="w-1.5 h-1.5 rounded-full bg-current" />
                          </div>
                       </div>
                    </div>
                  );
                })}

                <button 
                  onClick={() => { setEditingRoom({ status: 'available' }); setIsRoomModalOpen(true); }}
                  className="group bg-white/50 border-2 border-dashed border-slate-200 rounded-[40px] p-8 flex flex-col items-center justify-center gap-4 hover:bg-white hover:border-slate-900 transition-all duration-500 min-h-[220px]"
                >
                  <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-all duration-500">
                    <Plus size={24} />
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-300 group-hover:text-slate-900 transition-colors">Thêm phòng mới</span>
                </button>
            </div>
          )}
        </div>
      </main>

      {/* Room Modal */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-t-[40px] md:rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden border border-white animate-in slide-in-from-bottom duration-500">
            <div className="p-8 md:p-10 flex justify-between items-center bg-slate-50/50 border-b border-slate-100">
              <div className="space-y-1">
                <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                  {editingRoom?.id ? 'Sửa thông tin phòng' : 'Thêm phòng mới'}
                </h3>
                <p className="text-sm font-bold text-slate-400">Cấu hình định danh và phân loại phòng</p>
              </div>
              <button onClick={() => setIsRoomModalOpen(false)} className="w-12 h-12 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full text-slate-400 border border-slate-100 shadow-sm transition-all">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 md:p-10 space-y-8">
              <div className="space-y-3">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Số phòng / Tên phòng *</label>
                <input
                  autoFocus
                  type="text"
                  value={editingRoom?.name || ''}
                  onChange={(e) => setEditingRoom(prev => ({ ...prev, name: e.target.value, room_number: e.target.value }))}
                  className="w-full h-20 md:h-24 px-8 rounded-[32px] bg-slate-50 border border-transparent font-black text-4xl text-slate-900 outline-none focus:bg-white focus:border-slate-900 focus:ring-4 focus:ring-slate-900/5 transition-all text-center"
                  placeholder="VD: 101"
                />
              </div>

              <div className="space-y-4">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Chọn hạng phòng *</label>
                <div className="grid grid-cols-2 gap-3">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setEditingRoom(prev => ({ ...prev, category_id: cat.id }))}
                      className={cn(
                        "p-6 rounded-[24px] border-2 text-left transition-all relative overflow-hidden group",
                        editingRoom?.category_id === cat.id
                          ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                          : "border-slate-100 bg-slate-50 text-slate-500 hover:bg-white hover:border-slate-200"
                      )}
                    >
                      <div className="font-black text-sm md:text-base tracking-tight truncate">{cat.name}</div>
                      <div className={cn(
                        "mt-1 text-[10px] font-bold uppercase tracking-widest",
                        editingRoom?.category_id === cat.id ? "text-slate-400" : "text-slate-300"
                      )}>
                        {cat.max_adults} Lớn • {cat.max_children} Trẻ
                      </div>
                      {editingRoom?.category_id === cat.id && (
                        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={handleSaveRoom}
                  className="w-full h-18 bg-slate-900 text-white rounded-full font-black uppercase tracking-widest text-[13px] shadow-xl shadow-slate-200 hover:bg-slate-800 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <Save size={18} /> Lưu phòng ngay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MOBILE FLOATING ACTION */}
      {activeTab === 'categories' && (
        <div className="fixed bottom-10 left-0 right-0 px-6 md:hidden z-50">
          <button 
            onClick={handleSaveCategories}
            disabled={saving}
            className="w-full h-18 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-widest text-[13px] shadow-2xl shadow-slate-900/40 flex items-center justify-center gap-3 active:scale-95 transition-all"
          >
            {saving ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Save size={20} />}
            <span>Lưu cấu hình hạng phòng</span>
          </button>
        </div>
      )}
    </div>
  );
}
