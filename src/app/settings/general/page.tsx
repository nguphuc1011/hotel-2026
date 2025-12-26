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
  Wrench,
  ChevronLeft
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { TimeRules } from '@/types';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useNotification } from '../../../context/NotificationContext';
import { NumericInput } from '@/components/ui/NumericInput';

// Force dynamic to avoid prerender issues on some environments
export const dynamic = 'force-dynamic';

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
  const context = useNotification();
  const showNotification = context ? context.showNotification : () => {};

  const [timeRules, setTimeRules] = useState<TimeRules>({
    check_in: '14:00',
    check_out: '12:00',
    overnight: { start: '22:00', end: '08:00' },
    early_rules: [],
    late_rules: [
      { from: '12:00', to: '15:00', percent: 30 },
      { from: '15:00', to: '18:00', percent: 50 },
    ],
    full_day_early_before: '05:00',
    full_day_late_after: '18:00'
  });

  const [enableAutoSurcharge, setEnableAutoSurcharge] = useState(true);

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
          if (data.value.enableAutoSurcharge !== undefined) {
            setEnableAutoSurcharge(data.value.enableAutoSurcharge);
          }
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
        value: {
          ...timeRules,
          enableAutoSurcharge
        },
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
      
      showNotification('Đã lưu cài đặt thành công!', 'success');
    } catch (err) {
      console.error('Error saving settings:', err);
      showNotification('Có lỗi xảy ra khi lưu cài đặt!', 'error');
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

  const addEarlyRule = () => {
    setTimeRules({
      ...timeRules,
      early_rules: [
        ...(timeRules.early_rules || []),
        { from: '08:00', to: '12:00', percent: 10 }
      ]
    });
  };

  const removeEarlyRule = (index: number) => {
    const newRules = [...(timeRules.early_rules || [])];
    newRules.splice(index, 1);
    setTimeRules({ ...timeRules, early_rules: newRules });
  };

  const updateEarlyRule = (index: number, field: string, value: any) => {
    const newRules = [...(timeRules.early_rules || [])];
    newRules[index] = { ...newRules[index], [field]: value };
    setTimeRules({ ...timeRules, early_rules: newRules });
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
          {activeTab === 'surcharge' && (
            <SurchargeSettingsTab 
              timeRules={timeRules} 
              updateLateRule={updateLateRule} 
              addLateRule={addLateRule} 
              removeLateRule={removeLateRule} 
              updateEarlyRule={updateEarlyRule}
              addEarlyRule={addEarlyRule}
              removeEarlyRule={removeEarlyRule}
              enableAutoSurcharge={enableAutoSurcharge}
              setEnableAutoSurcharge={setEnableAutoSurcharge}
            />
          )}
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
      <div className="flex items-center gap-2 mb-4 text-orange-600">
        <Clock className="h-5 w-5" />
        <h2 className="font-bold">Thời gian ân hạn (Grace Period)</h2>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Ân hạn phòng giờ (phút)</label>
          <NumericInput 
            value={timeRules.hourly_grace_period_minutes || 15} 
            onChange={(val) => setTimeRules({...timeRules, hourly_grace_period_minutes: val})} 
            className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-orange-200 outline-none transition-all" 
          />
           <p className="mt-1 text-[10px] text-slate-400 italic">Khách quá giờ trong khoảng này không bị tính thêm giờ.</p>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Ân hạn trả muộn (giờ)</label>
          <NumericInput 
            value={timeRules.daily_grace_period_hours || 2} 
            onChange={(val) => setTimeRules({...timeRules, daily_grace_period_hours: val})} 
            className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-orange-200 outline-none transition-all" 
          />
          <p className="mt-1 text-[10px] text-slate-400 italic">Khách trả muộn trong khoảng này không bị tính phụ thu.</p>
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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Mốc check-in sớm</label>
          <input 
            type="time" 
            value={timeRules.full_day_early_before} 
            onChange={(e) => setTimeRules({...timeRules, full_day_early_before: e.target.value})} 
            className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-blue-200 outline-none transition-all" 
          />
          <p className="mt-1 text-[10px] text-slate-400 italic">Nhận phòng trước giờ này tính thêm 1 ngày.</p>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">Mốc trả muộn</label>
          <input 
            type="time" 
            value={timeRules.full_day_late_after} 
            onChange={(e) => setTimeRules({...timeRules, full_day_late_after: e.target.value})} 
            className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-blue-200 outline-none transition-all" 
          />
          <p className="mt-1 text-[10px] text-slate-400 italic">Trả phòng sau giờ này tính thêm 1 ngày.</p>
        </div>
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
            <NumericInput 
              value={taxConfig.stay_tax} 
              onChange={(val) => setTaxConfig({...taxConfig, stay_tax: val})} 
              className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-blue-200 outline-none transition-all pr-10" 
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">%</span>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">% Thuế Dịch vụ</label>
          <div className="relative">
            <NumericInput 
              value={taxConfig.service_tax} 
              onChange={(val) => setTaxConfig({...taxConfig, service_tax: val})} 
              className="w-full p-4 bg-slate-50 border border-transparent rounded-2xl text-lg font-bold text-slate-800 focus:bg-white focus:border-blue-200 outline-none transition-all pr-10" 
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">%</span>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const SurchargeSettingsTab = ({ 
  timeRules, 
  updateLateRule, 
  addLateRule, 
  removeLateRule,
  updateEarlyRule,
  addEarlyRule,
  removeEarlyRule,
  enableAutoSurcharge,
  setEnableAutoSurcharge
}: any) => (
  <section className="space-y-4">
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-800">Phụ thu tự động</h3>
          <p className="text-xs text-slate-500">Hệ thống tự tính % phụ thu khi check-out</p>
        </div>
        <button 
          onClick={() => setEnableAutoSurcharge(!enableAutoSurcharge)}
          className={cn(
            "relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none",
            enableAutoSurcharge ? "bg-blue-600" : "bg-slate-200"
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
              enableAutoSurcharge ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>
    </div>

    {/* Late Check-out Section */}
    <div className="flex items-center justify-between px-2 mb-2">
       <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Phụ thu Trả muộn (Late)</span>
       <button onClick={addLateRule} className="flex items-center gap-1 rounded-full bg-blue-600 px-4 py-2 text-xs font-bold text-white active:scale-95 transition-transform shadow-lg shadow-blue-100">
        <Plus className="h-4 w-4" /> Thêm mới
      </button>
    </div>
    <div className="space-y-3 mb-8">
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
                <NumericInput value={rule.percent} onChange={(val) => updateLateRule(index, 'percent', val)} className="flex-1 bg-slate-50 rounded-xl p-2 font-bold text-slate-800 outline-none" />
                <button onClick={() => removeLateRule(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
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
          <p className="font-medium text-xs">Chưa có quy định trả muộn</p>
        </div>
      )}
    </div>

    {/* Early Check-in Section */}
    <div className="flex items-center justify-between px-2 mb-2">
       <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Phụ thu Nhận sớm (Early)</span>
       <button onClick={addEarlyRule} className="flex items-center gap-1 rounded-full bg-purple-600 px-4 py-2 text-xs font-bold text-white active:scale-95 transition-transform shadow-lg shadow-purple-100">
        <Plus className="h-4 w-4" /> Thêm mới
      </button>
    </div>
    <div className="space-y-3">
      {(timeRules.early_rules || []).map((rule: any, index: number) => (
        <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={index} className="flex items-center gap-3 rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm">
          <div className="grid flex-1 grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase ml-1">Từ</span>
              <input type="time" value={rule.from} onChange={(e) => updateEarlyRule(index, 'from', e.target.value)} className="w-full bg-slate-50 rounded-xl p-2 font-bold text-slate-800 outline-none" />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase ml-1">Đến</span>
              <input type="time" value={rule.to} onChange={(e) => updateEarlyRule(index, 'to', e.target.value)} className="w-full bg-slate-50 rounded-xl p-2 font-bold text-slate-800 outline-none" />
            </div>
            <div className="col-span-2 space-y-1">
              <span className="text-[10px] font-black text-slate-400 uppercase ml-1">Phụ thu (%)</span>
              <div className="flex items-center gap-3">
                <NumericInput value={rule.percent} onChange={(val) => updateEarlyRule(index, 'percent', val)} className="flex-1 bg-slate-50 rounded-xl p-2 font-bold text-slate-800 outline-none" />
                <button onClick={() => removeEarlyRule(index)} className="rounded-xl bg-rose-50 p-3 text-rose-500 active:scale-90 transition-transform">
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
      {(!timeRules.early_rules || timeRules.early_rules.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-slate-200 py-12 text-slate-400 bg-white/50">
          <AlertCircle className="h-10 w-10 mb-3 opacity-20" />
          <p className="font-medium text-xs">Chưa có quy định nhận sớm</p>
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
