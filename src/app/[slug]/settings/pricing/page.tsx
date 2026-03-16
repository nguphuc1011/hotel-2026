'use client';

import { useState, useEffect } from 'react';
import { 
  ChevronLeft, Sun, Moon, Clock, ShieldCheck, 
  Settings2, Plus, ArrowLeft, Save, AlertCircle, Info,
  CheckCircle2, Calculator, Wallet, Trash2
} from 'lucide-react';
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
      const [sData, cData] = await Promise.all([
        settingsService.getSettings(),
        settingsService.getRoomCategories()
      ]);
      
      if (sData) {
        const formatTime = (t: string) => (t && typeof t === 'string') ? t.substring(0, 5) : (t || '00:00');
        sData.check_in_time = formatTime(sData.check_in_time);
        sData.check_out_time = formatTime(sData.check_out_time);
        sData.overnight_start_time = formatTime(sData.overnight_start_time);
        sData.overnight_end_time = formatTime(sData.overnight_end_time);
        sData.overnight_checkout_time = formatTime(sData.overnight_checkout_time);
        
        setSettings(sData);
      }
      setCategories(cData || []);
    } catch (error) {
      console.error('Error in fetchData:', error);
      toast.error('Không thể tải dữ liệu cấu hình');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const settingsToSave = { ...settings };
      const ensureSeconds = (t: string) => (t && t.length === 5) ? `${t}:00` : t;
      settingsToSave.check_in_time = ensureSeconds(settingsToSave.check_in_time);
      settingsToSave.check_out_time = ensureSeconds(settingsToSave.check_out_time);
      settingsToSave.overnight_start_time = ensureSeconds(settingsToSave.overnight_start_time);
      settingsToSave.overnight_end_time = ensureSeconds(settingsToSave.overnight_end_time);
      settingsToSave.overnight_checkout_time = ensureSeconds(settingsToSave.overnight_checkout_time);

      await Promise.all([
        settingsService.updateSettings(settingsToSave),
        ...categories.map(c => settingsService.updateRoomCategory(c.id, c))
      ]);
      
      await fetchData();
      toast.success('Đã lưu cấu hình giá thành công!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Có lỗi xảy ra khi lưu cấu hình.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
    </div>
  );

  if (!settings) return null;

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
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 leading-none">Cấu hình giá</h1>
              <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Hệ thống & Vận hành</span>
            </div>
          </div>
          
          <button 
            onClick={handleSave}
            disabled={saving}
            className="h-10 md:h-12 px-5 md:px-8 bg-slate-900 text-white rounded-full text-[13px] font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-200 disabled:opacity-50"
          >
            {saving ? <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> : <Save size={18} />}
            <span>{saving ? 'Đang lưu...' : 'Lưu cấu hình'}</span>
          </button>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 md:px-10 py-8 md:py-12 space-y-10 md:space-y-16">
        
        {/* 2. TAB NAVIGATION */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-1.5 px-2">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Thiết lập chính sách</h2>
            <p className="text-slate-400 font-bold text-sm md:text-base">Quản lý khung giờ và các quy tắc tự động áp giá</p>
          </div>

          <div className="flex items-center gap-1.5 p-1.5 bg-white/80 backdrop-blur-md rounded-full border border-slate-200/60 shadow-sm self-start md:self-auto overflow-x-auto no-scrollbar">
            {[
              { id: 'times', label: 'Khung giờ', icon: Clock },
              { id: 'policies', label: 'Ân hạn', icon: ShieldCheck },
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={cn(
                  "px-6 md:px-10 py-2.5 rounded-full text-[12px] md:text-[13px] font-bold transition-all uppercase tracking-widest flex items-center gap-2 whitespace-nowrap",
                  subTab === tab.id ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                )}
              >
                <tab.icon size={16} /> {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3. CONTENT SECTIONS */}
        <div className="grid grid-cols-1 gap-10 md:gap-16">
          {settings && (
            <>
              {subTab === 'times' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  
                  {/* Standard Times Card */}
                  <div className="bg-white/80 backdrop-blur-xl rounded-[40px] p-8 md:p-12 border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] flex flex-col relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none -rotate-12">
                      <Sun size={200} strokeWidth={0.5} />
                    </div>
                    
                    <div className="relative z-10 flex items-center gap-5 mb-10 md:mb-12">
                      <div className="w-16 h-16 rounded-3xl bg-orange-50 text-orange-500 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500">
                        <Sun size={32} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black tracking-tight">Giờ Nhận & Trả</h3>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Khung giờ tiêu chuẩn cho khách Ngày</p>
                      </div>
                    </div>

                    <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Giờ nhận phòng</label>
                        <input 
                          type="time" 
                          value={settings.check_in_time} 
                          onChange={(e) => setSettings({...settings, check_in_time: e.target.value})}
                          className="w-full h-16 md:h-20 px-2 rounded-[24px] bg-slate-50 border border-transparent font-black text-2xl md:text-3xl text-slate-900 outline-none focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/5 transition-all cursor-pointer text-center [&::-webkit-calendar-picker-indicator]:hidden"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Giờ trả phòng</label>
                        <input 
                          type="time" 
                          value={settings.check_out_time} 
                          onChange={(e) => setSettings({...settings, check_out_time: e.target.value})}
                          className="w-full h-16 md:h-20 px-2 rounded-[24px] bg-slate-50 border border-transparent font-black text-2xl md:text-3xl text-slate-900 outline-none focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/5 transition-all cursor-pointer text-center [&::-webkit-calendar-picker-indicator]:hidden"
                        />
                      </div>
                    </div>

                    <div className="relative z-10 p-8 rounded-[32px] bg-orange-50/50 border border-orange-100/30 flex items-center gap-5">
                       <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-orange-500 shrink-0">
                         <Info size={20} />
                       </div>
                       <p className="text-xs font-bold text-orange-900 leading-relaxed">
                         Khung giờ này dùng để tính toán phụ thu nhận sớm/trả trễ cho các booking theo Ngày.
                       </p>
                    </div>
                  </div>

                  {/* Overnight Times Card */}
                  <div className="bg-white/80 backdrop-blur-xl rounded-[40px] p-8 md:p-12 border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] flex flex-col relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none -rotate-12">
                      <Moon size={200} strokeWidth={0.5} />
                    </div>
                    
                    <div className="relative z-10 flex items-center gap-5 mb-10 md:mb-12">
                      <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-500 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500">
                        <Moon size={32} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black tracking-tight">Cấu hình Qua đêm</h3>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Khung giờ áp dụng giá Đêm</p>
                      </div>
                    </div>

                    <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Bắt đầu nhận đêm</label>
                        <input 
                          type="time" 
                          value={settings.overnight_start_time} 
                          onChange={(e) => setSettings({...settings, overnight_start_time: e.target.value})}
                          className="w-full h-16 md:h-20 px-2 rounded-[24px] bg-slate-50 border border-transparent font-black text-2xl md:text-3xl text-slate-900 outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all cursor-pointer text-center [&::-webkit-calendar-picker-indicator]:hidden"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Kết thúc nhận đêm</label>
                        <input 
                          type="time" 
                          value={settings.overnight_end_time} 
                          onChange={(e) => setSettings({...settings, overnight_end_time: e.target.value})}
                          className="w-full h-16 md:h-20 px-2 rounded-[24px] bg-slate-50 border border-transparent font-black text-2xl md:text-3xl text-slate-900 outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all cursor-pointer text-center [&::-webkit-calendar-picker-indicator]:hidden"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Trả phòng đêm</label>
                        <input 
                          type="time" 
                          value={settings.overnight_checkout_time} 
                          onChange={(e) => setSettings({...settings, overnight_checkout_time: e.target.value})}
                          className="w-full h-16 md:h-20 px-2 rounded-[24px] bg-slate-50 border border-transparent font-black text-2xl md:text-3xl text-slate-900 outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all cursor-pointer text-center [&::-webkit-calendar-picker-indicator]:hidden"
                        />
                      </div>
                    </div>

                    <div className="relative z-10 bg-indigo-50/50 rounded-[32px] p-8 flex items-center justify-between border border-indigo-100/30">
                      <div className="space-y-1">
                        <p className="text-base font-black text-indigo-900 tracking-tight">Tự động chuyển giá Đêm</p>
                        <p className="text-xs font-bold text-indigo-400 leading-relaxed">Hệ thống tự động áp giá Đêm khi khách vào đúng khung giờ</p>
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 animate-in fade-in slide-in-from-left-4 duration-500">
                  
                  {/* Grace Period Card */}
                  <div className="bg-white/80 backdrop-blur-xl rounded-[40px] p-8 md:p-12 border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] flex flex-col relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none -rotate-12">
                      <Clock size={200} strokeWidth={0.5} />
                    </div>
                    
                    <div className="relative z-10 flex items-center gap-5 mb-10">
                      <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-500 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500">
                        <Clock size={32} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black tracking-tight">Ân hạn (Grace Period)</h3>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Linh động thời gian cho khách</p>
                      </div>
                    </div>

                    <div className="relative z-10 space-y-6">
                      <div className="p-10 rounded-[40px] bg-emerald-50/30 border border-emerald-100/50 flex flex-col items-center justify-center text-center">
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-4">Số phút ân hạn</p>
                        <div className="flex items-baseline gap-3">
                          <input 
                            type="number" 
                            value={settings.grace_minutes} 
                            onChange={(e) => setSettings({...settings, grace_minutes: parseInt(e.target.value) || 0})}
                            className="w-32 h-24 bg-transparent text-center font-black text-6xl md:text-7xl text-emerald-600 outline-none placeholder:text-emerald-100"
                          />
                          <span className="text-2xl font-black text-emerald-300">PHÚT</span>
                        </div>
                        <p className="text-xs font-bold text-emerald-400 mt-4 max-w-[200px]">Thời gian khách được trễ mà không bị tính thêm phí</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-6 rounded-[24px] bg-white border border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center"><Sun size={14} /></div>
                            <span className="text-sm font-black text-slate-700">Ân hạn Nhận</span>
                          </div>
                          <Switch checked={settings.grace_in_enabled} onChange={(val: boolean) => setSettings({...settings, grace_in_enabled: val})} />
                        </div>
                        <div className="p-6 rounded-[24px] bg-white border border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center"><Moon size={14} /></div>
                            <span className="text-sm font-black text-slate-700">Ân hạn Trả</span>
                          </div>
                          <Switch checked={settings.grace_out_enabled} onChange={(val: boolean) => setSettings({...settings, grace_out_enabled: val})} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Manual Override Card */}
                  <div className="bg-white/80 backdrop-blur-xl rounded-[40px] p-8 md:p-12 border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] flex flex-col relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none -rotate-12">
                      <Wallet size={200} strokeWidth={0.5} />
                    </div>
                    
                    <div className="relative z-10 flex items-center gap-5 mb-10">
                      <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-500 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500">
                        <Calculator size={32} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black tracking-tight">Ghi đè giá thủ công</h3>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Quyền hạn điều chỉnh giá của nhân viên</p>
                      </div>
                    </div>

                    <div className="relative z-10 space-y-6">
                       <div className="p-8 rounded-[32px] bg-blue-50/50 border border-blue-100/30 flex items-center justify-between">
                         <div className="space-y-1">
                           <p className="text-lg font-black text-blue-900 tracking-tight">Cho phép sửa giá</p>
                           <p className="text-xs font-bold text-blue-400">Nhân viên có thể chỉnh giá phòng trực tiếp trên hóa đơn</p>
                         </div>
                         <Switch 
                           checked={settings.allow_manual_price_override} 
                           onChange={(val: boolean) => setSettings({...settings, allow_manual_price_override: val})} 
                         />
                       </div>

                       <div className="p-8 rounded-[32px] bg-slate-50 border border-slate-100">
                          <div className="flex gap-4">
                            <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-[10px] font-black">!</span>
                            </div>
                            <p className="text-xs font-bold text-slate-400 leading-relaxed">
                              Lưu ý: Mọi hành động ghi đè giá thủ công sẽ được lưu vết trong lịch sử hệ thống để phục vụ đối soát.
                            </p>
                          </div>
                       </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* 4. MOBILE FLOATING ACTION */}
      <div className="fixed bottom-10 left-0 right-0 px-6 md:hidden z-50">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full h-18 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-widest text-[13px] shadow-2xl shadow-slate-900/40 flex items-center justify-center gap-3 active:scale-95 transition-all"
        >
          {saving ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Save size={20} />}
          {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
      </div>
    </div>
  );
}
