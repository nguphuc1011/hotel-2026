'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Save, Loader2, Bot, ChevronLeft, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SystemSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    telegram_bot_token: '',
    telegram_chat_id: ''
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('telegram_bot_token, telegram_chat_id')
        .eq('key', 'config')
        .single();

      if (error) throw error;
      
      if (data) {
        setConfig({
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
    setSaving(true);
    try {
      const { error } = await supabase
        .from('settings')
        .update({
          telegram_bot_token: config.telegram_bot_token,
          telegram_chat_id: config.telegram_chat_id,
          updated_at: new Date().toISOString()
        })
        .eq('key', 'config');

      if (error) throw error;
      toast.success('Đã lưu cấu hình thành công!');
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error('Lỗi khi lưu: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]"><div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full"></div></div>;

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-8 pb-32 font-sans">
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
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
                <Settings size={28} />
              </div>
              <div>
                <h1 className="text-4xl font-black tracking-tighter text-slate-900">
                  Cấu hình hệ thống
                </h1>
                <p className="text-slate-500 font-medium text-base mt-1">
                  Quản lý các cấu hình hệ thống và tích hợp
                </p>
              </div>
            </div>
          </div>
          
          <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-lg shadow-slate-900/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Save size={20} />}
            <span>Lưu thay đổi</span>
          </button>
        </div>

        {/* Telegram Integration */}
        <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-[100px] -mr-8 -mt-8 opacity-50 group-hover:scale-110 transition-transform duration-500" />
          
          <div className="flex items-center gap-4 mb-8 relative">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-[20px] flex items-center justify-center shadow-sm">
              <Bot size={28} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Telegram Notification</h3>
              <p className="text-slate-500 font-medium text-sm">Cấu hình bot Telegram để nhận thông báo</p>
            </div>
          </div>

          <div className="grid gap-6 relative">
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Bot Token</label>
              <div className="relative group/input">
                <input 
                  type="text" 
                  value={config.telegram_bot_token}
                  onChange={(e) => setConfig({...config, telegram_bot_token: e.target.value})}
                  className="w-full h-14 px-5 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300 placeholder:font-normal"
                  placeholder="Nhập Bot Token..."
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Chat ID</label>
              <div className="relative group/input">
                <input 
                  type="text" 
                  value={config.telegram_chat_id}
                  onChange={(e) => setConfig({...config, telegram_chat_id: e.target.value})}
                  className="w-full h-14 px-5 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300 placeholder:font-normal"
                  placeholder="Nhập Chat ID..."
                />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
