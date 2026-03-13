
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Building2, MapPin, Phone, Mail, Save } from 'lucide-react';
import { settingsService, Settings } from '@/services/settingsService';
import { toast } from 'sonner';

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
      // Force refresh or reload if needed to update AppShell
      // router.refresh(); 
      // A full reload might be needed to update the layout if we don't use a context
      window.location.reload();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Lỗi khi lưu cấu hình');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]"><div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full"></div></div>;
  if (!settings) return <div className="p-8">Không có dữ liệu cấu hình.</div>;

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-8 pb-32 font-sans">
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <button 
              onClick={() => router.back()}
              className="group flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-2 font-bold"
            >
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center group-hover:border-slate-300 group-hover:bg-slate-50 transition-all">
                <ChevronLeft size={16} />
              </div>
              <span>Quay lại</span>
            </button>
            <h1 className="text-4xl font-black tracking-tighter text-slate-900">
              Cấu hình chung
            </h1>
            <p className="text-slate-500 font-medium text-base">
              Thông tin cơ bản về khách sạn của bạn
            </p>
          </div>
          
          <button 
            onClick={handleSave}
            disabled={saving}
            className="hidden md:flex bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold items-center gap-3 shadow-lg shadow-slate-900/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Save size={20} />}
            <span>Lưu thay đổi</span>
          </button>
        </div>

        {/* Card: Thông tin khách sạn */}
        <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-[100px] -mr-8 -mt-8 opacity-50 group-hover:scale-110 transition-transform duration-500" />
          
          <div className="flex items-center gap-4 mb-8 relative">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-[20px] flex items-center justify-center shadow-sm">
              <Building2 size={28} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Thông tin Khách sạn</h3>
              <p className="text-slate-500 font-medium text-sm">Thông tin hiển thị trên hóa đơn và hệ thống</p>
            </div>
          </div>

          <div className="grid gap-6 relative">
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Tên Khách sạn</label>
              <div className="relative group/input">
                <Building2 className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-500 transition-colors" size={20} />
                <input 
                  type="text" 
                  value={settings.hotel_name || ''}
                  onChange={(e) => setSettings({...settings, hotel_name: e.target.value})}
                  className="w-full h-14 pl-12 pr-5 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300 placeholder:font-normal"
                  placeholder="Nhập tên khách sạn..."
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Số điện thoại</label>
                <div className="relative group/input">
                  <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-500 transition-colors" size={20} />
                  <input 
                    type="text" 
                    value={settings.hotel_phone || ''}
                    onChange={(e) => setSettings({...settings, hotel_phone: e.target.value})}
                    className="w-full h-14 pl-12 pr-5 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300 placeholder:font-normal"
                    placeholder="Số điện thoại..."
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Email liên hệ</label>
                <div className="relative group/input">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-500 transition-colors" size={20} />
                  <input 
                    type="email" 
                    value={settings.hotel_email || ''}
                    onChange={(e) => setSettings({...settings, hotel_email: e.target.value})}
                    className="w-full h-14 pl-12 pr-5 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300 placeholder:font-normal"
                    placeholder="Email..."
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Địa chỉ</label>
              <div className="relative group/input">
                <MapPin className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/input:text-blue-500 transition-colors" size={20} />
                <input 
                  type="text" 
                  value={settings.hotel_address || ''}
                  onChange={(e) => setSettings({...settings, hotel_address: e.target.value})}
                  className="w-full h-14 pl-12 pr-5 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300 placeholder:font-normal"
                  placeholder="Địa chỉ khách sạn..."
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Fixed Footer */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-slate-100 md:hidden z-50">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="w-full h-14 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-slate-900/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Save size={20} />}
          <span>Lưu thay đổi</span>
        </button>
      </div>
    </div>
  );
}
