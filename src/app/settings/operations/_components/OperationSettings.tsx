'use client';

import React, { useState, useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { 
  ShoppingBasket, 
  Calculator, 
  CreditCard,
  Save,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useNotification } from '@/context/NotificationContext';

// Fetcher function for SWR
const fetchSettings = async () => {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('key', 'system_settings')
    .maybeSingle();

  if (error) throw error;
  return data?.value || {};
};

export default function OperationSettings() {
  const { data: remoteSettings, error, isLoading } = useSWR('system_settings', fetchSettings);
  const [saving, setSaving] = useState(false);
  const { showNotification } = useNotification();

  const handleUpdate = async (key: string, value: any) => {
    try {
      setSaving(true);
      const newValue = {
        ...remoteSettings,
        [key]: value,
        checkout_process: 'fast',
      };

      // Optimistic Update
      mutate('system_settings', newValue, false);

      const { error } = await supabase
        .from('settings')
        .upsert([{ 
          key: 'system_settings', 
          value: newValue 
        }], { onConflict: 'key' });

      if (error) throw error;
      
      showNotification('Đã cập nhật cấu hình!', 'success');
    } catch (err) {
      console.error('Error updating settings:', err);
      showNotification('Lỗi cập nhật!', 'error');
      mutate('system_settings'); // Rollback
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  const ToggleCard = ({ 
    title, 
    description, 
    icon: Icon, 
    options, 
    currentValue, 
    onChange 
  }: { 
    title: string, 
    description: string, 
    icon: any, 
    options: { label: string, value: any, color: string }[],
    currentValue: any,
    onChange: (val: any) => void
  }) => (
    <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        <div className={cn("p-3 rounded-2xl bg-slate-50")}>
          <Icon className="h-6 w-6 text-slate-600" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">{description}</p>
          
          <div className="flex gap-2 mt-4 p-1 bg-slate-50 rounded-xl w-fit">
            {options.map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => onChange(opt.value)}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                  currentValue === opt.value 
                    ? cn("bg-white shadow-sm text-slate-900", opt.color)
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-24">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* 1. Tiền phụ thu */}
        <ToggleCard 
          title="1. Tiền phụ thu"
          description="MÁY TÍNH: Hệ thống tự tính tiền quá giờ. TỰ NHẬP: Lễ tân tự gõ số tiền phụ thu theo thực tế."
          icon={Calculator}
          currentValue={remoteSettings?.surcharge_mode || 'auto'}
          onChange={(val) => handleUpdate('surcharge_mode', val)}
          options={[
            { label: 'MÁY TÍNH', value: 'auto', color: 'border-l-4 border-blue-500' },
            { label: 'TỰ NHẬP', value: 'manual', color: 'border-l-4 border-amber-500' },
          ]}
        />

        {/* 2. Đối soát tiền */}
        <ToggleCard 
          title="2. Đối soát tiền"
          description="BẮT BUỘC: Lễ tân phải chọn Tiền mặt / Chuyển khoản / Thẻ khi thanh toán để quản lý dòng tiền."
          icon={CreditCard}
          currentValue={remoteSettings?.require_payment_method ?? true}
          onChange={(val) => handleUpdate('require_payment_method', val)}
          options={[
            { label: 'KHÔNG BẮT BUỘC', value: false, color: 'border-l-4 border-slate-400' },
            { label: 'BẬT (BẮT BUỘC)', value: true, color: 'border-l-4 border-rose-500' },
          ]}
        />
      </div>

      {/* Nút lưu đã được tích hợp vào từng Toggle để đạt tốc độ tối đa */}
      
      <div className="bg-blue-50 rounded-3xl p-6 flex items-start gap-4 border border-blue-100">
        <CheckCircle2 className="h-6 w-6 text-blue-600 shrink-0" />
        <div>
          <h4 className="font-bold text-blue-900 text-sm">Sức mạnh "Vô biên" từ sự Đơn giản</h4>
          <p className="text-blue-700 text-xs mt-1 leading-relaxed">
            Sếp chỉ cần nhìn vào <strong>Lịch sử thao tác</strong>. Ai bấm trừ kho, vào lúc nào, cho phòng nào... đều hiện ra mồn một. 
            Tháo A.I. sẽ soi: "Sếp ơi, kho báo còn 10 chai mà nãy giờ khách trả 5 phòng rồi không thấy ai báo dùng nước..."
          </p>
        </div>
      </div>
    </div>
  );
}
