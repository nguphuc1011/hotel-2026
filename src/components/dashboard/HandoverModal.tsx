'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertTriangle, Play, LogOut, Banknote, Loader2, History } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { shiftService, Shift } from '@/services/shiftService';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { formatMoney } from '@/lib/utils';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface HandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function HandoverModal({ isOpen, onClose, onSuccess }: HandoverModalProps) {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Form States
  const [startCash, setStartCash] = useState<number>(0);
  const [declaredCash, setDeclaredCash] = useState<number>(0);
  const [notes, setNotes] = useState('');

  // Fetch current shift status when modal opens
  useEffect(() => {
    if (isOpen && user?.id) {
      checkShiftStatus();
    }
  }, [isOpen, user?.id]);

  const checkShiftStatus = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const shift = await shiftService.getCurrentShift(user.id);
      setCurrentShift(shift);
    } catch (error) {
      console.error('Error checking shift:', error);
      toast.error('Không thể tải thông tin ca làm việc');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    
    setLoading(true);
    try {
      await shiftService.openShift(user.id, startCash);
      toast.success('Đã mở ca làm việc mới');
      await checkShiftStatus();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error opening shift:', error);
      toast.error('Lỗi khi mở ca');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShift) return;

    if (!confirm('Bạn có chắc chắn muốn chốt ca và bàn giao không?')) return;

    setLoading(true);
    try {
      await shiftService.closeShift(currentShift.id, declaredCash, notes);
      toast.success('Đã chốt ca thành công');
      onClose();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error closing shift:', error);
      toast.error('Lỗi khi chốt ca');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/20 max-h-[90vh] overflow-y-auto no-scrollbar">
        
        {/* Header */}
        <div className="bg-slate-900 px-8 py-6 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
              <History className="text-emerald-400" />
              Giao Ca & Chốt Sổ
            </h3>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
              Nhân viên: {user?.full_name || user?.username || '...'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-8">
          {loading && !currentShift ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="animate-spin text-slate-300" size={32} />
            </div>
          ) : (
            <>
              {/* CASE 1: NO OPEN SHIFT -> OPEN NEW SHIFT */}
              {!currentShift ? (
                <form onSubmit={handleOpenShift} className="space-y-6">
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex gap-3 items-start">
                    <Play className="text-emerald-600 shrink-0 mt-1" size={20} />
                    <div>
                      <h4 className="font-bold text-emerald-800 text-sm uppercase">Bắt đầu ca làm việc</h4>
                      <p className="text-xs text-emerald-600 mt-1 leading-relaxed">
                        Bạn chưa có ca làm việc nào đang mở. Vui lòng khai báo tiền đầu ca để bắt đầu.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Tiền đầu ca (Tiền lẻ trong két)</label>
                    <MoneyInput
                      value={startCash}
                      onChange={setStartCash}
                      placeholder="0"
                      className="text-3xl font-black text-center py-6 h-auto bg-slate-50 border-transparent focus:bg-white"
                      autoFocus
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-lg uppercase tracking-wide shadow-xl shadow-emerald-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    Mở Ca Mới
                  </button>
                </form>
              ) : (
                /* CASE 2: HAS OPEN SHIFT -> CLOSE SHIFT */
                <form onSubmit={handleCloseShift} className="space-y-6">
                  <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-blue-400 uppercase">Giờ bắt đầu</span>
                        <span className="text-sm font-bold text-blue-900">
                            {format(new Date(currentShift.start_time), 'HH:mm dd/MM', { locale: vi })}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-blue-400 uppercase">Tiền đầu ca</span>
                        <span className="text-sm font-bold text-blue-900">
                            {formatMoney(currentShift.start_cash)}
                        </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Tiền thực tế tại két (Cuối ca)</label>
                    <MoneyInput
                      value={declaredCash}
                      onChange={setDeclaredCash}
                      placeholder="0"
                      className="text-3xl font-black text-center py-6 h-auto bg-slate-50 border-transparent focus:bg-white"
                      autoFocus
                    />
                    <p className="text-[10px] text-slate-400 font-medium italic text-center">
                        * Hãy đếm kỹ tiền mặt trong két trước khi nhập
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Ghi chú bàn giao</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="VD: Còn 2 phòng chưa thanh toán, máy lạnh phòng 102 hỏng..."
                      className="w-full p-4 bg-slate-50 rounded-2xl border-none focus:ring-2 focus:ring-slate-200 font-medium text-sm min-h-[80px]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-lg uppercase tracking-wide shadow-xl shadow-slate-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="animate-spin" /> : <LogOut />}
                    Chốt Ca & Bàn Giao
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
