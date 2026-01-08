'use client';

import React, { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
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
  ChevronLeft,
  Timer,
  ChevronDown
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
const TabButton = ({ label, icon: Icon, isActive, onClick }: { label: string, icon: any, isActive: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      'relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-200 whitespace-nowrap',
      isActive ? 'text-blue-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
    )}
  >
    {isActive && (
      <motion.div
        layoutId="active-tab-indicator"
        className="absolute inset-0 z-0 rounded-xl bg-blue-50 border border-blue-100"
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      />
    )}
    <Icon className={cn("h-3.5 w-3.5 relative z-10", isActive ? "text-blue-600" : "text-slate-400")} />
    <span className="relative z-10">{label}</span>
  </button>
);

const tabs = [
  { id: 'basic', label: 'Giờ giấc', icon: Clock },
  { id: 'hourly', label: 'Tiền giờ', icon: Clock },
  { id: 'surcharge', label: 'Phụ thu', icon: Percent },
  { id: 'grace', label: 'Ân hạn', icon: Clock },
  { id: 'other', label: 'Tiện ích', icon: Wrench },
];

const fetchSettings = async () => {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('key', 'system_settings')
    .maybeSingle();

  if (error) throw error;
  return data || {};
};

export default function GeneralSettingsPage() {
  const { data: remoteData, error: fetchError, isLoading: loading } = useSWR('system_settings', fetchSettings);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const context = useNotification();
  const showNotification = context ? context.showNotification : () => {};

  const [timeRules, setTimeRules] = useState<TimeRules>({
    check_in: '14:00',
    check_out: '12:00',
    overnight: { start: '22:00', end: '08:00' },
    overnight_checkout_enabled: true,
    overnight_checkout: '10:00',
    hourly_mode: 'incremental',
    base_hourly_limit: 1,
    hourly_unit: 60,
    hourly_ceiling_enabled: false,
    hourly_ceiling_percent: 100,
    early_rules: [],
    late_rules: [
      { from: '12:00', to: '15:00', percent: 30 },
      { from: '15:00', to: '18:00', percent: 50 },
    ],
    full_day_early_before: '05:00',
    full_day_late_after: '18:00',
    initial_grace_enabled: true,
    initial_grace_minutes: 15,
    late_grace_enabled: true,
    late_grace_minutes: 15,
    extra_person_enabled: false,
    extra_person_fee_adult: 50000,
    extra_person_fee_child: 30000,
    surcharge_method: 'percent'
  });

  const [enableAutoSurcharge, setEnableAutoSurcharge] = useState(true);

  const [taxConfig, setTaxConfig] = useState({
    tax_code: '',
    stay_tax: 5,
    service_tax: 1.5
  });

  // Sync state with SWR data
  useEffect(() => {
    if (remoteData) {
      if (remoteData.value) {
        setTimeRules(prev => ({ ...prev, ...remoteData.value }));
        if (remoteData.value.enableAutoSurcharge !== undefined) {
          setEnableAutoSurcharge(remoteData.value.enableAutoSurcharge);
        }
      }
      
      // Support both structure: top-level (legacy) or inside value (new)
      const tax_code = remoteData.value?.tax_code || remoteData.tax_code || '';
      const tax_config = remoteData.value?.tax_config || remoteData.tax_config;
      
      setTaxConfig({
        tax_code,
        stay_tax: tax_config?.vat || tax_config?.stay_tax || 5,
        service_tax: tax_config?.service_fee || tax_config?.service_tax || 1.5
      });
    }
  }, [remoteData]);

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // 1. Compile Pricing Strategy (Trung dung Strategy)
      // Fetch Room Categories to get base prices
      const { data: categories } = await supabase
        .from('room_categories')
        .select('id, prices');
        
      const compiledStrategy: Record<string, any> = {};
      
      if (categories) {
        categories.forEach((cat: any) => {
          const dailyPrice = Number(cat.prices?.daily || 0);
          
          // Compile Early Rules
          const earlyRules = (timeRules.early_rules || []).map((rule: any) => {
            let amount = 0;
            if (rule.type === 'percent') {
              amount = (dailyPrice * Number(rule.percent)) / 100;
            } else {
              amount = Number(rule.amount || 0);
            }
            return {
              from: rule.from,
              to: rule.to,
              amount: Math.round(amount)
            };
          });

          // Compile Late Rules
          const lateRules = (timeRules.late_rules || []).map((rule: any) => {
            let amount = 0;
            if (rule.type === 'percent') {
              amount = (dailyPrice * Number(rule.percent)) / 100;
            } else {
              amount = Number(rule.amount || 0);
            }
            return {
              from: rule.from,
              to: rule.to,
              amount: Math.round(amount)
            };
          });

          compiledStrategy[cat.id] = {
            early_rules: earlyRules,
            late_rules: lateRules
          };
        });
      }

      const payload = {
        key: 'system_settings',
        value: {
          ...timeRules,
          enableAutoSurcharge,
          tax_code: taxConfig.tax_code,
          tax_config: {
            vat: taxConfig.stay_tax,
            service_fee: taxConfig.service_tax
          }
        },
        compiled_pricing_strategy: compiledStrategy
      };

      // Optimistic update
      mutate('system_settings', { 
        ...remoteData, 
        value: payload.value,
        compiled_pricing_strategy: compiledStrategy 
      }, false);

      const { error } = await supabase
        .from('settings')
        .upsert([payload], { onConflict: 'key', ignoreDuplicates: false });

      if (error) throw error;
      showNotification('Lưu cấu hình thành công!', 'success');
      mutate('system_settings');
    } catch (err) {
      console.error(err);
      showNotification('Lỗi khi lưu cấu hình.', 'error');
      mutate('system_settings');
    } finally {
      setSaving(false);
    }
  };

  const addLateRule = () => {
    setTimeRules({
      ...timeRules,
      late_rules: [
        ...timeRules.late_rules,
        { from: '12:00', to: '13:00', percent: 10, type: 'percent' }
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
        { from: '08:00', to: '12:00', percent: 10, type: 'percent' }
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

      {/* Tab Navigation - Modern Sticky Design */}
      <div className="sticky top-0 z-50 -mx-4 px-4 pb-4 pt-2 bg-slate-50/80 backdrop-blur-md mb-2">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar max-w-md mx-auto">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              label={tab.label}
              icon={tab.icon}
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
          {activeTab === 'basic' && <BasicTimeTab timeRules={timeRules} setTimeRules={setTimeRules} />}
          {activeTab === 'hourly' && <HourlyPricingTab timeRules={timeRules} setTimeRules={setTimeRules} />}
          {activeTab === 'surcharge' && (
            <SurchargeTab 
              timeRules={timeRules} 
              setTimeRules={setTimeRules}
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
          {activeTab === 'grace' && <GracePeriodTab timeRules={timeRules} setTimeRules={setTimeRules} />}
          {activeTab === 'other' && (
            <OtherSettingsTab 
              timeRules={timeRules} 
              setTimeRules={setTimeRules} 
              taxConfig={taxConfig} 
              setTaxConfig={setTaxConfig} 
            />
          )}
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

// --- Reusable Modern Components ---

/**
 * Component SettingItem: Khung bao dùng chung cho mỗi mục cài đặt
 * @param label - Tên hiển thị của cài đặt
 * @param hint - Giải thích chi tiết hiện ra khi di chuột vào dấu !
 * @param enabled - Trạng thái bật/tắt (cho các tính năng có nút gạt)
 * @param onToggle - Hàm xử lý khi bấm nút gạt
 */
const SettingItem = ({ 
  label, 
  hint, 
  children, 
  icon: Icon, 
  enabled = true, 
  onToggle 
}: { 
  label: string, 
  hint: string, 
  children: React.ReactNode, 
  icon?: any,
  enabled?: boolean,
  onToggle?: (val: boolean) => void
}) => {
  const [showHint, setShowHint] = useState(false);

  return (
    <div className={cn("bg-white rounded-[1.5rem] p-5 shadow-sm border border-slate-100 transition-all relative", !enabled && "opacity-50 grayscale-[0.5]")}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-blue-600" />}
          <span className="font-bold text-slate-800 flex items-center gap-1.5">
            {label}
            <div 
              className="relative inline-block"
              onMouseEnter={() => setShowHint(true)}
              onMouseLeave={() => setShowHint(false)}
              onClick={(e) => {
                e.stopPropagation();
                setShowHint(!showHint);
              }}
            >
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-400 hover:bg-blue-100 hover:text-blue-600 cursor-help transition-colors">!</div>
              {showHint && (
                <div className="fixed md:absolute bottom-auto md:bottom-full left-4 md:left-0 right-4 md:right-auto top-1/2 md:top-auto -translate-y-1/2 md:translate-y-0 mb-0 md:mb-2 w-auto md:w-64 rounded-xl bg-slate-900 p-4 text-[11px] leading-relaxed font-medium text-white shadow-2xl z-[999] animate-in fade-in zoom-in duration-200">
                  <div className="relative">
                    {hint}
                    <div className="hidden md:block absolute -bottom-5 left-1 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-slate-900"></div>
                  </div>
                </div>
              )}
            </div>
          </span>
        </div>
        {onToggle && (
          <button 
            onClick={() => onToggle(!enabled)}
            className={cn(
              "relative inline-flex h-6 w-10 items-center rounded-full transition-colors focus:outline-none",
              enabled ? "bg-blue-600" : "bg-slate-200"
            )}
          >
            <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white transition-transform", enabled ? "translate-x-5" : "translate-x-1")} />
          </button>
        )}
      </div>
      <div className={cn("transition-all", !enabled && "pointer-events-none")}>
        {children}
      </div>
      {/* Lớp phủ để tắt chú thích khi nhấn ra ngoài trên mobile */}
      {showHint && <div className="fixed inset-0 z-[998] md:hidden" onClick={() => setShowHint(false)} />}
    </div>
  );
};

// --- Individual Tab Components ---

/**
 * NHÓM 1: GIỜ GIẤC CƠ BẢN
 * Quản lý giờ Check-in/out tiêu chuẩn và khung giờ tự động nhận diện khách Qua đêm.
 */
const BasicTimeTab = ({ timeRules, setTimeRules }: any) => (
  <section className="space-y-4">
    <div className="grid grid-cols-2 gap-3">
      {/* Giờ nhận phòng tiêu chuẩn cho khách ở Ngày */}
      <SettingItem label="Giờ Nhận (Check-in)" hint="Giờ khách bắt đầu nhận phòng tiêu chuẩn hàng ngày. Ví dụ: 14:00.">
        <input 
          type="time" 
          value={timeRules.check_in} 
          onChange={(e) => setTimeRules({...timeRules, check_in: e.target.value})} 
          className="w-full p-3 bg-slate-50 rounded-xl text-lg font-bold text-slate-800 outline-none" 
        />
      </SettingItem>
      {/* Giờ trả phòng tiêu chuẩn cho khách ở Ngày */}
      <SettingItem label="Giờ Trả (Check-out)" hint="Giờ khách phải trả phòng tiêu chuẩn hàng ngày. Ví dụ: 12:00.">
        <input 
          type="time" 
          value={timeRules.check_out} 
          onChange={(e) => setTimeRules({...timeRules, check_out: e.target.value})} 
          className="w-full p-3 bg-slate-50 rounded-xl text-lg font-bold text-slate-800 outline-none" 
        />
      </SettingItem>
    </div>

    {/* Hạn trả phòng Qua đêm: Thường là 10h hoặc 12h sáng hôm sau */}
    <SettingItem 
      label="Hạn trả phòng Qua đêm" 
      hint="Áp dụng riêng cho khách ở đêm. Ví dụ khách sạn quy định khách đêm phải trả trước 10:00 sáng mai thay vì 12:00 như khách ngày."
      enabled={timeRules.overnight_checkout_enabled}
      onToggle={(val) => setTimeRules({...timeRules, overnight_checkout_enabled: val})}
    >
      <input 
        type="time" 
        value={timeRules.overnight_checkout} 
        onChange={(e) => setTimeRules({...timeRules, overnight_checkout: e.target.value})} 
        className="w-full p-3 bg-slate-50 rounded-xl text-lg font-bold text-slate-800 outline-none" 
      />
    </SettingItem>

    {/* Khung giờ Qua đêm: Dùng để hệ thống tự động nhận diện RentalType là 'overnight' */}
    <div className="bg-white rounded-[1.5rem] p-5 shadow-sm border border-slate-100">
      <span className="font-bold text-slate-800 flex items-center gap-1.5 mb-4">
        Khung giờ Qua đêm
        <div className="group relative inline-block cursor-help">
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-400">!</div>
          <div className="absolute bottom-full left-0 mb-2 hidden w-48 rounded-lg bg-slate-800 p-2 text-[10px] font-medium text-white shadow-xl group-hover:block z-50">
            Khách nhận phòng trong khoảng thời gian này sẽ được hệ thống tự động tính theo giá Qua đêm thay vì giá Giờ hay giá Ngày.
          </div>
        </div>
      </span>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 ml-1">Bắt đầu</label>
          <input 
            type="time" 
            value={timeRules.overnight.start} 
            onChange={(e) => setTimeRules({...timeRules, overnight: { ...timeRules.overnight, start: e.target.value }})} 
            className="w-full p-3 bg-slate-50 rounded-xl text-lg font-bold text-slate-800 outline-none" 
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 ml-1">Kết thúc</label>
          <input 
            type="time" 
            value={timeRules.overnight.end} 
            onChange={(e) => setTimeRules({...timeRules, overnight: { ...timeRules.overnight, end: e.target.value }})} 
            className="w-full p-3 bg-slate-50 rounded-xl text-lg font-bold text-slate-800 outline-none" 
          />
        </div>
      </div>
    </div>
  </section>
);

/**
 * NHÓM 2: CƠ CHẾ TÍNH TIỀN GIỜ
 * Cấu hình cho Hotel (Lũy tiến) hoặc Homestay (Theo Block).
 */
const HourlyPricingTab = ({ timeRules, setTimeRules }: any) => (
  <section className="space-y-4">
    <div className="grid grid-cols-2 gap-3">
      {/* Ô 1: Định nghĩa block đầu tiên */}
      <SettingItem 
        label="Số giờ gói đầu" 
        hint="Số giờ của gói khởi điểm. Ví dụ: Nhập 1 nếu tính theo giờ, nhập 2 nếu bán gói 2 tiếng đầu."
        icon={Clock}
      >
        <div className="relative">
          <NumericInput 
            value={timeRules.baseHours}
            onChange={(val) => setTimeRules({...timeRules, baseHours: val})}
            type="number"
            className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 transition-all font-semibold outline-none"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Giờ</span>
        </div>
      </SettingItem>

      {/* Ô 2: Định nghĩa các bước nhảy tiếp theo */}
      <SettingItem 
        label="Số phút tính tiếp" 
        hint="Cứ sau bao nhiêu phút thì tính thêm tiền một lần. Ví dụ: Nhập 60 nếu tính theo giờ, nhập 30 nếu tính theo mỗi nửa tiếng."
        icon={Timer}
      >
        <div className="relative">
          <NumericInput 
            value={timeRules.hourUnit}
            onChange={(val) => setTimeRules({...timeRules, hourUnit: val})}
            type="number"
            className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 transition-all font-semibold outline-none"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Phút</span>
        </div>
      </SettingItem>
    </div>

    {/* Trần tiền giờ: Chống việc tiền giờ cao hơn tiền ngày */}
    <SettingItem 
      label="Trần tiền giờ" 
      hint="Khi tiền giờ cộng dồn vượt quá X% giá phòng 1 ngày, hệ thống sẽ tự động chuyển sang tính theo giá Ngày để đảm bảo quyền lợi cho khách."
      enabled={timeRules.hourly_ceiling_enabled}
      onToggle={(val) => setTimeRules({...timeRules, hourly_ceiling_enabled: val})}
    >
      <div className="relative">
        <NumericInput 
          value={timeRules.hourly_ceiling_percent} 
          onChange={(val) => setTimeRules({...timeRules, hourly_ceiling_percent: val})} 
          type="number"
          className="w-full p-3 bg-slate-50 rounded-xl text-lg font-bold text-slate-800 outline-none pr-10" 
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">%</span>
      </div>
    </SettingItem>
  </section>
);

/**
 * NHÓM 3: PHỤ THU & MỐC TRÒN NGÀY
 * Quản lý tự động tính tiền Nhận sớm / Trả muộn và các mốc nhảy sang 1 ngày.
 */
/**
 * NHÓM 3: PHỤ THU & MỐC TRÒN NGÀY
 * Quản lý tự động tính tiền Nhận sớm / Trả muộn và các mốc nhảy sang 1 ngày.
 */
const SurchargeTab = ({ 
  timeRules, 
  setTimeRules,
  updateLateRule, 
  addLateRule, 
  removeLateRule, 
  updateEarlyRule,
  addEarlyRule,
  removeEarlyRule,
  enableAutoSurcharge,
  setEnableAutoSurcharge
}: any) => (
  <section className="space-y-6">
    {/* Nút gạt chính: Bật để máy tính, Tắt để người nhập tay */}
    <div className="bg-blue-600 rounded-[2rem] p-6 text-white shadow-xl shadow-blue-100 relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
              <Percent className="h-4 w-4 text-white" />
            </div>
            <h3 className="font-bold text-lg">Tự động tính phụ thu</h3>
          </div>
          <button 
            onClick={() => setEnableAutoSurcharge(!enableAutoSurcharge)}
            className={cn(
              "relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 bg-white/20 hover:bg-white/30 outline-none",
              enableAutoSurcharge && "bg-green-400/40"
            )}
          >
            <span className={cn(
              "inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform duration-300",
              enableAutoSurcharge ? "translate-x-6" : "translate-x-1"
            )} />
          </button>
        </div>
        <p className="text-xs opacity-80 leading-relaxed max-w-[280px]">
          Khi bật, hệ thống sẽ dựa vào các mốc thời gian dưới đây để tự động cộng thêm tiền vào hóa đơn.
        </p>
      </div>
      {/* Trang trí background */}
      <div className="absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
    </div>

    <div className="space-y-8">
      {/* --- PHỤ THU ĐẾN SỚM --- */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex flex-col">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              Đến sớm (Early Check-in)
              <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-100 text-[9px] font-black text-slate-400 cursor-help">!</div>
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Phụ thu khi khách nhận phòng trước giờ quy định</span>
          </div>
          
          {/* Chọn chế độ: Theo mốc hoặc Theo giờ */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setTimeRules({...timeRules, early_mode: 'milestone'})}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                (timeRules.early_mode !== 'hourly') ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"
              )}
            >
              Theo mốc
            </button>
            <button 
              onClick={() => setTimeRules({...timeRules, early_mode: 'hourly'})}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                (timeRules.early_mode === 'hourly') ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"
              )}
            >
              Theo giờ
            </button>
          </div>
        </div>
        
        {timeRules.early_mode === 'hourly' ? (
          /* Giao diện tính theo giờ */
          <div className="bg-white p-6 rounded-[2rem] border border-blue-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Clock className="h-6 w-6 text-blue-500" />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold text-slate-700">Tính theo mỗi giờ</h4>
                <p className="text-[10px] text-blue-600 font-medium mt-1 leading-relaxed">
                  Lưu ý: Hệ thống sẽ lấy giá phụ thu mỗi giờ được cấu hình riêng trong từng Hạng Phòng để nhân lên.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Giao diện tính theo mốc (Giữ nguyên logic cũ) */
          <div className="space-y-3">
            <div className="flex justify-end">
              <button 
                onClick={addEarlyRule} 
                className="h-8 px-3 rounded-full bg-blue-50 text-blue-600 text-[11px] font-bold flex items-center gap-1 hover:bg-blue-100 transition-colors"
              >
                <Plus className="h-3 w-3" /> Thêm mốc
              </button>
            </div>
            {(timeRules.early_rules || []).map((rule: any, index: number) => (
              <div key={`early-${index}`} className="group relative bg-white p-4 rounded-[1.5rem] border border-slate-100 shadow-sm hover:border-blue-200 transition-all">
                {/* ... (giữ nguyên nội dung card mốc) ... */}
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-400 ml-1 uppercase">Từ giờ</span>
                    <input type="time" value={rule.from} onChange={(e) => updateEarlyRule(index, 'from', e.target.value)} className="bg-slate-50 p-2.5 rounded-xl font-bold text-xs outline-none w-24 text-slate-700" />
                  </div>
                  <span className="text-slate-300 mt-4 font-light">→</span>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-400 ml-1 uppercase">Đến giờ</span>
                    <input type="time" value={rule.to} onChange={(e) => updateEarlyRule(index, 'to', e.target.value)} className="bg-slate-50 p-2.5 rounded-xl font-bold text-xs outline-none w-24 text-slate-700" />
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Mức thu (%)</span>
                    </div>
                    <NumericInput 
                      value={rule.percent} 
                      onChange={(val) => updateEarlyRule(index, 'percent', val)} 
                      type="number"
                      className="w-full bg-slate-50 p-2.5 rounded-xl font-bold text-xs outline-none text-right pr-2 text-blue-600" 
                    />
                  </div>
                  <button onClick={() => removeEarlyRule(index)} className="mt-4 p-2 text-slate-300 hover:text-red-500 rounded-xl"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- PHỤ THU TRẢ MUỘN --- */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex flex-col">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              Trả muộn (Late Check-out)
              <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-100 text-[9px] font-black text-slate-400 cursor-help">!</div>
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Phụ thu khi khách trả phòng sau giờ quy định</span>
          </div>

          {/* Chọn chế độ: Theo mốc hoặc Theo giờ */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setTimeRules({...timeRules, late_mode: 'milestone'})}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                (timeRules.late_mode !== 'hourly') ? "bg-white text-orange-600 shadow-sm" : "text-slate-400"
              )}
            >
              Theo mốc
            </button>
            <button 
              onClick={() => setTimeRules({...timeRules, late_mode: 'hourly'})}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                (timeRules.late_mode === 'hourly') ? "bg-white text-orange-600 shadow-sm" : "text-slate-400"
              )}
            >
              Theo giờ
            </button>
          </div>
        </div>
        
        {timeRules.late_mode === 'hourly' ? (
          /* Giao diện tính theo giờ */
          <div className="bg-white p-6 rounded-[2rem] border border-orange-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center">
                <Clock className="h-6 w-6 text-orange-500" />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold text-slate-700">Tính theo mỗi giờ</h4>
                <p className="text-[10px] text-orange-600 font-medium mt-1 leading-relaxed">
                  Lưu ý: Hệ thống sẽ lấy giá phụ thu mỗi giờ được cấu hình riêng trong từng Hạng Phòng để nhân lên.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Giao diện tính theo mốc (Giữ nguyên logic cũ) */
          <div className="space-y-3">
            <div className="flex justify-end">
              <button 
                onClick={addLateRule} 
                className="h-8 px-3 rounded-full bg-orange-50 text-orange-600 text-[11px] font-bold flex items-center gap-1 hover:bg-orange-100 transition-colors"
              >
                <Plus className="h-3 w-3" /> Thêm mốc
              </button>
            </div>
            {timeRules.late_rules.map((rule: any, index: number) => (
              <div key={`late-${index}`} className="group relative bg-white p-4 rounded-[1.5rem] border border-slate-100 shadow-sm hover:border-orange-200 transition-all">
                {/* ... (giữ nguyên nội dung card mốc) ... */}
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-400 ml-1 uppercase">Từ giờ</span>
                    <input type="time" value={rule.from} onChange={(e) => updateLateRule(index, 'from', e.target.value)} className="bg-slate-50 p-2.5 rounded-xl font-bold text-xs outline-none w-24 text-slate-700" />
                  </div>
                  <span className="text-slate-300 mt-4 font-light">→</span>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-400 ml-1 uppercase">Đến giờ</span>
                    <input type="time" value={rule.to} onChange={(e) => updateLateRule(index, 'to', e.target.value)} className="bg-slate-50 p-2.5 rounded-xl font-bold text-xs outline-none w-24 text-slate-700" />
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">Mức thu (%)</span>
                    </div>
                    <NumericInput 
                      value={rule.percent} 
                      onChange={(val) => updateLateRule(index, 'percent', val)} 
                      type="number"
                      className="w-full bg-slate-50 p-2.5 rounded-xl font-bold text-xs outline-none text-right pr-2 text-orange-600" 
                    />
                  </div>
                  <button onClick={() => removeLateRule(index)} className="mt-4 p-2 text-slate-300 hover:text-red-500 rounded-xl"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mốc Tròn Ngày: Chống việc phụ thu quá nhiều, tự động tính thành 1 ngày mới */}
      <div className="grid grid-cols-2 gap-3 pt-4">
        <SettingItem 
          label="Mốc Tròn Ngày (Sớm)" 
          hint="Ví dụ: Nhận phòng trước 05:00 sáng sẽ tự động tính thành 1 ngày tiền phòng."
          icon={Timer}
        >
          <input type="time" value={timeRules.full_day_early_before} onChange={(e) => setTimeRules({...timeRules, full_day_early_before: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-800 outline-none border-none focus:ring-2 focus:ring-blue-500 transition-all" />
        </SettingItem>
        <SettingItem 
          label="Mốc Tròn Ngày (Muộn)" 
          hint="Ví dụ: Trả phòng sau 18:00 chiều sẽ tự động tính thêm 1 ngày tiền phòng."
          icon={Timer}
        >
          <input type="time" value={timeRules.full_day_late_after} onChange={(e) => setTimeRules({...timeRules, full_day_late_after: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-800 outline-none border-none focus:ring-2 focus:ring-blue-500 transition-all" />
        </SettingItem>
      </div>

      {/* --- PHỤ THU THÊM NGƯỜI (DI CƯ TỪ TAB KHÁC) --- */}
      <div className="pt-4 border-t border-slate-100">
        <div className="bg-slate-50 rounded-[2rem] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                <Plus className="h-4 w-4 text-slate-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Phụ thu thêm người</h3>
                <p className="text-[10px] text-slate-400">Tự động cộng thêm tiền khi vượt quá số người quy định</p>
              </div>
            </div>
            <button 
              onClick={() => setTimeRules({...timeRules, extra_person_enabled: !timeRules.extra_person_enabled})}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-all",
                timeRules.extra_person_enabled ? "bg-green-500" : "bg-slate-300"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                timeRules.extra_person_enabled ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>

          {timeRules.extra_person_enabled && (
            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Người lớn</label>
                <div className="relative">
                  <NumericInput 
                    value={timeRules.extra_person_fee_adult || 0}
                    onChange={(val) => setTimeRules({...timeRules, extra_person_fee_adult: val})}
                    className="w-full bg-white p-3 rounded-xl font-bold text-sm text-right pr-8 text-slate-700 shadow-sm border-none outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300">đ</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Trẻ em</label>
                <div className="relative">
                  <NumericInput 
                    value={timeRules.extra_person_fee_child || 0}
                    onChange={(val) => setTimeRules({...timeRules, extra_person_fee_child: val})}
                    className="w-full bg-white p-3 rounded-xl font-bold text-sm text-right pr-8 text-slate-700 shadow-sm border-none outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300">đ</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </section>
);

/**
 * NHÓM 4: ÂN HẠN (GRACE PERIOD)
 * Khoảng thời gian cho phép khách trễ mà không bị tính tiền.
 */
const GracePeriodTab = ({ timeRules, setTimeRules }: any) => (
  <section className="space-y-4">
    {/* Ân hạn nhận phòng: Tránh việc khách vào xem phòng rồi ra ngay mà vẫn bị tính tiền */}
    <SettingItem 
      label="Ân hạn Nhận phòng" 
      hint="Khoảng thời gian khách vào rồi ra ngay (ví dụ đổi ý) sẽ không bị tính tiền."
      enabled={timeRules.initial_grace_enabled}
      onToggle={(val) => setTimeRules({...timeRules, initial_grace_enabled: val})}
    >
      <div className="relative">
        <NumericInput 
          value={timeRules.initial_grace_minutes} 
          onChange={(val) => setTimeRules({...timeRules, initial_grace_minutes: val})} 
          type="number"
          className="w-full p-3 bg-slate-50 rounded-xl text-lg font-bold text-slate-800 outline-none pr-12" 
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">phút</span>
      </div>
    </SettingItem>

    {/* Ân hạn trả phòng: Cho khách thêm thời gian dọn đồ, di chuyển ra quầy */}
    <SettingItem 
      label="Ân hạn Trả phòng" 
      hint="Khoảng thời gian khách trễ mà vẫn được miễn phí phụ thu (thời gian di chuyển, dọn đồ)."
      enabled={timeRules.late_grace_enabled}
      onToggle={(val) => setTimeRules({...timeRules, late_grace_enabled: val})}
    >
      <div className="relative">
        <NumericInput 
          value={timeRules.late_grace_minutes} 
          onChange={(val) => setTimeRules({...timeRules, late_grace_minutes: val})} 
          type="number"
          className="w-full p-3 bg-slate-50 rounded-xl text-lg font-bold text-slate-800 outline-none pr-12" 
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">phút</span>
      </div>
    </SettingItem>
  </section>
);

/**
 * NHÓM 5: TIỆN ÍCH KHÁC & THUẾ
 * Quản lý phụ thu thêm người và cấu hình hóa đơn VAT.
 */
const OtherSettingsTab = ({ timeRules, setTimeRules, taxConfig, setTaxConfig }: any) => (
  <section className="space-y-4">
    {/* Thuế & Hóa đơn: Cấu hình hiển thị và tính toán VAT trên Invoice */}
    <div className="bg-white rounded-[1.5rem] p-5 shadow-sm border border-slate-100 space-y-4">
      <span className="font-bold text-slate-800 flex items-center gap-1.5">
        Thuế & Hóa đơn
        <div 
          className="relative inline-block"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-400 cursor-help">!</div>
        </div>
      </span>
      <input type="text" placeholder="Mã số thuế..." value={taxConfig.tax_code} onChange={(e) => setTaxConfig({...taxConfig, tax_code: e.target.value})} className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-800 outline-none placeholder:text-slate-300" />
      <div className="grid grid-cols-2 gap-3">
        <div className="relative">
          <NumericInput value={taxConfig.stay_tax} onChange={(val) => setTaxConfig({...taxConfig, stay_tax: val})} type="number" className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-800 outline-none pr-8" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">% Thuế</span>
        </div>
        <div className="relative">
          <NumericInput value={taxConfig.service_tax} onChange={(val) => setTaxConfig({...taxConfig, service_tax: val})} type="number" className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-800 outline-none pr-8" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">% Phí DV</span>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 italic">Thuế này sẽ được cộng trực tiếp vào tổng bill khi in hóa đơn cho khách hàng.</p>
    </div>
  </section>
);
const AISettingsTab = () => (
  <section className="space-y-4">
    <div className="bg-slate-900 rounded-[1.5rem] p-6 text-white">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h3 className="font-bold">Cấu hình AI Voice</h3>
          <p className="text-[11px] text-slate-400">Trợ lý ảo hỗ trợ điều hành khách sạn</p>
        </div>
      </div>
      <div className="space-y-4 opacity-50">
        <div className="h-12 bg-white/5 rounded-xl border border-white/10 flex items-center px-4 text-xs font-medium">Đang phát triển...</div>
        <div className="h-12 bg-white/5 rounded-xl border border-white/10 flex items-center px-4 text-xs font-medium">Tự động nhận diện giọng nói</div>
      </div>
    </div>
  </section>
);
