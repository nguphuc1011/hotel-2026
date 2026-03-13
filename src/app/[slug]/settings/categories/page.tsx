'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, BedDouble, Clock, ShieldCheck, Plus, Trash2, Settings2, Copy, LayoutGrid, List, Users, Save, Edit3 } from 'lucide-react';
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
        price_overnight_late_hour: 12, // Default 12:00
        auto_surcharge_enabled: true,
        surcharge_mode: 'amount', // Default to amount for safety
        hourly_surcharge_amount: 50000,
        extra_person_enabled: true,
        extra_person_method: 'fixed',
        price_extra_adult: 100000,
        price_extra_child: 50000
      };
      await settingsService.createRoomCategory(newCat);
      await fetchData();
      toast.success('Đã tạo hạng phòng mới thành công');
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('Có lỗi xảy ra khi tạo hạng phòng.');
    }
  };

  const handleCopyCategory = async (category: RoomCategory) => {
    try {
      const { id, ...rest } = category;
      const newCat: Partial<RoomCategory> = {
        ...rest,
        name: `Bản sao của ${category.name}`,
      };
      await settingsService.createRoomCategory(newCat);
      await fetchData();
      toast.success('Đã sao chép hạng phòng thành công');
    } catch (error) {
      console.error('Error copying category:', error);
      toast.error('Có lỗi xảy ra khi sao chép hạng phòng.');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const isConfirmed = await confirmDialog({
      title: 'Xóa hạng phòng',
      message: 'Bạn có chắc chắn muốn xóa hạng phòng này không?',
      type: 'confirm'
    });
    if (!isConfirmed) return;
    
    try {
        await settingsService.deleteRoomCategory(id);
        await fetchData();
        toast.success('Đã xóa hạng phòng thành công');
    } catch (error) {
        console.error('Error deleting category:', error);
        toast.error('Có lỗi xảy ra khi xóa hạng phòng.');
    }
  };

  const handleSaveCategories = async () => {
    setSaving(true);
    try {
      await Promise.all(
        categories.map(c => settingsService.updateRoomCategory(c.id, c))
      );
      toast.success('Đã lưu cấu hình hạng phòng thành công!');
      await fetchData();
    } catch (error) {
      console.error('Failed to save categories:', error);
      toast.error('Có lỗi xảy ra khi lưu cấu hình.');
    } finally {
      setSaving(false);
    }
  };

  // --- Room Handlers ---
  const handleSaveRoom = async () => {
    if (!editingRoom) return;
    
    // Validation
    if (!editingRoom.room_number && !editingRoom.name) {
      toast.error('Vui lòng nhập số phòng!');
      return;
    }
    if (!editingRoom.category_id) {
      toast.error('Vui lòng chọn hạng phòng!');
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
        toast.error('Lưu thất bại. Vui lòng kiểm tra lại thông tin (trùng số phòng hoặc lỗi hệ thống).');
        return;
      }

      setIsRoomModalOpen(false);
      setEditingRoom(null);
      await fetchData();
      toast.success('Đã lưu phòng thành công');
    } catch (error) {
      console.error('Error saving room:', error);
      toast.error('Có lỗi xảy ra khi lưu phòng. Vui lòng kiểm tra lại.');
    }
  };

  const handleDeleteRoom = async (id: string) => {
    const isConfirmed = await confirmDialog({
      title: 'Xóa phòng',
      message: 'Bạn có chắc chắn muốn xóa phòng này không?',
      type: 'confirm'
    });
    if (!isConfirmed) return;
    
    try {
      await roomService.deleteRoom(id);
      await fetchData();
      toast.success('Đã xóa phòng thành công');
    } catch (error) {
      console.error('Error deleting room:', error);
      toast.error('Có lỗi xảy ra khi xóa phòng.');
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]"><div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full"></div></div>;

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-8 pb-40 font-sans">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 md:mb-12">
          <div className="space-y-2">
            <button 
              onClick={() => router.back()}
              className="group flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-4 font-bold"
            >
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center group-hover:border-slate-300 group-hover:bg-slate-50 transition-all">
                <ChevronLeft size={16} />
              </div>
              <span className="text-xs font-black uppercase tracking-widest">Quay lại</span>
            </button>
            <div className="flex items-center gap-4 mb-2">
               <div className="w-14 h-14 rounded-2xl bg-slate-200 text-slate-700 flex items-center justify-center shadow-sm">
                 <LayoutGrid size={28} />
               </div>
               <div>
                  <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                    Quản lý Phòng
                  </h1>
                  <p className="text-slate-500 font-medium text-base md:text-lg mt-1">
                    Thiết lập hạng phòng, giá và danh sách phòng
                  </p>
               </div>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-3">
            {activeTab === 'categories' && (
              <button 
                onClick={handleSaveCategories}
                disabled={saving}
                className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-lg shadow-slate-900/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Save size={20} />}
                <span>Lưu thay đổi</span>
              </button>
            )}
            {activeTab === 'rooms' && (
              <button
                onClick={() => {
                  setEditingRoom({ status: 'available' });
                  setIsRoomModalOpen(true);
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-lg shadow-slate-900/20 active:scale-95 transition-all"
              >
                <Plus size={20} />
                <span>Thêm phòng</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabs & Mobile Actions */}
        <div className="flex flex-col gap-4">
          <div className="bg-white p-1.5 rounded-[24px] shadow-sm border border-slate-100 inline-flex gap-1 w-full md:w-auto overflow-x-auto">
            <button
              onClick={() => setActiveTab('categories')}
              className={cn(
                "px-6 py-3 rounded-[20px] font-bold text-sm flex items-center justify-center gap-2 transition-all whitespace-nowrap flex-1 md:flex-none",
                activeTab === 'categories' 
                  ? "bg-slate-900 text-white shadow-md" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <LayoutGrid size={18} strokeWidth={2.5} />
              Hạng phòng & Giá
            </button>
            <button
              onClick={() => setActiveTab('rooms')}
              className={cn(
                "px-6 py-3 rounded-[20px] font-bold text-sm flex items-center justify-center gap-2 transition-all whitespace-nowrap flex-1 md:flex-none",
                activeTab === 'rooms' 
                  ? "bg-slate-900 text-white shadow-md" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <List size={18} strokeWidth={2.5} />
              Danh sách phòng
            </button>
          </div>

          {/* Mobile "Add Room" button below tabs */}
          {activeTab === 'rooms' && (
            <button
              onClick={() => {
                setEditingRoom({ status: 'available' });
                setIsRoomModalOpen(true);
              }}
              className="md:hidden w-full py-4 bg-white border border-slate-200 text-slate-900 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all"
            >
              <Plus size={20} />
              <span>Thêm phòng mới</span>
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="space-y-8 animate-fade-in">
          
          {/* TAB: CATEGORIES */}
          {activeTab === 'categories' && (
            <>
              {categories.map((cat, index) => (
                <div key={cat.id} className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-[100px] -mr-8 -mt-8 opacity-50 group-hover:scale-110 transition-transform duration-500" />
                  
                  {/* Category Header */}
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 relative">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-16 h-16 bg-blue-50 rounded-[24px] flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                        <BedDouble size={32} strokeWidth={2} />
                      </div>
                      <div className="flex-1 max-w-lg space-y-2">
                        <div className="relative group/input">
                            <input 
                              value={cat.name}
                              onChange={(e) => {
                                const newCats = [...categories];
                                newCats[index].name = e.target.value;
                                setCategories(newCats);
                              }}
                              className="text-2xl font-black bg-transparent border-none focus:outline-none focus:ring-0 p-0 w-full text-slate-900 placeholder:text-slate-300"
                              placeholder="Tên hạng phòng"
                            />
                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-slate-100 group-focus-within/input:bg-blue-500 transition-colors" />
                        </div>
                        
                        <div className="flex items-center gap-4">
                           <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200">
                              <Users size={14} className="text-slate-400"/>
                              <span className="text-xs font-bold text-slate-500 uppercase">Người lớn:</span>
                              <input 
                                type="number" 
                                className="w-10 text-sm font-bold bg-transparent border-none text-center focus:outline-none text-slate-900"
                                value={cat.max_adults}
                                onChange={(e) => {
                                  const newCats = [...categories];
                                  newCats[index].max_adults = Number(e.target.value);
                                  setCategories(newCats);
                                }}
                              />
                           </div>
                           <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200">
                              <Users size={14} className="text-slate-400"/>
                              <span className="text-xs font-bold text-slate-500 uppercase">Trẻ em:</span>
                              <input 
                                type="number" 
                                className="w-10 text-sm font-bold bg-transparent border-none text-center focus:outline-none text-slate-900"
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
                      <button onClick={() => handleCopyCategory(cat)} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-all" title="Sao chép">
                        <Copy size={18} />
                      </button>
                      <button onClick={() => handleDeleteCategory(cat.id)} className="w-10 h-10 flex items-center justify-center bg-red-50 hover:bg-red-100 rounded-full text-red-500 transition-all" title="Xóa">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Configuration Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative">
                    
                    {/* Column 1: Hourly Pricing (Block Logic) */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-100">
                        <Clock size={14} /> Giá Theo Giờ (Block)
                      </h3>
                      
                      <div className="space-y-4">
                        <div className="bg-slate-50/50 p-5 rounded-[24px] border border-slate-100 space-y-3">
                            <div className="text-xs font-bold text-slate-500 uppercase">Block Đầu Tiên</div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Thời gian (Giờ)</label>
                                    <input 
                                        type="number"
                                        className="w-full text-center font-bold bg-slate-50 border border-slate-200 rounded-2xl p-2.5 text-sm focus:outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100 transition-all text-slate-900"
                                        value={cat.base_hourly_limit || 1}
                                        onChange={(e) => {
                                            const newCats = [...categories];
                                            newCats[index].base_hourly_limit = Number(e.target.value);
                                            setCategories(newCats);
                                        }}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Giá tiền</label>
                                    <MoneyInput 
                                        value={cat.price_hourly}
                                        onChange={(val) => {
                                            const newCats = [...categories];
                                            newCats[index].price_hourly = val;
                                            setCategories(newCats);
                                        }}
                                        className="bg-slate-50 border-slate-200 h-[42px] rounded-2xl text-sm focus:ring-4 focus:ring-slate-100 transition-all px-3 flex items-center"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-5 rounded-[24px] border border-slate-200 space-y-3">
                            <div className="text-xs font-bold text-slate-500 uppercase">Block Tiếp Theo</div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Thời gian (Phút)</label>
                                    <input 
                                        type="number"
                                        className="w-full text-center font-bold bg-slate-50 border border-slate-200 rounded-2xl p-2.5 text-sm focus:outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100 transition-all text-slate-900"
                                        value={cat.hourly_unit || 60}
                                        onChange={(e) => {
                                            const newCats = [...categories];
                                            newCats[index].hourly_unit = Number(e.target.value);
                                            setCategories(newCats);
                                        }}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Giá tiền</label>
                                    <MoneyInput 
                                        value={cat.price_next_hour}
                                        onChange={(val) => {
                                            const newCats = [...categories];
                                            newCats[index].price_next_hour = val;
                                            setCategories(newCats);
                                        }}
                                        className="bg-slate-50 h-[42px] rounded-2xl text-sm border-slate-200 focus:ring-4 focus:ring-slate-100 transition-all px-3 flex items-center"
                                    />
                                </div>
                            </div>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Daily & Overnight */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-slate-100">
                        <Settings2 size={14} /> Giá Ngày & Qua Đêm
                      </h3>
                      
                      <div className="space-y-4">
                        <div className="p-5 rounded-[24px] border border-slate-200 bg-white shadow-sm space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase block">Giá Theo Ngày</label>
                          <MoneyInput 
                            value={cat.price_daily}
                            onChange={(val) => {
                               const newCats = [...categories];
                               newCats[index].price_daily = val;
                               setCategories(newCats);
                            }}
                            className="h-[56px] text-lg rounded-2xl bg-slate-50 border-slate-200 focus:ring-4 focus:ring-slate-100 transition-all px-4 flex items-center"
                          />
                        </div>

                        <div className="p-5 rounded-[24px] border border-slate-200 bg-white shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-slate-500 uppercase">Giá Qua Đêm</label>
                                <Switch 
                                    checked={cat.overnight_enabled ?? true}
                                    onChange={(checked: boolean) => {
                                        const newCats = [...categories];
                                        newCats[index].overnight_enabled = checked;
                                        setCategories(newCats);
                                    }}
                                />
                            </div>
                            {cat.overnight_enabled !== false && (
                                <MoneyInput 
                                    value={cat.price_overnight}
                                    onChange={(val) => {
                                        const newCats = [...categories];
                                        newCats[index].price_overnight = val;
                                        setCategories(newCats);
                                    }}
                                    className="h-[56px] text-lg rounded-2xl bg-slate-50 border-slate-200 focus:ring-4 focus:ring-slate-100 transition-all px-4 flex items-center"
                                />
                            )}
                        </div>
                      </div>
                    </div>

                    {/* Column 3: Surcharges */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                          <ShieldCheck size={14} /> Phụ Thu
                        </h3>
                        <Switch 
                          checked={cat.auto_surcharge_enabled ?? false}
                          onChange={(checked: boolean) => {
                              const newCats = [...categories];
                              newCats[index].auto_surcharge_enabled = checked;
                              setCategories(newCats);
                          }}
                        />
                      </div>
                      
                      <div className="space-y-4">
                         {/* Auto Surcharge Settings */}
                        {cat.auto_surcharge_enabled && (
                            <div className="bg-white border border-slate-200 p-5 rounded-[24px] shadow-sm animate-in slide-in-from-top-2">
                                <div className="space-y-4">
                                    <div className="flex bg-slate-50 p-1.5 rounded-2xl">
                                        <button
                                            className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                                                (cat.surcharge_mode || 'amount') === 'amount'
                                                ? 'bg-white text-slate-900 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-600'
                                            }`}
                                            onClick={() => {
                                                const newCats = [...categories];
                                                newCats[index].surcharge_mode = 'amount';
                                                setCategories(newCats);
                                            }}
                                        >
                                            Theo tiền
                                        </button>
                                        <button
                                            className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                                                cat.surcharge_mode === 'percent'
                                                ? 'bg-white text-slate-900 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-600'
                                            }`}
                                            onClick={() => {
                                                const newCats = [...categories];
                                                newCats[index].surcharge_mode = 'percent';
                                                // Initialize rules if empty
                                                if (!newCats[index].surcharge_rules || newCats[index].surcharge_rules.length === 0) {
                                                    newCats[index].surcharge_rules = [{
                                                        type: 'Late',
                                                        from_minute: 0,
                                                        to_minute: 60,
                                                        percentage: 10
                                                    }];
                                                }
                                                setCategories(newCats);
                                            }}
                                        >
                                            Theo %
                                        </button>
                                    </div>
                                    
                                    {(cat.surcharge_mode || 'amount') === 'amount' && (
                                        <div className="space-y-1 mt-3">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Số tiền mỗi giờ</label>
                                            <MoneyInput 
                                                value={cat.hourly_surcharge_amount || 0}
                                                onChange={(val) => {
                                                    const newCats = [...categories];
                                                    newCats[index].hourly_surcharge_amount = val;
                                                    setCategories(newCats);
                                                }}
                                                className="h-12 text-sm bg-slate-50 border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 transition-all"
                                            />
                                        </div>
                                    )}

                                    {cat.surcharge_mode === 'percent' && (
                                        <div className="mt-3 space-y-3">
                                            <div className="space-y-2">
                                                {(cat.surcharge_rules || []).map((rule, rIndex) => (
                                                    <div key={rIndex} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 relative group hover:border-slate-300 transition-colors">
                                                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200 border-dashed">
                                                            <select 
                                                                className="text-[10px] font-black uppercase tracking-wider bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-none focus:border-slate-300"
                                                                value={rule.type}
                                                                onChange={(e) => {
                                                                    const newCats = [...categories];
                                                                    const newRules = [...(newCats[index].surcharge_rules || [])];
                                                                    newRules[rIndex] = { ...newRules[rIndex], type: e.target.value as 'Early' | 'Late' };
                                                                    newCats[index].surcharge_rules = newRules;
                                                                    setCategories(newCats);
                                                                }}
                                                            >
                                                                <option value="Late">Quá giờ (Late)</option>
                                                                <option value="Early">Vào sớm (Early)</option>
                                                            </select>
                                                            <button 
                                                                onClick={() => {
                                                                    const newCats = [...categories];
                                                                    const newRules = [...(newCats[index].surcharge_rules || [])];
                                                                    newRules.splice(rIndex, 1);
                                                                    newCats[index].surcharge_rules = newRules;
                                                                    setCategories(newCats);
                                                                }}
                                                                className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                                            >
                                                                <Trash2 size={12}/>
                                                            </button>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <div>
                                                                <label className="text-[9px] text-slate-400 font-bold block mb-1">Từ (phút)</label>
                                                                <input 
                                                                    type="number" 
                                                                    className="w-full text-center text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl p-2 focus:outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                                                                    value={rule.from_minute}
                                                                    onChange={(e) => {
                                                                        const newCats = [...categories];
                                                                        const newRules = [...(newCats[index].surcharge_rules || [])];
                                                                        newRules[rIndex] = { ...newRules[rIndex], from_minute: Number(e.target.value) };
                                                                        newCats[index].surcharge_rules = newRules;
                                                                        setCategories(newCats);
                                                                    }}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[9px] text-slate-400 font-bold block mb-1">Đến (phút)</label>
                                                                <input 
                                                                    type="number" 
                                                                    className="w-full text-center text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl p-2 focus:outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                                                                    value={rule.to_minute}
                                                                    onChange={(e) => {
                                                                        const newCats = [...categories];
                                                                        const newRules = [...(newCats[index].surcharge_rules || [])];
                                                                        newRules[rIndex] = { ...newRules[rIndex], to_minute: Number(e.target.value) };
                                                                        newCats[index].surcharge_rules = newRules;
                                                                        setCategories(newCats);
                                                                    }}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[9px] text-slate-400 font-bold block mb-1">Phụ thu %</label>
                                                                <div className="relative">
                                                                    <input 
                                                                        type="number" 
                                                                        className="w-full text-center text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl p-2 focus:outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100 pr-3"
                                                                        value={rule.percentage}
                                                                        onChange={(e) => {
                                                                            const newCats = [...categories];
                                                                            const newRules = [...(newCats[index].surcharge_rules || [])];
                                                                            newRules[rIndex] = { ...newRules[rIndex], percentage: Number(e.target.value) };
                                                                            newCats[index].surcharge_rules = newRules;
                                                                            setCategories(newCats);
                                                                        }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            
                                            <button 
                                                onClick={() => {
                                                    const newCats = [...categories];
                                                    const newRules = [...(newCats[index].surcharge_rules || [])];
                                                    newRules.push({
                                                        type: 'Late', 
                                                        from_minute: 0,
                                                        to_minute: 60,
                                                        percentage: 10
                                                    });
                                                    newCats[index].surcharge_rules = newRules;
                                                    setCategories(newCats);
                                                }}
                                                className="w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 border-dashed transition-all"
                                            >
                                                <Plus size={14} /> Thêm mốc phụ thu
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Extra Person */}
                        <div className="bg-white border border-slate-200 p-5 rounded-[24px] shadow-sm">
                          <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
                            <span className="text-xs font-bold text-slate-700 uppercase">Phụ thu quá người</span>
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
                             <div className="space-y-3 animate-in slide-in-from-top-2">
                                <div className="flex bg-slate-50 p-1.5 rounded-2xl">
                                    <button
                                        className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                                            (cat.extra_person_method || 'fixed') === 'fixed'
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                        onClick={() => {
                                            const newCats = [...categories];
                                            newCats[index].extra_person_method = 'fixed';
                                            setCategories(newCats);
                                        }}
                                    >
                                        Theo tiền
                                    </button>
                                    <button
                                        className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                                            cat.extra_person_method === 'percent'
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-400 hover:text-slate-600'
                                        }`}
                                        onClick={() => {
                                            const newCats = [...categories];
                                            newCats[index].extra_person_method = 'percent';
                                            setCategories(newCats);
                                        }}
                                    >
                                        Theo %
                                    </button>
                                </div>
                                
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Người lớn</label>
                                        <MoneyInput 
                                            value={cat.price_extra_adult || 0}
                                            onChange={(val) => {
                                                const newCats = [...categories];
                                                newCats[index].price_extra_adult = val;
                                                setCategories(newCats);
                                            }}
                                            className="h-12 text-sm bg-white border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Trẻ em</label>
                                        <MoneyInput 
                                            value={cat.price_extra_child || 0}
                                            onChange={(val) => {
                                                const newCats = [...categories];
                                                newCats[index].price_extra_child = val;
                                                setCategories(newCats);
                                            }}
                                            className="h-12 text-sm bg-white border-slate-200 rounded-2xl focus:ring-4 focus:ring-slate-100 transition-all"
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

              <div 
                onClick={handleCreateCategory}
                className="rounded-[32px] p-8 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-white hover:border-blue-200 cursor-pointer min-h-[200px] text-slate-400 hover:text-blue-500 transition-all"
              >
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-sm mb-4">
                    <Plus size={32} />
                </div>
                <span className="font-bold uppercase tracking-widest">Thêm hạng phòng mới</span>
              </div>
            </>
          )}

          {/* TAB: ROOMS */}
          {activeTab === 'rooms' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {rooms.map((room) => {
                  const category = categories.find(c => c.id === room.category_id);
                  return (
                    <div key={room.id} className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 hover:shadow-md transition-all relative group overflow-hidden">
                       <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-bl-[80px] -mr-6 -mt-6 transition-transform duration-500 group-hover:scale-110" />
                       
                       <div className="relative">
                          <div className="flex justify-between items-start mb-4">
                             <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-700 font-black text-xl shadow-sm border border-slate-100">
                                {room.name}
                             </div>
                             <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => {
                                        setEditingRoom(room);
                                        setIsRoomModalOpen(true);
                                    }}
                                    className="w-8 h-8 flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full transition-colors"
                                >
                                    <Edit3 size={14} />
                                </button>
                                <button 
                                    onClick={() => handleDeleteRoom(room.id)}
                                    className="w-8 h-8 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-600 rounded-full transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                             </div>
                          </div>

                          <div className="space-y-1">
                             <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Hạng phòng</h3>
                             <p className="font-bold text-slate-900 text-lg truncate">
                                {category?.name || 'Chưa phân loại'}
                             </p>
                          </div>

                          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                             <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                                room.status === 'available' ? 'bg-emerald-100 text-emerald-700' :
                                room.status === 'occupied' ? 'bg-blue-100 text-blue-700' :
                                room.status === 'dirty' ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-700'
                             }`}>
                                {room.status === 'available' ? 'Sẵn sàng' :
                                 room.status === 'occupied' ? 'Đang có khách' :
                                 room.status === 'dirty' ? 'Chưa dọn' : 'Bảo trì'}
                             </span>
                          </div>
                       </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Room Modal */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-black text-slate-900">
                {editingRoom?.id ? 'Chỉnh sửa phòng' : 'Thêm phòng mới'}
              </h3>
              <button onClick={() => setIsRoomModalOpen(false)} className="w-12 h-12 rounded-full bg-slate-200/50 flex items-center justify-center hover:bg-slate-200 transition-colors">
                <Plus size={20} className="rotate-45 text-slate-500" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Số phòng</label>
                <input
                  autoFocus
                  type="text"
                  value={editingRoom?.name || ''}
                  onChange={(e) => setEditingRoom(prev => ({ ...prev, name: e.target.value, room_number: e.target.value }))}
                  className="w-full h-14 px-4 rounded-2xl bg-slate-50 border border-slate-200 font-black text-2xl text-slate-900 focus:outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100 transition-all placeholder:text-slate-300"
                  placeholder="Example: 101"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hạng phòng</label>
                <div className="grid grid-cols-2 gap-3">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setEditingRoom(prev => ({ ...prev, category_id: cat.id }))}
                      className={cn(
                        "p-4 rounded-2xl border-2 text-left transition-all relative overflow-hidden",
                        editingRoom?.category_id === cat.id
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-100 bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      <div className="font-bold text-sm truncate">{cat.name}</div>
                      {editingRoom?.category_id === cat.id && (
                        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={handleSaveRoom}
                  className="w-full h-14 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 active:scale-95"
                >
                  Lưu thông tin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Fixed Footer */}
      {activeTab === 'categories' && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-slate-100 md:hidden z-50">
          <button 
            onClick={handleSaveCategories}
            disabled={saving}
            className="w-full h-14 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-slate-900/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Save size={20} />}
            <span>Lưu thay đổi</span>
          </button>
        </div>
      )}
    </div>
  );
}
