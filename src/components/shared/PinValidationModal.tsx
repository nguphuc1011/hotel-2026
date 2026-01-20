'use client';

import { useState, useEffect, useRef } from 'react';
import { Lock, X, CheckCircle2, AlertCircle, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';

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
  const { user } = useAuth();
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
    if (pin.length !== 4) return;
    
    // Ensure we have a user context
    if (!user?.id) {
      setError('Không tìm thấy thông tin người dùng');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use RPC to verify PIN for CURRENT logged in staff
      const { data: isValid, error: verifyError } = await supabase.rpc('fn_verify_staff_pin', {
        p_staff_id: user.id,
        p_pin_hash: pin
      });

      if (verifyError) throw verifyError;

      if (!isValid) {
        setError('Mã PIN không chính xác');
        setPin('');
        return;
      }

      toast.success(`Xác thực thành công: ${user.full_name || 'Nhân viên'}`);
      onSuccess(user.id, user.full_name);
      // Note: onClose will be called by parent if needed, or we can call it here
      // But based on usage, parent usually handles onClose in onSuccess or separately
      // We'll call onClose to be safe and consistent with previous behavior
      onClose();
    } catch (err: any) {
      console.error(err);
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
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoComplete="off"
                name="access_pin_code"
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (val.length <= 4) setPin(val);
                }}
                className="w-full h-20 bg-gray-50 border-2 border-transparent focus:border-accent rounded-[24px] px-6 text-center text-4xl font-black tracking-[1em] outline-none transition-all shadow-inner text-main mask-disc"
                placeholder="••••"
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
              disabled={pin.length !== 4 || loading}
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
