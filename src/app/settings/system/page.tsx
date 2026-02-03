'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Save, Loader2, MessageSquare, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

export default function SystemSettingsPage() {
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-8 md:p-16 max-w-4xl mx-auto pb-32">
      <header className="mb-12">
        <div className="flex items-center gap-2 text-slate-500 mb-4 text-sm font-medium uppercase tracking-wider">
          <Link href="/settings" className="hover:text-blue-600 transition-colors">Cài đặt</Link>
          <span>/</span>
          <span className="text-slate-900">Hệ thống</span>
        </div>
        <h1 className="text-4xl font-black-italic tracking-tighter uppercase italic text-slate-900">
          Cấu hình Hệ thống
        </h1>
        <p className="text-slate-500 mt-2 font-medium">
          Quản lý các kết nối và tích hợp bên ngoài
        </p>
      </header>

      <div className="space-y-8">
        {/* Telegram Section */}
        <section className="bg-white rounded-3xl p-8 border border-slate-100 shadow-xl shadow-slate-200/50">
          <div className="flex items-start gap-6 mb-8">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 shrink-0">
              <MessageSquare size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Telegram Bot</h2>
              <p className="text-slate-500 leading-relaxed">
                Cấu hình Bot để nhận thông báo duyệt yêu cầu từ xa. 
                Bạn cần tạo Bot qua @BotFather và lấy Token, sau đó thêm Bot vào nhóm chat để lấy Chat ID.
              </p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider">
                Bot Token
              </label>
              <input 
                type="password"
                value={config.telegram_bot_token}
                onChange={(e) => setConfig({...config, telegram_bot_token: e.target.value})}
                placeholder="123456789:ABCdefGhIjkLmNoPqRsTuVwXyZ"
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-mono text-sm focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
              />
              <p className="text-xs text-slate-400">
                Lấy từ @BotFather
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider">
                Chat ID
              </label>
              <input 
                type="text"
                value={config.telegram_chat_id}
                onChange={(e) => setConfig({...config, telegram_chat_id: e.target.value})}
                placeholder="-100123456789"
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-mono text-sm focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
              />
              <p className="text-xs text-slate-400">
                ID của nhóm chat hoặc cá nhân nhận thông báo
              </p>
            </div>

            <div className="pt-6 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                Lưu cấu hình
              </button>
            </div>
          </form>
        </section>

        {/* Warning Section */}
        <div className="bg-amber-50 rounded-2xl p-6 flex gap-4 text-amber-800">
            <ShieldAlert className="w-6 h-6 shrink-0" />
            <div className="text-sm">
                <strong>Lưu ý bảo mật:</strong> Token này cho phép gửi tin nhắn dưới danh nghĩa Bot. 
                Vui lòng không chia sẻ cho người lạ. Hệ thống chỉ hiển thị Token cho tài khoản Admin/Owner.
            </div>
        </div>
      </div>
    </div>
  );
}
