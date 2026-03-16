'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { 
  Save, Bot, ArrowLeft, BellRing, Calculator, 
  Settings2, Package, Wallet, Info, Percent,
  Clock, ShieldCheck
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/controls';
import { settingsService, Settings } from '@/services/settingsService';

export default function SystemSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const data = await settingsService.getSettings();
      if (data) {
        // Ensure time format HH:mm
        const formatTime = (t: string) => (t && typeof t === 'string') ? t.substring(0, 5) : (t || '00:00');
        setSettings({
          ...data,
          night_audit_time: formatTime(data.night_audit_time),
          full_day_early_before: formatTime(data.full_day_early_before),
          full_day_late_after: formatTime(data.full_day_late_after),
          telegram_bot_token: data.telegram_bot_token || '',
          telegram_chat_id: data.telegram_chat_id || ''
        });
      }
    } catch (error: any) {
      console.error('Error fetching settings:', error);
      toast.error('Không thể tải cấu hình');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const settingsToSave = { ...settings };
      // Ensure seconds for DB
      const ensureSeconds = (t: string) => (t && t.length === 5) ? `${t}:00` : t;
      settingsToSave.night_audit_time = ensureSeconds(settingsToSave.night_audit_time);
      settingsToSave.full_day_early_before = ensureSeconds(settingsToSave.full_day_early_before);
      settingsToSave.full_day_late_after = ensureSeconds(settingsToSave.full_day_late_after);

      await settingsService.updateSettings(settingsToSave);
      toast.success('Đã lưu cấu hình hệ thống thành công!');
      fetchConfig();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error('Lỗi khi lưu: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
    </div>
  );

  if (!settings) return <div className="p-8">Không tìm thấy cấu hình.</div>;

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-slate-900 font-sans selection:bg-slate-900 selection:text-white pb-40">
      
      {/* 1. TOP NAV */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-[1200px] mx-auto px-4 md:px-10 h-20 md:h-24 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()}
              className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white rounded-full border border-slate-200 shadow-sm hover:bg-slate-50 transition-all active:scale-90"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 leading-none">Tham số hệ thống</h1>
              <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Vận hành & Tự động hóa</span>
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

      <main className="max-w-[1200px] mx-auto px-4 md:px-10 py-8 md:py-12 space-y-10 md:space-y-16">
        
        {/* 2. NIGHT AUDIT & FINANCIAL DAY */}
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white/80 backdrop-blur-xl rounded-[40px] p-8 md:p-12 border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none -rotate-12">
              <BellRing size={200} strokeWidth={0.5} />
            </div>
            
            <div className="relative z-10 flex items-center gap-5 mb-10 md:mb-12">
              <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-500 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500">
                <BellRing size={32} />
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-black tracking-tight">Night Audit & Chốt ngày</h3>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Cấu hình thời điểm kết thúc ngày kế toán</p>
              </div>
            </div>

            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
              <div className="p-8 rounded-[32px] bg-slate-50/50 border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <p className="text-base font-black text-slate-900 tracking-tight">Mốc Night Audit</p>
                  <p className="text-xs font-bold text-slate-400 leading-relaxed">Thời điểm hệ thống tự động chốt doanh thu và tính thêm ngày</p>
                </div>
                <input 
                  type="time" 
                  value={settings.night_audit_time} 
                  onChange={(e) => setSettings({...settings, night_audit_time: e.target.value})}
                  className="h-16 md:h-20 px-2 rounded-2xl bg-white border border-slate-200 font-black text-2xl md:text-3xl text-slate-900 outline-none focus:ring-4 focus:ring-rose-500/5 focus:border-rose-500 transition-all text-center [&::-webkit-calendar-picker-indicator]:hidden"
                />
              </div>

              <div className="p-8 rounded-[32px] bg-slate-50/50 border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <p className="text-base font-black text-slate-900 tracking-tight">Mốc tính thêm ngày (Trễ)</p>
                  <p className="text-xs font-bold text-slate-400 leading-relaxed">Sau mốc này sẽ tự động tính thêm 1 ngày tiền phòng</p>
                </div>
                <input 
                  type="time" 
                  value={settings.full_day_late_after} 
                  onChange={(e) => setSettings({...settings, full_day_late_after: e.target.value})}
                  className="h-16 md:h-20 px-2 rounded-2xl bg-white border border-slate-200 font-black text-2xl md:text-3xl text-slate-900 outline-none focus:ring-4 focus:ring-rose-500/5 focus:border-rose-500 transition-all text-center [&::-webkit-calendar-picker-indicator]:hidden"
                />
              </div>
            </div>

            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
                <div className="p-8 rounded-[32px] bg-white border border-slate-100 flex items-center justify-between shadow-sm group-hover:shadow-md transition-all">
                  <div className="space-y-1">
                    <p className="text-base font-black text-slate-900 tracking-tight">Tự động cộng sớm</p>
                    <p className="text-xs font-bold text-slate-400">Check-in trước mốc audit tính thêm ngày</p>
                  </div>
                  <Switch checked={settings.auto_full_day_early} onChange={(val: boolean) => setSettings({...settings, auto_full_day_early: val})} />
                </div>
                <div className="p-8 rounded-[32px] bg-white border border-slate-100 flex items-center justify-between shadow-sm group-hover:shadow-md transition-all">
                  <div className="space-y-1">
                    <p className="text-base font-black text-slate-900 tracking-tight">Tự động cộng trễ</p>
                    <p className="text-xs font-bold text-slate-400">Check-out sau mốc trễ tính thêm ngày</p>
                  </div>
                  <Switch checked={settings.auto_full_day_late} onChange={(val: boolean) => setSettings({...settings, auto_full_day_late: val})} />
                </div>
            </div>
          </div>
        </section>

        {/* 3. TAX & SERVICE FEES */}
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white/80 backdrop-blur-xl rounded-[40px] p-8 md:p-12 border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none -rotate-12">
              <Calculator size={200} strokeWidth={0.5} />
            </div>
            
            <div className="relative z-10 flex items-center gap-5 mb-10 md:mb-12">
              <div className="w-16 h-16 rounded-3xl bg-orange-50 text-orange-500 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500">
                <Percent size={32} />
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-black tracking-tight">Thuế & Phí dịch vụ</h3>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Cấu hình VAT và các phí cộng thêm</p>
              </div>
            </div>

            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
              <div className={cn(
                "p-10 rounded-[40px] border transition-all duration-500",
                settings.vat_enabled ? "bg-orange-50/50 border-orange-100 shadow-sm" : "bg-slate-50 border-slate-100 opacity-60"
              )}>
                <div className="flex items-center justify-between mb-8">
                  <div className="space-y-1">
                    <p className="text-xl font-black text-slate-900 tracking-tight leading-none">Thuế VAT</p>
                    <p className="text-xs font-bold text-slate-400">Tự động cộng vào hóa đơn (%)</p>
                  </div>
                  <Switch checked={settings.vat_enabled} onChange={(val: boolean) => setSettings({...settings, vat_enabled: val})} />
                </div>
                {settings.vat_enabled && (
                  <div className="flex items-baseline justify-center gap-3">
                    <input 
                      type="number" 
                      value={settings.vat_percent} 
                      onChange={(e) => setSettings({...settings, vat_percent: parseFloat(e.target.value) || 0})}
                      className="w-full h-24 bg-white rounded-3xl border border-orange-200 text-center font-black text-6xl text-orange-600 outline-none focus:ring-8 focus:ring-orange-500/5 shadow-inner"
                    />
                    <span className="text-3xl font-black text-orange-300">%</span>
                  </div>
                )}
              </div>

              <div className={cn(
                "p-10 rounded-[40px] border transition-all duration-500",
                settings.service_fee_enabled ? "bg-amber-50/50 border-amber-100 shadow-sm" : "bg-slate-50 border-slate-100 opacity-60"
              )}>
                <div className="flex items-center justify-between mb-8">
                  <div className="space-y-1">
                    <p className="text-xl font-black text-slate-900 tracking-tight leading-none">Phí phục vụ</p>
                    <p className="text-xs font-bold text-slate-400">Phí dịch vụ khách sạn (%)</p>
                  </div>
                  <Switch checked={settings.service_fee_enabled} onChange={(val: boolean) => setSettings({...settings, service_fee_enabled: val})} />
                </div>
                {settings.service_fee_enabled && (
                  <div className="flex items-baseline justify-center gap-3">
                    <input 
                      type="number" 
                      value={settings.service_fee_percent} 
                      onChange={(e) => setSettings({...settings, service_fee_percent: parseFloat(e.target.value) || 0})}
                      className="w-full h-24 bg-white rounded-3xl border border-amber-200 text-center font-black text-6xl text-amber-600 outline-none focus:ring-8 focus:ring-amber-500/5 shadow-inner"
                    />
                    <span className="text-3xl font-black text-amber-300">%</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 4. AUTOMATION & OPERATION */}
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white/80 backdrop-blur-xl rounded-[40px] p-8 md:p-12 border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none -rotate-12">
              <Settings2 size={200} strokeWidth={0.5} />
            </div>
            
            <div className="relative z-10 flex items-center gap-5 mb-10 md:mb-12">
              <div className="w-16 h-16 rounded-3xl bg-slate-100 text-slate-500 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500">
                <Settings2 size={32} />
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-black tracking-tight">Tự động hóa vận hành</h3>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Các quy tắc xử lý tự động của hệ thống</p>
              </div>
            </div>

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {[
                { key: 'auto_deduct_inventory', label: 'Tự động trừ kho', desc: 'Trừ tồn kho ngay khi gọi dịch vụ', icon: Package, color: 'text-blue-500', bg: 'bg-blue-50' },
                { key: 'allow_manual_price_override', label: 'Cho phép sửa giá', desc: 'Nhân viên có thể chỉnh giá thủ công', icon: Wallet, color: 'text-indigo-500', bg: 'bg-indigo-50' },
                { key: 'enable_print_bill', label: 'Tự động in hóa đơn', desc: 'Hiện hộp thoại in khi thanh toán', icon: Info, color: 'text-slate-500', bg: 'bg-slate-100' },
              ].map((item) => (
                <div key={item.key} className="p-8 rounded-[32px] bg-slate-50/50 border border-slate-100 flex flex-col justify-between gap-8 hover:bg-white hover:shadow-xl hover:scale-[1.02] transition-all duration-500">
                  <div className="space-y-4">
                    <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm", item.bg, item.color)}>
                      <item.icon size={24} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-lg font-black text-slate-900 tracking-tight leading-none">{item.label}</p>
                      <p className="text-xs font-bold text-slate-400 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Switch 
                      checked={(settings as any)[item.key]} 
                      onChange={(val: boolean) => setSettings({...settings, [item.key]: val})} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. TELEGRAM INTEGRATION */}
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white/80 backdrop-blur-xl rounded-[40px] p-8 md:p-12 border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none -rotate-12">
              <Bot size={200} strokeWidth={0.5} />
            </div>
            
            <div className="relative z-10 flex items-center gap-5 mb-10 md:mb-12">
              <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-500 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500">
                <Bot size={32} />
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-black tracking-tight">Telegram Notification</h3>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Tích hợp thông báo qua ứng dụng Telegram</p>
              </div>
            </div>

            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Bot Token (API Token)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={settings.telegram_bot_token}
                    onChange={(e) => setSettings({...settings, telegram_bot_token: e.target.value})}
                    className="w-full h-18 md:h-20 px-8 rounded-[28px] bg-slate-50 border border-transparent font-bold text-lg md:text-xl text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-200"
                    placeholder="Nhập Bot Token từ BotFather..."
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Chat ID (Receiver ID)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={settings.telegram_chat_id}
                    onChange={(e) => setSettings({...settings, telegram_chat_id: e.target.value})}
                    className="w-full h-18 md:h-20 px-8 rounded-[28px] bg-slate-50 border border-transparent font-bold text-lg md:text-xl text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-200"
                    placeholder="Nhập ID người nhận hoặc Group ID..."
                  />
                </div>
              </div>
            </div>
            
            <div className="relative z-10 mt-10 p-8 rounded-[32px] bg-blue-50/30 border border-blue-100/50">
                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-black">?</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-black text-blue-900 tracking-tight">Hướng dẫn nhanh</p>
                    <p className="text-xs font-medium text-blue-500 leading-relaxed">
                      Để nhận thông báo, bạn cần tạo một Bot qua @BotFather trên Telegram, lấy Token và Chat ID. Bot sẽ tự động gửi thông báo về doanh thu, check-in/out và các sự kiện quan trọng khác.
                    </p>
                  </div>
                </div>
            </div>
          </div>
        </section>
      </main>

      {/* 6. MOBILE FLOATING ACTION */}
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
