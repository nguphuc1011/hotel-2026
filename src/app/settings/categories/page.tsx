'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, BedDouble, Clock, ShieldCheck, Plus, Trash2, Settings2, Copy, LayoutGrid, List, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/controls';
import { settingsService, RoomCategory } from '@/services/settingsService';
import { roomService, Room } from '@/services/roomService';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';

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

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-8 pb-32">
      <div className="max-w-6xl mx-auto">
        {/* Header Navigation */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.back()} className="w-10 h-10 bg-white rounded-full flex items-center justify-center hover:bg-gray-50 shadow-sm border border-black/5">
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Quản lý Phòng & Giá</h1>
            <p className="text-sm text-gray-500 font-medium">Thiết lập hạng phòng, giá và danh sách phòng</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-white rounded-xl shadow-sm border border-gray-100 w-fit mb-8">
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'categories' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <LayoutGrid size={16} />
              <span>Hạng phòng & Giá</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('rooms')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === 'rooms' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <List size={16} />
              <span>Danh sách phòng</span>
            </div>
          </button>
        </div>

        {/* Content Area */}
        <div className="space-y-8 animate-fade-in">
          
          {/* TAB: CATEGORIES */}
          {activeTab === 'categories' && (
            <>
              {categories.map((cat, index) => (
                <div key={cat.id} className="bento-card p-8 relative group">
                  {/* Category Header */}
                  <div className="flex justify-between items-start mb-8 pb-6 border-b border-gray-100">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                        <BedDouble size={24} />
                      </div>
                      <div className="flex-1 max-w-md">
                        <input 
                          value={cat.name}
                          onChange={(e) => {
                            const newCats = [...categories];
                            newCats[index].name = e.target.value;
                            setCategories(newCats);
                          }}
                          className="text-xl font-black bg-transparent border-none focus:outline-none focus:ring-0 p-0 w-full"
                          placeholder="Tên hạng phòng"
                        />
                        <div className="flex items-center gap-4 mt-2">
                           <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg">
                              <Users size={12} className="text-gray-400"/>
                              <span className="text-xs font-bold text-gray-500">Người lớn:</span>
                              <input 
                                type="number" 
                                className="w-10 text-xs font-bold bg-transparent border-none text-center focus:outline-none"
                                value={cat.max_adults}
                                onChange={(e) => {
                                  const newCats = [...categories];
                                  newCats[index].max_adults = Number(e.target.value);
                                  setCategories(newCats);
                                }}
                              />
                           </div>
                           <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-lg">
                              <Users size={12} className="text-gray-400"/>
                              <span className="text-xs font-bold text-gray-500">Trẻ em:</span>
                              <input 
                                type="number" 
                                className="w-10 text-xs font-bold bg-transparent border-none text-center focus:outline-none"
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
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleCopyCategory(cat)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500" title="Sao chép">
                        <Copy size={18} />
                      </button>
                      <button onClick={() => handleDeleteCategory(cat.id)} className="p-2 hover:bg-red-50 rounded-full text-red-500" title="Xóa">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Configuration Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    
                    {/* Column 1: Hourly Pricing (Block Logic) */}
                    <div className="space-y-5">
                      <h3 className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2 pb-2 border-b border-gray-100">
                        <Clock size={14} /> Giá Theo Giờ (Block)
                      </h3>
                      
                      <div className="space-y-4">
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                            <div className="text-xs font-bold text-blue-700 uppercase mb-3 border-b border-blue-200 pb-1">Block Đầu Tiên</div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 block mb-1">Thời gian (Giờ)</label>
                                    <input 
                                        type="number"
                                        className="w-full text-center font-bold bg-white border border-blue-200 rounded-lg p-2 text-sm focus:outline-none focus:border-blue-500"
                                        value={cat.base_hourly_limit || 1}
                                        onChange={(e) => {
                                            const newCats = [...categories];
                                            newCats[index].base_hourly_limit = Number(e.target.value);
                                            setCategories(newCats);
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 block mb-1">Giá tiền</label>
                                    <MoneyInput 
                                        value={cat.price_hourly}
                                        onChange={(val) => {
                                            const newCats = [...categories];
                                            newCats[index].price_hourly = val;
                                            setCategories(newCats);
                                        }}
                                        className="bg-white border-blue-200 h-[38px]"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <div className="text-xs font-bold text-gray-600 uppercase mb-3 border-b border-gray-200 pb-1">Block Tiếp Theo</div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 block mb-1">Thời gian (Phút)</label>
                                    <input 
                                        type="number"
                                        className="w-full text-center font-bold bg-white border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-gray-500"
                                        value={cat.hourly_unit || 60}
                                        onChange={(e) => {
                                            const newCats = [...categories];
                                            newCats[index].hourly_unit = Number(e.target.value);
                                            setCategories(newCats);
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 block mb-1">Giá tiền</label>
                                    <MoneyInput 
                                        value={cat.price_next_hour}
                                        onChange={(val) => {
                                            const newCats = [...categories];
                                            newCats[index].price_next_hour = val;
                                            setCategories(newCats);
                                        }}
                                        className="bg-white h-[38px]"
                                    />
                                </div>
                            </div>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Daily & Overnight */}
                    <div className="space-y-5">
                      <h3 className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2 pb-2 border-b border-gray-100">
                        <Settings2 size={14} /> Giá Ngày & Qua Đêm
                      </h3>
                      
                      <div className="space-y-4">
                        <div className="p-4 rounded-xl border border-gray-100 bg-white shadow-sm">
                          <label className="text-xs font-bold text-gray-500 mb-2 block uppercase">Giá Theo Ngày</label>
                          <MoneyInput 
                            value={cat.price_daily}
                            onChange={(val) => {
                               const newCats = [...categories];
                               newCats[index].price_daily = val;
                               setCategories(newCats);
                            }}
                          />
                        </div>

                        <div className="p-4 rounded-xl border border-gray-100 bg-white shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">Giá Qua Đêm</label>
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
                                />
                            )}
                        </div>
                      </div>
                    </div>

                    {/* Column 3: Surcharges */}
                    <div className="space-y-5">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <h3 className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
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
                            <div className="bg-white border border-gray-100 p-4 rounded-xl shadow-sm animate-in slide-in-from-top-2">
                                <div className="space-y-4">
                                    <div className="flex bg-gray-50 p-1 rounded-lg">
                                        <button
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                                                (cat.surcharge_mode || 'amount') === 'amount'
                                                ? 'bg-white text-blue-600 shadow-sm'
                                                : 'text-gray-400 hover:text-gray-600'
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
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                                                cat.surcharge_mode === 'percent'
                                                ? 'bg-white text-blue-600 shadow-sm'
                                                : 'text-gray-400 hover:text-gray-600'
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
                                        <div className="flex flex-col gap-1 mt-3">
                                            <label className="text-[10px] font-bold text-gray-400">Số tiền mỗi giờ</label>
                                            <MoneyInput 
                                                value={cat.hourly_surcharge_amount || 0}
                                                onChange={(val) => {
                                                    const newCats = [...categories];
                                                    newCats[index].hourly_surcharge_amount = val;
                                                    setCategories(newCats);
                                                }}
                                                className="h-10 text-sm bg-gray-50 border-gray-200"
                                            />
                                        </div>
                                    )}

                                    {cat.surcharge_mode === 'percent' && (
                                        <div className="mt-3 space-y-3">
                                            <div className="space-y-2">
                                                {(cat.surcharge_rules || []).map((rule, rIndex) => (
                                                    <div key={rIndex} className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 relative group hover:border-blue-200 transition-colors">
                                                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200 border-dashed">
                                                            <select 
                                                                className="text-[10px] font-bold bg-white border border-gray-200 rounded px-1.5 py-0.5 text-blue-600 focus:outline-none focus:border-blue-300"
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
                                                                className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                                            >
                                                                <Trash2 size={12}/>
                                                            </button>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <div>
                                                                <label className="text-[9px] text-gray-400 font-bold block mb-1">Từ (phút)</label>
                                                                <input 
                                                                    type="number" 
                                                                    className="w-full text-center text-xs font-bold bg-white border border-gray-200 rounded p-1.5 focus:outline-none focus:border-blue-400"
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
                                                                <label className="text-[9px] text-gray-400 font-bold block mb-1">Đến (phút)</label>
                                                                <input 
                                                                    type="number" 
                                                                    className="w-full text-center text-xs font-bold bg-white border border-gray-200 rounded p-1.5 focus:outline-none focus:border-blue-400"
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
                                                                <label className="text-[9px] text-gray-400 font-bold block mb-1">Phụ thu %</label>
                                                                <div className="relative">
                                                                    <input 
                                                                        type="number" 
                                                                        className="w-full text-center text-xs font-bold bg-white border border-gray-200 rounded p-1.5 focus:outline-none focus:border-blue-400 pr-3"
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
                                                className="w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 border-dashed transition-all"
                                            >
                                                <Plus size={14} /> Thêm mốc phụ thu
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Extra Person */}
                        <div className="bg-white border border-gray-100 p-4 rounded-xl shadow-sm">
                          <div className="flex items-center justify-between mb-3 border-b border-gray-50 pb-2">
                            <span className="text-xs font-bold text-gray-700 uppercase">Phụ thu quá người</span>
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
                            <div className="grid grid-cols-2 gap-3 animate-in slide-in-from-top-2">
                               <div>
                                  <label className="text-[10px] font-bold text-gray-400 mb-1 block">Người lớn</label>
                                  <MoneyInput 
                                    value={cat.price_extra_adult}
                                    onChange={(val) => {
                                       const newCats = [...categories];
                                       newCats[index].price_extra_adult = val;
                                       setCategories(newCats);
                                    }}
                                    className="h-10 text-sm bg-gray-50 border-gray-200"
                                  />
                               </div>
                               <div>
                                  <label className="text-[10px] font-bold text-gray-400 mb-1 block">Trẻ em</label>
                                  <MoneyInput 
                                    value={cat.price_extra_child}
                                    onChange={(val) => {
                                       const newCats = [...categories];
                                       newCats[index].price_extra_child = val;
                                       setCategories(newCats);
                                    }}
                                    className="h-10 text-sm bg-gray-50 border-gray-200"
                                  />
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
                className="bento-card p-8 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-white hover:border-blue-200 cursor-pointer min-h-[200px] text-gray-400 hover:text-blue-500 transition-colors"
              >
                <Plus size={40} className="mb-2" />
                <span className="font-bold uppercase tracking-widest">Thêm hạng phòng mới</span>
              </div>
              
              <div className="sticky bottom-8 flex justify-end">
                <button 
                  onClick={handleSaveCategories}
                  disabled={saving}
                  className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-500/30 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </>
          )}

          {/* TAB: ROOMS */}
          {activeTab === 'rooms' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Danh sách phòng</h2>
                <button
                  onClick={() => {
                    setEditingRoom({ status: 'available' });
                    setIsRoomModalOpen(true);
                  }}
                  className="bg-black text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 flex items-center gap-2"
                >
                  <Plus size={16} /> Thêm phòng
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map((room) => (
                  <div key={room.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-lg font-black text-gray-800">{room.room_number || room.name}</div>
                        <div className="text-sm text-gray-500">{room.category?.name || 'Chưa phân loại'}</div>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                        room.status === 'available' ? 'bg-green-100 text-green-700' :
                        room.status === 'occupied' ? 'bg-red-100 text-red-700' :
                        room.status === 'dirty' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {room.status === 'available' ? 'Sẵn sàng' :
                         room.status === 'occupied' ? 'Đang ở' :
                         room.status === 'dirty' ? 'Chưa dọn' : 'Bảo trì'}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-gray-400 mt-auto pt-4 border-t border-gray-50">
                      <div>Tầng: <span className="text-gray-600 font-bold">{room.floor || '-'}</span></div>
                      <div className="ml-auto flex gap-2">
                        <button 
                          onClick={() => {
                            setEditingRoom(room);
                            setIsRoomModalOpen(true);
                          }}
                          className="text-blue-600 font-bold hover:underline"
                        >
                          Sửa
                        </button>
                        <button 
                          onClick={() => handleDeleteRoom(room.id)}
                          className="text-red-600 font-bold hover:underline"
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Room Modal */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-black mb-6">
              {editingRoom?.id ? 'Cập nhật phòng' : 'Thêm phòng mới'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-gray-500 mb-1 block">Số phòng</label>
                <input
                  className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500 font-bold"
                  value={editingRoom?.room_number || editingRoom?.name || ''}
                  onChange={e => setEditingRoom(prev => ({ ...prev, room_number: e.target.value, name: e.target.value }))}
                  placeholder="Ví dụ: 101"
                />
              </div>
              
              <div>
                <label className="text-sm font-bold text-gray-500 mb-1 block">Hạng phòng</label>
                <select
                  className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500"
                  value={editingRoom?.category_id || ''}
                  onChange={e => setEditingRoom(prev => ({ ...prev, category_id: e.target.value }))}
                >
                  <option value="">-- Chọn hạng phòng --</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-bold text-gray-500 mb-1 block">Tầng</label>
                  <input
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500"
                    value={editingRoom?.floor || ''}
                    onChange={e => setEditingRoom(prev => ({ ...prev, floor: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-500 mb-1 block">Trạng thái</label>
                  <select
                    className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500"
                    value={editingRoom?.status || 'available'}
                    onChange={e => setEditingRoom(prev => ({ ...prev, status: e.target.value as any }))}
                  >
                    <option value="available">Sẵn sàng</option>
                    <option value="occupied">Đang ở</option>
                    <option value="dirty">Chưa dọn</option>
                    <option value="repair">Bảo trì</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-gray-500 mb-1 block">Ghi chú</label>
                <textarea
                  className="w-full p-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-blue-500"
                  value={editingRoom?.notes || ''}
                  onChange={e => setEditingRoom(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setIsRoomModalOpen(false)}
                className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveRoom}
                className="flex-1 py-3 font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
