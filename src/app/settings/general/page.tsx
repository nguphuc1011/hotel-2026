'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, 
  Percent, 
  Trash2, 
  Plus, 
  Save, 
  Receipt,
  AlertCircle,
  CheckCircle2,
  Wrench,
  ChevronLeft
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TimeRules } from '@/types';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { toast } from 'sonner';

// --- Reusable Tab Components ---
const TabButton = ({ label, isActive, onClick }: { label: string, isActive: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      'relative rounded-full px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap',
      isActive ? 'text-white' : 'text-slate-500 hover:bg-slate-100'
    )}
  >
    {isActive && (
      <motion.div
        layoutId="active-tab-indicator"
        className="absolute inset-0 z-0 rounded-full bg-blue-600"
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      />
    )}
    <span className="relative z-10">{label}</span>
  </button>
);

const tabs = [
  { id: 'time', label: 'Quy định Giờ', icon: Clock },
  { id: 'tax', label: 'Thuế & Hóa đơn', icon: Receipt },
  { id: 'surcharge', label: 'Phụ thu', icon: Percent },
  { id: 'ai', label: 'Cấu hình AI', icon: Wrench },
];

export default function GeneralSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(tabs[0].id);

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
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'system_settings')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        if (data.value) {
          setTimeRules(prev => ({ ...prev, ...data.value }));
        }
        setTaxConfig({
          tax_code: data.tax_code || '',
          stay_tax: data.tax_config?.stay_tax || 5,
          service_tax: data.tax_config?.service_tax || 1.5
        });
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        key: 'system_settings',
        value: timeRules,
        tax_code: taxConfig.tax_code,
        tax_config: {
          stay_tax: taxConfig.stay_tax,
          service_tax: taxConfig.service_tax
        }
      };
      const { error } = await supabase
        .from('settings')
        .upsert([payload], { onConflict: 'key', ignoreDuplicates: false });

      if (error) throw error;
      
      toast.success('Đã lưu cài đặt thành công!');
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error('Có lỗi xảy ra khi lưu cài đặt!');
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
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-32">
      {/* Header with Back Button */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/settings" className="p-2 -ml-2 rounded-full active:bg-slate-200 transition-colors">
          <ChevronLeft className="h-6 w-6 text-slate-600" />
        </Link>
        <h1 className="text-xl font-bold text-slate-800">Cài đặt chung</h1>
      </div>

      {/* Tab Navigation - Apple Style Pill */}
      <div className="mb-8 sticky top-16 z-30 py-2 bg-slate-50/80 backdrop-blur-sm -mx-4 px-4">
        <div className="flex items-center justify-between rounded-2xl bg-slate-200/50 p-1 shadow-inner overflow-x-auto scrollbar-hide gap-1">
          {tabs.map(tab => (
            <TabButton 
              key={tab.id} 
              label={tab.label} 
              isActive={activeTab === tab.id} 
              onClick={() => setActiveTab(tab.id)} 
            />
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'time' && <TimeSettingsTab timeRules={timeRules} setTimeRules={setTimeRules} />}
          {activeTab === 'tax' && <TaxSettingsTab taxConfig={taxConfig} setTaxConfig={setTaxConfig} />}
          {activeTab === 'surcharge' && <SurchargeSettingsTab timeRules={timeRules} updateLateRule={updateLateRule} addLateRule={addLateRule} removeLateRule={removeLateRule} />}
          {activeTab === 'ai' && <AISettingsTab />}
        </motion.div>
      </AnimatePresence>

      {/* Floating Save Button - Apple Style */}
      <div className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="flex h-[56px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 text-base font-bold text-white shadow-xl shadow-blue-200 active:scale-[0.96] disabled:opacity-50 transition-all"
        >
          {saving ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
          ) : (
            <>
              <Save className="h-5 w-5" />
              LƯU THAY ĐỔI
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// --- Individual Tab Components ---

const TimeSettingsTab = ({ timeRules, setTimeRules }: any) => (
  <section className="space-y-6">
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
      <div className="flex items-center gap-2 mb-4 text-blue-600">
        <Clock className="h-5 w-5" />
        <h2 className="font-bold">Giờ nhận/trả phòng</h2>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Check-in</label>
          <input 
            type="time" 
            value={timeRules.check_in} 
            onChange={(e) => setTimeRules({...timeRules, check_in: e.target.value})} 
            className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-blue-200 outline-none transition-all" 
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Check-out</label>
          <input 
            type="time" 
            value={timeRules.check_out} 
            onChange={(e) => setTimeRules({...timeRules, check_out: e.target.value})} 
            className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-blue-200 outline-none transition-all" 
          />
        </div>
      </div>
    </div>

    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
      <div className="flex items-center gap-2 mb-4 text-purple-600">
        <Clock className="h-5 w-5" />
        <h2 className="font-bold">Khung giờ đêm</h2>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Bắt đầu</label>
          <input 
            type="time" 
            value={timeRules.overnight.start} 
            onChange={(e) => setTimeRules({...timeRules, overnight: { ...timeRules.overnight, start: e.target.value }})} 
            className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-purple-200 outline-none transition-all" 
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Kết thúc</label>
          <input 
            type="time" 
            value={timeRules.overnight.end} 
            onChange={(e) => setTimeRules({...timeRules, overnight: { ...timeRules.overnight, end: e.target.value }})} 
            className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-purple-200 outline-none transition-all" 
          />
        </div>
      </div>
    </div>

    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Mốc tính 1 ngày</label>
        <input 
          type="time" 
          value={timeRules.full_day_late_after} 
          onChange={(e) => setTimeRules({...timeRules, full_day_late_after: e.target.value})} 
          className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-blue-200 outline-none transition-all" 
        />
        <p className="mt-2 text-xs text-slate-400 italic">Ví dụ: Trả phòng sau 18:00 sẽ tính thêm 1 ngày tiền phòng.</p>
      </div>
    </div>
  </section>
);

const TaxSettingsTab = ({ taxConfig, setTaxConfig }: any) => (
  <section className="space-y-6">
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 space-y-6">
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Mã số thuế</label>
        <input 
          type="text" 
          placeholder="Nhập mã số thuế..." 
          value={taxConfig.tax_code} 
          onChange={(e) => setTaxConfig({...taxConfig, tax_code: e.target.value})} 
          className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-blue-200 outline-none transition-all placeholder:text-slate-300" 
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">% Thuế Lưu trú</label>
          <div className="relative">
            <input 
              type="number" 
              value={taxConfig.stay_tax} 
              onChange={(e) => setTaxConfig({...taxConfig, stay_tax: Number(e.target.value)})} 
              className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-blue-200 outline-none transition-all pr-10" 
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">%</span>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">% Thuế Dịch vụ</label>
          <div className="relative">
            <input 
              type="number" 
              value={taxConfig.service_tax} 
              onChange={(e) => setTaxConfig({...taxConfig, service_tax: Number(e.target.value)})} 
              className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-blue-200 outline-none transition-all pr-10" 
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">%</span>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const SurchargeSettingsTab = ({ timeRules, updateLateRule, addLateRule, removeLateRule }: any) => (
  <section className="space-y-4">
    <div className="flex items-center justify-between px-2 mb-2">
       <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Danh sách mốc phụ thu</span>
       <button onClick={addLateRule} className="flex items-center gap-1 rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white active:scale-95 transition-transform shadow-lg shadow-blue-100">
        <Plus className="h-4 w-4" /> Thêm mới
      </button>
    </div>
    <div className="space-y-3">
      {timeRules.late_rules.map((rule: any, index: number) => (
        <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={index} className="flex items-center gap-3 rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm">
          <div className="grid flex-1 grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase ml-1">Từ</span>
              <input type="time" value={rule.from} onChange={(e) => updateLateRule(index, 'from', e.target.value)} className="w-full bg-slate-50 rounded-xl p-2 font-bold text-slate-800 outline-none" />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase ml-1">Đến</span>
              <input type="time" value={rule.to} onChange={(e) => updateLateRule(index, 'to', e.target.value)} className="w-full bg-slate-50 rounded-xl p-2 font-bold text-slate-800 outline-none" />
            </div>
            <div className="col-span-2 space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase ml-1">Phụ thu (%)</span>
              <div className="flex items-center gap-3">
                <input type="number" value={rule.percent} onChange={(e) => updateLateRule(index, 'percent', Number(e.target.value))} className="flex-1 bg-slate-50 rounded-xl p-2 font-bold text-slate-800 outline-none" />
                <button onClick={() => removeLateRule(index)} className="rounded-xl bg-rose-50 p-3 text-rose-500 active:scale-90 transition-transform">
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
      {timeRules.late_rules.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-slate-200 py-12 text-slate-400 bg-white/50">
          <AlertCircle className="h-10 w-10 mb-3 opacity-20" />
          <p className="font-medium">Chưa có quy định phụ thu</p>
        </div>
      )}
    </div>
  </section>
);

const AISettingsTab = () => (
    <section>
        <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-slate-200 bg-white/50 py-20 text-slate-400">
            <div className="p-5 bg-slate-100 rounded-full mb-4">
              <Wrench className="h-10 w-10 opacity-30" />
            </div>
            <h3 className="text-lg font-bold text-slate-600 mb-1">Tính năng AI</h3>
            <p className="text-sm text-center px-10 leading-relaxed">Cấu hình giọng nói và nhận diện giấy tờ (OCR) đang được phát triển.</p>
        </div>
    </section>
);
