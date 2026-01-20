'use client';

import { useState, useEffect, useRef } from 'react';
import { Lock, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface PinValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (staffId: string, staffName: string) => void;
  actionName: string;
  description?: string;
}

export default function PinValidationModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  actionName,
  description 
}: PinValidationModalProps) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;

    setLoading(true);
    setError(null);

    try {
      // Xác thực mã PIN bằng cách tìm staff có pin_hash khớp
      // Lưu ý: Trong thực tế nên dùng mã hóa/hash, ở đây làm theo yêu cầu đơn giản & trực quan
      const { data: staff, error: verifyError } = await supabase
        .from('staff')
        .select('id, full_name')
        .eq('pin_hash', pin)
        .eq('is_active', true)
        .single();

      if (verifyError || !staff) {
        setError('Mã PIN không chính xác hoặc tài khoản đã bị khóa');
        setPin('');
        return;
      }

      toast.success(`Xác thực thành công: ${staff.full_name}`);
      onSuccess(staff.id, staff.full_name);
      onClose();
    } catch (err: any) {
      setError('Có lỗi xảy ra khi xác thực');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-main/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-accent/10">
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <div className="w-12 h-12 bg-accent/5 rounded-2xl flex items-center justify-center text-accent">
              <Lock size={24} />
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X size={20} className="text-muted" />
            </button>
          </div>

          <h3 className="text-2xl font-black tracking-tight text-main mb-2 uppercase italic">
            Yêu cầu xác thực
          </h3>
          <p className="text-sm font-bold text-muted uppercase tracking-tight mb-8">
            Hành động: <span className="text-accent">{actionName}</span>
          </p>

          {description && (
            <div className="mb-6 p-4 bg-orange-50 rounded-2xl border border-orange-100 flex gap-3">
              <AlertCircle size={18} className="text-orange-500 shrink-0" />
              <p className="text-[11px] font-medium text-orange-800 leading-relaxed">{description}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Nhập mã PIN (4-6 số)"
                className="w-full h-16 bg-gray-50 border-2 border-transparent focus:border-accent focus:bg-white rounded-2xl px-6 text-center text-2xl font-black tracking-[0.5em] transition-all outline-none placeholder:text-xs placeholder:tracking-normal placeholder:font-bold placeholder:uppercase"
                autoComplete="off"
              />
              {loading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent"></div>
                </div>
              )}
            </div>

            {error && (
              <p className="text-center text-xs font-black uppercase text-rose-500 animate-in slide-in-from-top-1">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pin.length < 4 || loading}
              className="w-full h-14 bg-accent disabled:bg-gray-200 text-white rounded-2xl font-black uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-3 shadow-lg shadow-accent/20"
            >
              <CheckCircle2 size={20} />
              Xác nhận thực hiện
            </button>
          </form>

          <p className="text-center text-[10px] text-muted font-bold uppercase tracking-widest mt-8 opacity-50">
            Hệ thống Bằng chứng thép v2.0
          </p>
        </div>
      </div>
    </div>
  );
}
