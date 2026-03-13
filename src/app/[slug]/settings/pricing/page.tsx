'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, Sun, Moon, Clock, ShieldCheck, Percent, Settings2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/controls';
import { settingsService, Settings, RoomCategory } from '@/services/settingsService';
import { cn } from '@/lib/utils';
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
          night_audit_time: '04:00',
          full_day_early_before: '04:00',
          full_day_late_after: '18:00',
          auto_surcharge_enabled: true,
          auto_overnight_switch: false,
          auto_full_day_early: true,
          auto_full_day_late: true,
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
      finalSettings.night_audit_time = formatTime(finalSettings.night_audit_time);
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
      settingsToSave.night_audit_time = ensureSeconds(settingsToSave.night_audit_time);
      settingsToSave.full_day_early_before = ensureSeconds(settingsToSave.night_audit_time); // Sync both for compatibility
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

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]"><div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full"></div></div>;

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-8 pb-40 font-sans">
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
        
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
                 <Settings2 size={28} />
               </div>
               <div>
                  <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                    Cấu hình giá
                  </h1>
                  <p className="text-slate-500 font-medium text-base md:text-lg mt-1">
                    Thiết lập bảng giá, giờ giấc và các chính sách phụ thu
                  </p>
               </div>
            </div>
          </div>
          
          <button 
            onClick={handleSave}
            disabled={saving}
            className="hidden md:flex bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold items-center gap-3 shadow-lg shadow-slate-900/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Settings2 size={20} />}
            <span>Lưu thay đổi</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white p-1.5 rounded-[24px] shadow-sm border border-slate-100 inline-flex gap-1 w-full md:w-auto overflow-x-auto">
          {[
            { id: 'times', label: 'Giờ giấc', icon: Clock },
            { id: 'policies', label: 'Phụ thu', icon: ShieldCheck },
            { id: 'vat', label: 'Thuế & Phí', icon: Percent },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={cn(
                "px-6 py-3 rounded-[20px] font-bold text-sm flex items-center justify-center gap-2 transition-all whitespace-nowrap flex-1 md:flex-none",
                subTab === tab.id 
                  ? "bg-slate-900 text-white shadow-md" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <tab.icon size={18} strokeWidth={2.5} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="space-y-6">
          {settings && (
            <>
              {subTab === 'times' && (
                <div className="grid gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Giờ giấc tiêu chuẩn */}
                  <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-[100px] -mr-8 -mt-8 opacity-50 group-hover:scale-110 transition-transform duration-500" />
                    
                    <div className="flex items-center gap-4 mb-8 relative">
                      <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-[20px] flex items-center justify-center shadow-sm">
                        <Sun size={28} strokeWidth={2} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900">Giờ giấc tiêu chuẩn</h3>
                        <p className="text-slate-500 font-medium text-sm">Thiết lập khung giờ nhận và trả phòng mặc định</p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Giờ nhận phòng</label>
                        <div className="relative group/input">
                          <input 
                            type="time" 
                            value={settings.check_in_time} 
                            onChange={(e) => setSettings({...settings, check_in_time: e.target.value})}
                            className="w-full h-14 px-5 rounded-2xl bg-slate-50 border border-slate-200 font-black text-xl text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
                          />
                          <Clock className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-500 transition-colors" size={20} />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Giờ trả phòng</label>
                        <div className="relative group/input">
                          <input 
                            type="time" 
                            value={settings.check_out_time} 
                            onChange={(e) => setSettings({...settings, check_out_time: e.target.value})}
                            className="w-full h-14 px-5 rounded-2xl bg-slate-50 border border-slate-200 font-black text-xl text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
                          />
                          <Clock className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-500 transition-colors" size={20} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cấu hình Qua đêm */}
                  <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-[100px] -mr-8 -mt-8 opacity-50 group-hover:scale-110 transition-transform duration-500" />
                    
                    <div className="flex items-center gap-4 mb-8 relative">
                      <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-[20px] flex items-center justify-center shadow-sm">
                        <Moon size={28} strokeWidth={2} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900">Cấu hình Qua đêm</h3>
                        <p className="text-slate-500 font-medium text-sm">Khung giờ áp dụng giá qua đêm</p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8 mb-8">
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Bắt đầu nhận đêm</label>
                        <div className="relative group/input">
                          <input 
                            type="time" 
                            value={settings.overnight_start_time} 
                            onChange={(e) => setSettings({...settings, overnight_start_time: e.target.value})}
                            className="w-full h-14 px-5 rounded-2xl bg-slate-50 border border-slate-200 font-black text-xl text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Kết thúc nhận đêm</label>
                        <div className="relative group/input">
                          <input 
                            type="time" 
                            value={settings.overnight_end_time} 
                            onChange={(e) => setSettings({...settings, overnight_end_time: e.target.value})}
                            className="w-full h-14 px-5 rounded-2xl bg-slate-50 border border-slate-200 font-black text-xl text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Giờ trả phòng đêm</label>
                        <div className="relative group/input">
                          <input 
                            type="time" 
                            value={settings.overnight_checkout_time} 
                            onChange={(e) => setSettings({...settings, overnight_checkout_time: e.target.value})}
                            className="w-full h-14 px-5 rounded-2xl bg-slate-50 border border-slate-200 font-black text-xl text-slate-900 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-indigo-50/50 rounded-2xl p-6 flex items-center justify-between border border-indigo-100/50">
                      <div className="flex flex-col gap-1">
                        <span className="text-base font-bold text-slate-900">Tự động chuyển Qua đêm</span>
                        <span className="text-sm font-medium text-slate-500">Tự động áp giá Đêm khi khách vào đúng khung giờ</span>
                      </div>
                      <Switch 
                        checked={settings.auto_overnight_switch} 
                        onChange={(val: boolean) => setSettings({...settings, auto_overnight_switch: val})} 
                      />
                    </div>
                  </div>
                </div>
              )}


              {subTab === 'policies' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                  {/* Tự động tính thêm ngày */}
                  <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-bl-[100px] -mr-8 -mt-8 opacity-50 group-hover:scale-110 transition-transform duration-500" />
                    
                    <div className="flex items-center gap-4 mb-8 relative">
                      <div className="w-14 h-14 bg-red-50 text-red-600 rounded-[20px] flex items-center justify-center shadow-sm">
                        <Clock size={28} strokeWidth={2} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900">Tự động tính thêm ngày</h3>
                        <p className="text-slate-500 font-medium text-sm">Cấu hình thời gian tự động cộng thêm ngày</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                        <div className="flex flex-col">
                          <span className="text-base font-bold text-slate-900">Mốc Night Audit (Chốt ngày)</span>
                          <span className="text-sm font-medium text-slate-500">Mốc giờ hệ thống tự động chốt sổ và tính thêm ngày nếu vào sớm</span>
                        </div>
                        <div className="relative group/input">
                          <input 
                            type="time" 
                            value={settings.night_audit_time} 
                            onChange={(e) => setSettings({...settings, night_audit_time: e.target.value})}
                            className="w-40 h-12 px-4 rounded-xl bg-white border border-slate-200 font-black text-lg text-slate-900 focus:outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all text-center"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                        <span className="text-base font-bold text-slate-900">Kích hoạt tính sớm (Full day)</span>
                        <Switch 
                          checked={settings.auto_full_day_early} 
                          onChange={(val: boolean) => setSettings({...settings, auto_full_day_early: val})} 
                        />
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                        <div className="flex flex-col">
                          <span className="text-base font-bold text-slate-900">Trả muộn tính thêm ngày</span>
                          <span className="text-sm font-medium text-slate-500">Sau mốc này sẽ tự động tính thêm 1 ngày</span>
                        </div>
                        <div className="relative group/input">
                          <input 
                            type="time" 
                            value={settings.full_day_late_after} 
                            onChange={(e) => setSettings({...settings, full_day_late_after: e.target.value})}
                            className="w-40 h-12 px-4 rounded-xl bg-white border border-slate-200 font-black text-lg text-slate-900 focus:outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all text-center"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                        <span className="text-base font-bold text-slate-900">Kích hoạt tính trễ (Full day)</span>
                        <Switch 
                          checked={settings.auto_full_day_late} 
                          onChange={(val: boolean) => setSettings({...settings, auto_full_day_late: val})} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Ân hạn */}
                  <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-bl-[100px] -mr-8 -mt-8 opacity-50 group-hover:scale-110 transition-transform duration-500" />
                    
                    <div className="flex items-center gap-4 mb-8 relative">
                      <div className="w-14 h-14 bg-green-50 text-green-600 rounded-[20px] flex items-center justify-center shadow-sm">
                        <Clock size={28} strokeWidth={2} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900">Ân hạn (Grace Period)</h3>
                        <p className="text-slate-500 font-medium text-sm">Thời gian linh động cho khách</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                        <div className="flex flex-col">
                          <span className="text-base font-bold text-slate-900">Số phút ân hạn</span>
                          <span className="text-sm font-medium text-slate-500">Thời gian khách được trễ không tính tiền</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input 
                            type="number" 
                            value={settings.grace_minutes} 
                            onChange={(e) => setSettings({...settings, grace_minutes: parseInt(e.target.value) || 0})}
                            className="w-24 h-12 px-4 rounded-xl bg-white border border-slate-200 font-black text-lg text-slate-900 focus:outline-none focus:border-green-500 focus:ring-4 focus:ring-green-500/10 transition-all text-center"
                          />
                          <span className="font-bold text-slate-400">phút</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                        <span className="text-base font-bold text-slate-900">Ân hạn nhận phòng</span>
                        <Switch 
                          checked={settings.grace_in_enabled} 
                          onChange={(val: boolean) => setSettings({...settings, grace_in_enabled: val})} 
                        />
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                        <span className="text-base font-bold text-slate-900">Ân hạn trả phòng</span>
                        <Switch 
                          checked={settings.grace_out_enabled} 
                          onChange={(val: boolean) => setSettings({...settings, grace_out_enabled: val})} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {subTab === 'vat' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                  {/* Thuế & Phí */}
                  <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-bl-[100px] -mr-8 -mt-8 opacity-50 group-hover:scale-110 transition-transform duration-500" />
                    
                    <div className="flex items-center gap-4 mb-8 relative">
                      <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-[20px] flex items-center justify-center shadow-sm">
                        <Percent size={28} strokeWidth={2} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900">Thuế & Phí dịch vụ</h3>
                        <p className="text-slate-500 font-medium text-sm">Cấu hình VAT và phí phục vụ</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                        <div className="flex flex-col gap-2">
                          <span className="text-base font-bold text-slate-900">Thuế VAT</span>
                          {settings.vat_enabled && (
                            <div className="flex items-center gap-2">
                              <input 
                                type="number" 
                                value={settings.vat_percent} 
                                onChange={(e) => setSettings({...settings, vat_percent: parseFloat(e.target.value) || 0})}
                                className="w-24 h-10 px-3 rounded-xl bg-white border border-slate-200 font-black text-lg text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all text-center"
                              />
                              <span className="font-bold text-slate-400">%</span>
                            </div>
                          )}
                        </div>
                        <Switch 
                          checked={settings.vat_enabled} 
                          onChange={(val: boolean) => setSettings({...settings, vat_enabled: val})} 
                        />
                      </div>

                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                        <div className="flex flex-col gap-2">
                          <span className="text-base font-bold text-slate-900">Phí dịch vụ</span>
                          {settings.service_fee_enabled && (
                            <div className="flex items-center gap-2">
                              <input 
                                type="number" 
                                value={settings.service_fee_percent} 
                                onChange={(e) => setSettings({...settings, service_fee_percent: parseFloat(e.target.value) || 0})}
                                className="w-24 h-10 px-3 rounded-xl bg-white border border-slate-200 font-black text-lg text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all text-center"
                              />
                              <span className="font-bold text-slate-400">%</span>
                            </div>
                          )}
                        </div>
                        <Switch 
                          checked={settings.service_fee_enabled} 
                          onChange={(val: boolean) => setSettings({...settings, service_fee_enabled: val})} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Tiện ích khác - MOVED HERE */}
                  <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-bl-[100px] -mr-8 -mt-8 opacity-50 group-hover:scale-110 transition-transform duration-500" />
                    
                    <div className="flex items-center gap-4 mb-8 relative">
                      <div className="w-14 h-14 bg-gray-50 text-gray-600 rounded-[20px] flex items-center justify-center shadow-sm">
                        <Settings2 size={28} strokeWidth={2} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900">Cấu hình vận hành</h3>
                        <p className="text-slate-500 font-medium text-sm">Các thiết lập hệ thống khác</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                        <span className="text-base font-bold text-slate-900">Tự động trừ kho dịch vụ</span>
                        <Switch 
                          checked={settings.auto_deduct_inventory} 
                          onChange={(val: boolean) => setSettings({...settings, auto_deduct_inventory: val})} 
                        />
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                        <span className="text-base font-bold text-slate-900">Cho phép sửa giá thủ công</span>
                        <Switch 
                          checked={settings.allow_manual_price_override} 
                          onChange={(val: boolean) => setSettings({...settings, allow_manual_price_override: val})} 
                        />
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100">
                        <span className="text-base font-bold text-slate-900">Tự động in hóa đơn</span>
                        <Switch 
                          checked={settings.enable_print_bill} 
                          onChange={(val: boolean) => setSettings({...settings, enable_print_bill: val})} 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile Fixed Footer */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-slate-100 md:hidden z-50">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full h-14 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-slate-900/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Settings2 size={20} />}
          <span>Lưu thay đổi</span>
        </button>
      </div>
    </div>
  );
}
