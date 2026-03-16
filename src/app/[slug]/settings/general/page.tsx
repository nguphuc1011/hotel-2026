'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Building2, MapPin, Phone, Mail, Save, 
  ArrowLeft, Info, ShieldCheck, Globe
} from 'lucide-react';
import { settingsService, Settings } from '@/services/settingsService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function GeneralSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const data = await settingsService.getSettings();
      setSettings(data);
    } catch (error) {
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
      await settingsService.updateSettings({
        hotel_name: settings.hotel_name,
        hotel_address: settings.hotel_address,
        hotel_phone: settings.hotel_phone,
        hotel_email: settings.hotel_email,
      });
      toast.success('Đã lưu cấu hình chung');
      // A full reload might be needed to update the layout if we don't use a context
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Lỗi khi lưu cấu hình');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
    </div>
  );

  if (!settings) return <div className="p-8">Không có dữ liệu cấu hình.</div>;

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-slate-900 font-sans selection:bg-slate-900 selection:text-white pb-40">
      
      {/* 1. TOP NAV */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-[1000px] mx-auto px-4 md:px-10 h-20 md:h-24 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.back()}
              className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white rounded-full border border-slate-200 shadow-sm hover:bg-slate-50 transition-all active:scale-90"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 leading-none">Cấu hình chung</h1>
              <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Thông tin khách sạn</span>
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

      <main className="max-w-[1000px] mx-auto px-4 md:px-10 py-8 md:py-12 space-y-10 md:space-y-16">
        
        {/* 2. HOTEL INFO CARD */}
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white/80 backdrop-blur-xl rounded-[40px] p-8 md:p-12 border border-white shadow-[0_20px_80px_rgba(0,0,0,0.03)] relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-700 pointer-events-none -rotate-12">
              <Building2 size={250} strokeWidth={0.5} />
            </div>
            
            <div className="relative z-10 flex items-center gap-5 mb-10 md:mb-12">
              <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-500 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500">
                <Building2 size={32} />
              </div>
              <div>
                <h3 className="text-2xl md:text-3xl font-black tracking-tight">Hồ sơ khách sạn</h3>
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Thông tin cơ bản hiển thị trên hệ thống & hóa đơn</p>
              </div>
            </div>

            <div className="relative z-10 grid gap-8 md:gap-10">
              {/* Hotel Name */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Tên Khách sạn</label>
                <div className="relative group">
                  <input 
                    type="text" 
                    value={settings.hotel_name || ''}
                    onChange={(e) => setSettings({...settings, hotel_name: e.target.value})}
                    className="w-full h-18 md:h-20 px-8 pl-16 rounded-[28px] bg-slate-50 border border-transparent font-black text-xl md:text-2xl text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-200"
                    placeholder="Nhập tên khách sạn..."
                  />
                  <Building2 className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-200 group-focus-within:text-blue-400 transition-colors" size={24} />
                </div>
              </div>

              {/* Contact Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Số điện thoại</label>
                  <div className="relative group">
                    <input 
                      type="text" 
                      value={settings.hotel_phone || ''}
                      onChange={(e) => setSettings({...settings, hotel_phone: e.target.value})}
                      className="w-full h-18 md:h-20 px-8 pl-16 rounded-[28px] bg-slate-50 border border-transparent font-bold text-lg md:text-xl text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-200"
                      placeholder="Số điện thoại..."
                    />
                    <Phone className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-200 group-focus-within:text-blue-400 transition-colors" size={24} />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Email liên hệ</label>
                  <div className="relative group">
                    <input 
                      type="email" 
                      value={settings.hotel_email || ''}
                      onChange={(e) => setSettings({...settings, hotel_email: e.target.value})}
                      className="w-full h-18 md:h-20 px-8 pl-16 rounded-[28px] bg-slate-50 border border-transparent font-bold text-lg md:text-xl text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-200"
                      placeholder="Email liên hệ..."
                    />
                    <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-200 group-focus-within:text-blue-400 transition-colors" size={24} />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] ml-2">Địa chỉ khách sạn</label>
                <div className="relative group">
                  <input 
                    type="text" 
                    value={settings.hotel_address || ''}
                    onChange={(e) => setSettings({...settings, hotel_address: e.target.value})}
                    className="w-full h-18 md:h-20 px-8 pl-16 rounded-[28px] bg-slate-50 border border-transparent font-bold text-lg md:text-xl text-slate-900 outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all placeholder:text-slate-200"
                    placeholder="Địa chỉ chi tiết..."
                  />
                  <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-200 group-focus-within:text-blue-400 transition-colors" size={24} />
                </div>
              </div>

              {/* Branding Info */}
              <div className="p-8 rounded-[32px] bg-slate-50/50 border border-slate-100">
                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center shrink-0 mt-0.5">
                    <Info size={14} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-black text-slate-700 tracking-tight">Ghi chú vận hành</p>
                    <p className="text-xs font-medium text-slate-400 leading-relaxed">
                      Thông tin này sẽ được sử dụng để in trên hóa đơn thanh toán cho khách hàng và hiển thị ở tiêu đề trang web. Vui lòng đảm bảo thông tin chính xác để thuận tiện cho việc liên lạc.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 3. MOBILE FLOATING ACTION */}
      <div className="fixed bottom-10 left-0 right-0 px-6 md:hidden z-50">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full h-18 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-widest text-[13px] shadow-2xl shadow-slate-900/40 flex items-center justify-center gap-3 active:scale-95 transition-all"
        >
          {saving ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Save size={20} />}
          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </div>
    </div>
  );
}
