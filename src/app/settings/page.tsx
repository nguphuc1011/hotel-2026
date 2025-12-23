'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, 
  Percent, 
  Trash2, 
  Plus, 
  Save, 
  ArrowLeft,
  Receipt,
  AlertCircle,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Setting, TimeRules } from '@/types';

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [settingId, setSettingId] = useState<string | null>(null);

  // Form State
  const [timeRules, setTimeRules] = useState<TimeRules & { full_day_late_after?: string }>({
    check_in: '14:00',
    check_out: '12:00',
    overnight: { start: '22:00', end: '08:00' },
    early_rules: [],
    late_rules: [
      { from: '12:00', to: '15:00', percent: 30 },
      { from: '15:00', to: '18:00', percent: 50 },
    ],
    full_day_late_after: '18:00'
  });

  const [taxConfig, setTaxConfig] = useState({
    tax_code: '',
    stay_tax: 5,
    service_tax: 1.5
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      // Tìm cấu hình hệ thống theo key 'system_settings'
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'system_settings')
        .maybeSingle(); // Dùng maybeSingle thay vì single để không văng lỗi nếu chưa có dòng nào

      if (error) throw error;

      if (data) {
        setSettingId(data.id);
        
        // Map Time Rules từ value (JSONB)
        if (data.value) {
          setTimeRules(prev => ({
            ...prev,
            ...data.value
          }));
        }

        // Map Tax Config từ các cột mới
        setTaxConfig({
          tax_code: data.tax_code || '',
          stay_tax: data.tax_config?.stay_tax || 5,
          service_tax: data.tax_config?.service_tax || 1.5
        });
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      // Không alert ở đây để tránh làm phiền người dùng nếu chỉ là do mạng lag
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Payload chuẩn cho cả insert và update
      const payload = {
        key: 'system_settings', // Đảm bảo luôn có key cố định
        value: timeRules,
        tax_code: taxConfig.tax_code,
        tax_config: {
          stay_tax: taxConfig.stay_tax,
          service_tax: taxConfig.service_tax
        }
      };

      // Sử dụng upsert để tự động xử lý: Nếu đã có thì update, chưa có thì insert
      // onConflict: 'key' giúp xác định dòng dựa trên cột 'key' thay vì 'id'
      const { data, error } = await supabase
        .from('settings')
        .upsert([payload], { 
          onConflict: 'key',
          ignoreDuplicates: false 
        })
        .select()
        .single();

      if (error) throw error;
      
      if (data) {
        setSettingId(data.id);
      }
      
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      // Không cần fetchSettings() lại vì đã có data mới nhất từ .select().single()
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('Có lỗi xảy ra khi lưu cài đặt! (Chi tiết: ' + (err as any).message + ')');
    } finally {
      setSaving(false);
    }
  };

  const addLateRule = () => {
    setTimeRules({
      ...timeRules,
      late_rules: [
        ...timeRules.late_rules,
        { from: '12:00', to: '13:00', percent: 10 }
      ]
    });
  };

  const removeLateRule = (index: number) => {
    const newRules = [...timeRules.late_rules];
    newRules.splice(index, 1);
    setTimeRules({ ...timeRules, late_rules: newRules });
  };

  const updateLateRule = (index: number, field: string, value: any) => {
    const newRules = [...timeRules.late_rules];
    newRules[index] = { ...newRules[index], [field]: value };
    setTimeRules({ ...timeRules, late_rules: newRules });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-white/80 px-4 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.back()}
            className="rounded-full p-2 hover:bg-zinc-100"
          >
            <ArrowLeft className="h-6 w-6 text-zinc-600" />
          </button>
          <h1 className="text-2xl font-black text-zinc-900">Cài đặt hệ thống</h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6 space-y-8">
        
        {/* A. Khối Quy định Giờ */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-zinc-500 uppercase tracking-wider">Quy định Giờ</h2>
          </div>
          
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            {/* Check-in/out */}
            <div className="grid grid-cols-2 border-b border-zinc-100">
              <div className="p-4 border-r border-zinc-100">
                <label className="block text-sm font-bold text-zinc-500 mb-1">Giờ nhận phòng</label>
                <input 
                  type="time" 
                  value={timeRules.check_in}
                  onChange={(e) => setTimeRules({...timeRules, check_in: e.target.value})}
                  className="h-[50px] w-full bg-transparent text-xl font-bold text-zinc-900 focus:outline-none"
                />
              </div>
              <div className="p-4">
                <label className="block text-sm font-bold text-zinc-500 mb-1">Giờ trả phòng</label>
                <input 
                  type="time" 
                  value={timeRules.check_out}
                  onChange={(e) => setTimeRules({...timeRules, check_out: e.target.value})}
                  className="h-[50px] w-full bg-transparent text-xl font-bold text-zinc-900 focus:outline-none"
                />
              </div>
            </div>

            {/* Overnight start/end */}
            <div className="grid grid-cols-2 border-b border-zinc-100 bg-zinc-50/30">
              <div className="p-4 border-r border-zinc-100">
                <label className="block text-sm font-bold text-zinc-500 mb-1">Bắt đầu Đêm</label>
                <input 
                  type="time" 
                  value={timeRules.overnight.start}
                  onChange={(e) => setTimeRules({
                    ...timeRules, 
                    overnight: { ...timeRules.overnight, start: e.target.value }
                  })}
                  className="h-[50px] w-full bg-transparent text-xl font-bold text-zinc-900 focus:outline-none"
                />
              </div>
              <div className="p-4">
                <label className="block text-sm font-bold text-zinc-500 mb-1">Kết thúc Đêm</label>
                <input 
                  type="time" 
                  value={timeRules.overnight.end}
                  onChange={(e) => setTimeRules({
                    ...timeRules, 
                    overnight: { ...timeRules.overnight, end: e.target.value }
                  })}
                  className="h-[50px] w-full bg-transparent text-xl font-bold text-zinc-900 focus:outline-none"
                />
              </div>
            </div>

            {/* Full day late after */}
            <div className="p-4">
              <label className="block text-sm font-bold text-zinc-500 mb-1">Mốc tính 1 ngày (Trễ sau giờ này)</label>
              <input 
                type="time" 
                value={timeRules.full_day_late_after}
                onChange={(e) => setTimeRules({...timeRules, full_day_late_after: e.target.value})}
                className="h-[50px] w-full bg-transparent text-xl font-bold text-zinc-900 focus:outline-none"
              />
              <p className="mt-1 text-sm text-zinc-400 italic">* Ví dụ: Sau 18:00 sẽ tự động tính thêm 1 ngày</p>
            </div>
          </div>
        </section>

        {/* B. Khối Cấu hình Thuế 2026 */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <Receipt className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-zinc-500 uppercase tracking-wider">Cấu hình Thuế 2026</h2>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm divide-y divide-zinc-100">
            <div className="p-4">
              <label className="block text-sm font-bold text-zinc-500 mb-1">Mã số thuế</label>
              <input 
                type="text" 
                placeholder="Nhập mã số thuế..."
                value={taxConfig.tax_code}
                onChange={(e) => setTaxConfig({...taxConfig, tax_code: e.target.value})}
                className="h-[50px] w-full bg-transparent text-xl font-bold text-zinc-900 focus:outline-none placeholder:text-zinc-300"
              />
            </div>
            
            <div className="grid grid-cols-2">
              <div className="p-4 border-r border-zinc-100">
                <label className="block text-sm font-bold text-zinc-500 mb-1">% Thuế Lưu trú</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    value={taxConfig.stay_tax}
                    onChange={(e) => setTaxConfig({...taxConfig, stay_tax: Number(e.target.value)})}
                    className="h-[50px] w-full bg-transparent text-xl font-bold text-zinc-900 focus:outline-none"
                  />
                  <span className="text-xl font-bold text-zinc-400">%</span>
                </div>
              </div>
              <div className="p-4">
                <label className="block text-sm font-bold text-zinc-500 mb-1">% Thuế Dịch vụ</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="number" 
                    value={taxConfig.service_tax}
                    onChange={(e) => setTaxConfig({...taxConfig, service_tax: Number(e.target.value)})}
                    className="h-[50px] w-full bg-transparent text-xl font-bold text-zinc-900 focus:outline-none"
                  />
                  <span className="text-xl font-bold text-zinc-400">%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* C. Khối Luật Phụ thu */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-orange-600" />
              <h2 className="text-lg font-bold text-zinc-500 uppercase tracking-wider">Luật Phụ thu (Trễ giờ)</h2>
            </div>
            <button 
              onClick={addLateRule}
              className="flex items-center gap-1 rounded-full bg-orange-50 px-4 py-2 text-sm font-bold text-orange-600 active:scale-95 transition-transform"
            >
              <Plus className="h-4 w-4" /> Thêm mốc
            </button>
          </div>

          <div className="space-y-3">
            {timeRules.late_rules.map((rule, index) => (
              <motion.div 
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={index}
                className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm"
              >
                <div className="grid flex-1 grid-cols-3 gap-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Từ</span>
                    <input 
                      type="time" 
                      value={rule.from}
                      onChange={(e) => updateLateRule(index, 'from', e.target.value)}
                      className="h-10 text-lg font-bold text-zinc-900 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Đến</span>
                    <input 
                      type="time" 
                      value={rule.to}
                      onChange={(e) => updateLateRule(index, 'to', e.target.value)}
                      className="h-10 text-lg font-bold text-zinc-900 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Phụ thu</span>
                    <div className="flex items-center gap-1">
                      <input 
                        type="number" 
                        value={rule.percent}
                        onChange={(e) => updateLateRule(index, 'percent', Number(e.target.value))}
                        className="h-10 w-full text-lg font-bold text-zinc-900 focus:outline-none"
                      />
                      <span className="font-bold text-zinc-400">%</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => removeLateRule(index)}
                  className="rounded-full bg-red-50 p-3 text-red-500 active:scale-90 transition-transform"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </motion.div>
            ))}
            {timeRules.late_rules.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 py-10 text-zinc-400">
                <AlertCircle className="h-8 w-8 mb-2 opacity-20" />
                <p>Chưa có luật phụ thu nào</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Save Button - RẤT LỚN & Cố định */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white/80 p-4 backdrop-blur-md z-40">
        <div className="mx-auto max-w-2xl">
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-xl font-black text-white shadow-lg shadow-blue-200 active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {saving ? (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            ) : (
              <>
                <Save className="h-6 w-6" />
                LƯU THAY ĐỔI
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed inset-x-4 bottom-24 z-50 flex justify-center"
          >
            <div className="flex items-center gap-3 rounded-full bg-zinc-900 px-6 py-4 text-white shadow-2xl">
              <div className="rounded-full bg-emerald-500 p-1">
                <CheckCircle2 className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-wide">Đã lưu thành công!</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
