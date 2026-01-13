'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, Sun, Moon, Clock, ShieldCheck, Percent, Settings2, Plus } from 'lucide-react';
import { BentoCard } from '@/components/ui/BentoCard';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/controls';
import { settingsService, Settings, RoomCategory } from '@/services/settingsService';
import { cn } from '@/lib/utils';
import { SegmentedControl } from '@/components/ui/controls';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';

export default function PricingPage() {
  const { confirm } = useGlobalDialog();
  const router = useRouter();
  const [subTab, setSubTab] = useState('times');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [settings, setSettings] = useState<Settings | null>(null);
  const [categories, setCategories] = useState<RoomCategory[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log('Fetching data...');
      const [sData, cData] = await Promise.all([
        settingsService.getSettings(),
        settingsService.getRoomCategories()
      ]);
      
      console.log('Settings data:', sData);
      console.log('Categories data:', cData);

      // Default settings if null
      let finalSettings = sData;
      if (!finalSettings) {
        console.warn('Settings is null, using default fallback');
        finalSettings = {
          key: 'config',
          check_in_time: '14:00',
          check_out_time: '12:00',
          overnight_start_time: '22:00',
          overnight_end_time: '08:00',
          overnight_checkout_time: '10:00',
          full_day_early_before: '05:00',
          full_day_late_after: '18:00',
          auto_surcharge_enabled: true,
          extra_person_enabled: false,
          extra_person_method: 'fixed',
          grace_in_enabled: true,
          grace_out_enabled: true,
          grace_minutes: 15,
          vat_enabled: false,
          service_fee_enabled: false,
          vat_percent: 10,
          service_fee_percent: 5,
          hourly_unit: 60,
          base_hourly_limit: 1,
          hourly_ceiling_enabled: true,
          hourly_ceiling_percent: 100,
          surcharge_rules: [],
          auto_deduct_inventory: true,
          allow_manual_price_override: true,
          enable_print_bill: true
        } as Settings;
      }
      
      // Format time strings (HH:mm:ss -> HH:mm)
      const formatTime = (t: string) => (t && typeof t === 'string') ? t.substring(0, 5) : (t || '');
      finalSettings.check_in_time = formatTime(finalSettings.check_in_time);
      finalSettings.check_out_time = formatTime(finalSettings.check_out_time);
      finalSettings.overnight_start_time = formatTime(finalSettings.overnight_start_time);
      finalSettings.overnight_end_time = formatTime(finalSettings.overnight_end_time);
      finalSettings.overnight_checkout_time = formatTime(finalSettings.overnight_checkout_time);
      finalSettings.full_day_early_before = formatTime(finalSettings.full_day_early_before);
      finalSettings.full_day_late_after = formatTime(finalSettings.full_day_late_after);
      
      setSettings(finalSettings);
      setCategories(cData || []);
    } catch (error) {
      console.error('Error in fetchData:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      // Prepare data for saving
      const settingsToSave = JSON.parse(JSON.stringify(settings));
      
      // Ensure time strings are in HH:mm:ss format for Postgres
      const ensureSeconds = (t: string) => (t && t.length === 5) ? `${t}:00` : t;
      settingsToSave.check_in_time = ensureSeconds(settingsToSave.check_in_time);
      settingsToSave.check_out_time = ensureSeconds(settingsToSave.check_out_time);
      settingsToSave.overnight_start_time = ensureSeconds(settingsToSave.overnight_start_time);
      settingsToSave.overnight_end_time = ensureSeconds(settingsToSave.overnight_end_time);
      settingsToSave.overnight_checkout_time = ensureSeconds(settingsToSave.overnight_checkout_time);
      settingsToSave.full_day_early_before = ensureSeconds(settingsToSave.full_day_early_before);
      settingsToSave.full_day_late_after = ensureSeconds(settingsToSave.full_day_late_after);

      await Promise.all([
        settingsService.updateSettings(settingsToSave),
        ...categories.map(c => settingsService.updateRoomCategory(c.id, c))
      ]);
      
      // Refresh data to show formatted times
      await fetchData();
      toast.success('Đã lưu cấu hình thành công!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Có lỗi xảy ra khi lưu cấu hình.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FB] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#007AFF]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-24 animate-in fade-in duration-500">
      <header className="sticky top-0 z-50 backdrop-blur-3xl bg-white/70 border-b border-black/5 px-6 py-4 flex items-center justify-between">
        <button 
          onClick={() => router.push('/settings')} 
          className="flex items-center text-[#007AFF] font-bold text-[17px] transition-all"
        >
          <ChevronLeft size={24} />
          <span>Cài đặt</span>
        </button>
        <h2 className="text-[17px] font-bold">Cấu hình giá</h2>
        <button 
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "text-[#007AFF] font-bold text-[17px] transition-all disabled:opacity-50",
            saving && "animate-pulse"
          )}
        >
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-8">
        <h1 className="text-[34px] font-bold tracking-tight mb-8">Cấu hình giá</h1>
        
        <div className="mt-8 space-y-6">
          {!settings && !loading && (
            <div className="p-12 text-center bg-white rounded-3xl border border-black/5 shadow-sm">
              <p className="text-gray-400 font-medium">Không thể tải cấu hình hệ thống. Vui lòng thử lại sau.</p>
              <button onClick={fetchData} className="mt-4 text-[#007AFF] font-bold">Thử lại</button>
            </div>
          )}
          
          {settings && (
            <div className="space-y-6">
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {[
                  { id: 'times', label: 'Giờ giấc', icon: Sun },
                  { id: 'policies', label: 'Chính sách', icon: ShieldCheck },
                  { id: 'tax', label: 'Thuế & Phí', icon: Percent },
                  { id: 'utils', label: 'Tiện ích', icon: Settings2 }
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSubTab(s.id)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl font-bold whitespace-nowrap transition-all",
                      subTab === s.id 
                        ? "bg-[#007AFF] text-white shadow-md shadow-blue-500/20" 
                        : "bg-white text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    <s.icon size={16} />
                    <span className="text-[14px]">{s.label}</span>
                  </button>
                ))}
              </div>

              {subTab === 'times' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                  {/* Giờ giấc tiêu chuẩn */}
                  <BentoCard className="p-0 bg-white h-auto aspect-auto overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-black/5 flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-50 text-[#007AFF] rounded-full flex items-center justify-center">
                        <Sun size={20} />
                      </div>
                      <h3 className="text-[18px] font-bold">Giờ giấc tiêu chuẩn</h3>
                    </div>
                    <div className="divide-y divide-black/5">
                      <div className="px-6 py-4 flex justify-between items-center">
                        <span className="text-[17px] text-[#1D1D1F]">Giờ nhận phòng</span>
                        <input 
                          type="time" 
                          value={settings.check_in_time} 
                          onChange={(e) => setSettings({...settings, check_in_time: e.target.value})}
                          className="font-bold text-[17px] bg-black/5 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20"
                        />
                      </div>
                      <div className="px-6 py-4 flex justify-between items-center">
                        <span className="text-[17px] text-[#1D1D1F]">Giờ trả phòng</span>
                        <input 
                          type="time" 
                          value={settings.check_out_time} 
                          onChange={(e) => setSettings({...settings, check_out_time: e.target.value})}
                          className="font-bold text-[17px] bg-black/5 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20"
                        />
                      </div>
                    </div>
                  </BentoCard>

                  {/* Qua đêm */}
                  <BentoCard className="p-0 bg-white h-auto aspect-auto overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-black/5 flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center">
                        <Moon size="20" />
                      </div>
                      <h3 className="text-[18px] font-bold">Cấu hình Qua đêm</h3>
                    </div>
                    <div className="divide-y divide-black/5">
                      <div className="px-6 py-4 flex justify-between items-center">
                        <span className="text-[17px] text-[#1D1D1F]">Bắt đầu nhận đêm</span>
                        <input 
                          type="time" 
                          value={settings.overnight_start_time} 
                          onChange={(e) => setSettings({...settings, overnight_start_time: e.target.value})}
                          className="font-bold text-[17px] bg-black/5 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div className="px-6 py-4 flex justify-between items-center">
                        <span className="text-[17px] text-[#1D1D1F]">Kết thúc nhận đêm</span>
                        <input 
                          type="time" 
                          value={settings.overnight_end_time} 
                          onChange={(e) => setSettings({...settings, overnight_end_time: e.target.value})}
                          className="font-bold text-[17px] bg-black/5 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <div className="px-6 py-4 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[17px] text-[#1D1D1F]">Giờ trả phòng đêm</span>
                          <span className="text-[13px] text-gray-500">Giờ trả cố định cho khách thuê qua đêm</span>
                        </div>
                        <input 
                          type="time" 
                          value={settings.overnight_checkout_time} 
                          onChange={(e) => setSettings({...settings, overnight_checkout_time: e.target.value})}
                          className="font-bold text-[17px] bg-black/5 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-32"
                        />
                      </div>
                    </div>
                  </BentoCard>
                </div>
              )}

              {subTab === 'policies' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                  {/* Tự động tính thêm ngày */}
                  <BentoCard className="p-0 bg-white h-auto aspect-auto overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-black/5 flex items-center gap-4">
                      <div className="w-10 h-10 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
                        <Clock size={20} />
                      </div>
                      <h3 className="text-[18px] font-bold">Tự động tính thêm ngày</h3>
                    </div>
                    <div className="divide-y divide-black/5">
                      <div className="px-6 py-4 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[17px] text-[#1D1D1F]">Đến sớm tính thêm ngày</span>
                          <span className="text-[13px] text-gray-500">Trước mốc này sẽ tự động tính thêm 1 ngày</span>
                        </div>
                        <input 
                          type="time" 
                          value={settings.full_day_early_before} 
                          onChange={(e) => setSettings({...settings, full_day_early_before: e.target.value})}
                          className="font-bold text-[17px] bg-black/5 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20"
                        />
                      </div>
                      <div className="px-6 py-4 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[17px] text-[#1D1D1F]">Trả muộn tính thêm ngày</span>
                          <span className="text-[13px] text-gray-500">Sau mốc này sẽ tự động tính thêm 1 ngày</span>
                        </div>
                        <input 
                          type="time" 
                          value={settings.full_day_late_after} 
                          onChange={(e) => setSettings({...settings, full_day_late_after: e.target.value})}
                          className="font-bold text-[17px] bg-black/5 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20"
                        />
                      </div>
                    </div>
                  </BentoCard>

                  {/* Ân hạn */}
                  <BentoCard className="p-0 bg-white h-auto aspect-auto overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-black/5 flex items-center gap-4">
                      <div className="w-10 h-10 bg-green-50 text-green-600 rounded-full flex items-center justify-center">
                        <Clock size={20} />
                      </div>
                      <h3 className="text-[18px] font-bold">Ân hạn (Grace Period)</h3>
                    </div>
                    <div className="divide-y divide-black/5">
                      <div className="px-6 py-4 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[17px] text-[#1D1D1F]">Số phút ân hạn</span>
                          <span className="text-[13px] text-gray-500">Thời gian khách được trễ không tính tiền</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input 
                            type="number" 
                            value={settings.grace_minutes} 
                            onChange={(e) => setSettings({...settings, grace_minutes: parseInt(e.target.value) || 0})}
                            className="font-bold text-[17px] bg-black/5 px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/20 w-24 text-center"
                          />
                          <span className="font-medium text-gray-400">phút</span>
                        </div>
                      </div>
                      <div className="px-6 py-4 flex justify-between items-center">
                        <span className="text-[17px] text-[#1D1D1F]">Ân hạn nhận phòng</span>
                        <Switch 
                          checked={settings.grace_in_enabled} 
                          onChange={(val: boolean) => setSettings({...settings, grace_in_enabled: val})} 
                        />
                      </div>
                      <div className="px-6 py-4 flex justify-between items-center">
                        <span className="text-[17px] text-[#1D1D1F]">Ân hạn trả phòng</span>
                        <Switch 
                          checked={settings.grace_out_enabled} 
                          onChange={(val: boolean) => setSettings({...settings, grace_out_enabled: val})} 
                        />
                      </div>
                    </div>
                  </BentoCard>
                </div>
              )}

              {subTab === 'tax' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                  {/* Thuế & Phí */}
                  <BentoCard className="p-0 bg-white h-auto aspect-auto overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-black/5 flex items-center gap-4">
                      <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center">
                        <Percent size={20} />
                      </div>
                      <h3 className="text-[18px] font-bold">Thuế & Phí dịch vụ</h3>
                    </div>
                    <div className="divide-y divide-black/5">
                      <div className="px-6 py-4 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[17px] text-[#1D1D1F]">Thuế VAT</span>
                          {settings.vat_enabled && (
                            <div className="flex items-center gap-2">
                              <input 
                                type="number" 
                                value={settings.vat_percent} 
                                onChange={(e) => setSettings({...settings, vat_percent: parseFloat(e.target.value) || 0})}
                                className="font-bold text-[17px] bg-black/5 px-3 py-1 rounded-lg w-20 text-center"
                              />
                              <span className="text-gray-400">%</span>
                            </div>
                          )}
                        </div>
                        <Switch 
                          checked={settings.vat_enabled} 
                          onChange={(val: boolean) => setSettings({...settings, vat_enabled: val})} 
                        />
                      </div>
                      <div className="px-6 py-4 flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[17px] text-[#1D1D1F]">Phí dịch vụ</span>
                          {settings.service_fee_enabled && (
                            <div className="flex items-center gap-2">
                              <input 
                                type="number" 
                                value={settings.service_fee_percent} 
                                onChange={(e) => setSettings({...settings, service_fee_percent: parseFloat(e.target.value) || 0})}
                                className="font-bold text-[17px] bg-black/5 px-3 py-1 rounded-lg w-20 text-center"
                              />
                              <span className="text-gray-400">%</span>
                            </div>
                          )}
                        </div>
                        <Switch 
                          checked={settings.service_fee_enabled} 
                          onChange={(val: boolean) => setSettings({...settings, service_fee_enabled: val})} 
                        />
                      </div>
                    </div>
                  </BentoCard>
                </div>
              )}

              {subTab === 'utils' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                  {/* Tiện ích khác */}
                  <BentoCard className="p-0 bg-white h-auto aspect-auto overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-black/5 flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-50 text-gray-600 rounded-full flex items-center justify-center">
                        <Settings2 size={20} />
                      </div>
                      <h3 className="text-[18px] font-bold">Cấu hình vận hành</h3>
                    </div>
                    <div className="divide-y divide-black/5">
                      <div className="px-6 py-4 flex justify-between items-center">
                        <span className="text-[17px] text-[#1D1D1F]">Tự động trừ kho dịch vụ</span>
                        <Switch 
                          checked={settings.auto_deduct_inventory} 
                          onChange={(val: boolean) => setSettings({...settings, auto_deduct_inventory: val})} 
                        />
                      </div>
                      <div className="px-6 py-4 flex justify-between items-center">
                        <span className="text-[17px] text-[#1D1D1F]">Cho phép sửa giá thủ công</span>
                        <Switch 
                          checked={settings.allow_manual_price_override} 
                          onChange={(val: boolean) => setSettings({...settings, allow_manual_price_override: val})} 
                        />
                      </div>
                      <div className="px-6 py-4 flex justify-between items-center">
                        <span className="text-[17px] text-[#1D1D1F]">Tự động in hóa đơn</span>
                        <Switch 
                          checked={settings.enable_print_bill} 
                          onChange={(val: boolean) => setSettings({...settings, enable_print_bill: val})} 
                        />
                      </div>
                    </div>
                  </BentoCard>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
