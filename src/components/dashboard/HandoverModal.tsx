'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertCircle, Play, LogOut, Banknote, Loader2, History } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { shiftService, Shift } from '@/services/shiftService';
import { telegramService } from '@/services/telegramService';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { formatMoney, cn } from '@/lib/utils';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

const DENOMINATIONS = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000];

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
  const [blockedInfo, setBlockedInfo] = useState<{
      blocked: boolean;
      staff_name: string;
      shift_id: string;
  } | null>(null);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Form States
  const [startCash, setStartCash] = useState<number>(0);
  const [declaredCash, setDeclaredCash] = useState<number>(0);
  const [denominations, setDenominations] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [closeResult, setCloseResult] = useState<{ system_cash: number; variance: number } | null>(null);

  const handleDenominationChange = (value: number, count: number) => {
    const newDenominations = { ...denominations, [value]: count };
    setDenominations(newDenominations);
    
    // Auto calculate declared cash
    const total = DENOMINATIONS.reduce((sum, d) => sum + d * (newDenominations[d] || 0), 0);
    setDeclaredCash(total);
  };

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
      
      // If no personal shift, check if global shift exists (blocking)
      if (!shift) {
          const globalStatus = await shiftService.getGlobalOpenShift();
          if (globalStatus.has_open_shift && globalStatus.shift) {
              setBlockedInfo({
                  blocked: true,
                  staff_name: globalStatus.shift.staff_name,
                  shift_id: globalStatus.shift.id
              });
          } else {
              setBlockedInfo(null);
          }
      }
    } catch (error) {
      console.error('Error checking shift:', error);
      toast.error('Không thể tải thông tin ca làm việc');
    } finally {
      setLoading(false);
    }
  };

  const handleForceClose = async () => {
      if (!blockedInfo || !user) return;
      if (user.role !== 'Admin') {
          toast.error('Chỉ Admin mới có quyền đóng ca hộ!');
          return;
      }
      
      if (!confirm(`Bạn có chắc chắn muốn ĐÓNG CA HỘ nhân viên ${blockedInfo.staff_name}? Hành động này sẽ được ghi lại.`)) return;

      setLoading(true);
      try {
          // Force close with 0 declared cash (Blind Close)
          // Since it's a force close, we assume the admin takes responsibility or will count later.
          // For now, we just close it so operations can continue.
          // Note: In a real scenario, we might want to let Admin input the cash too.
          // But for "Unlock" purpose, 0 is fine, it will show Variance.
          const result = await shiftService.closeShift(blockedInfo.shift_id, 0, 'Admin Force Close - Đóng ca hộ');
          
          if (result.success) {
              toast.success('Đã đóng ca hộ thành công');
              setBlockedInfo(null); // Clear blocking
              await checkShiftStatus(); // Refresh status (should be clear now)
          } else {
              toast.error(result.message || 'Lỗi khi đóng ca hộ');
          }
      } catch (error) {
          console.error('Error force closing shift:', error);
          toast.error('Lỗi khi đóng ca hộ');
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
      // Convert denominations map to array
      const denominationList = Object.entries(denominations)
        .filter(([_, count]) => count > 0)
        .map(([value, count]) => ({
          denomination: parseInt(value),
          quantity: count
        }));

      const result = await shiftService.closeShift(currentShift.id, declaredCash, notes, denominationList);
      
      if (result.success) {
         setCloseResult({
             system_cash: result.system_cash,
             variance: result.variance
         });
         
         // Send Telegram Report
         const message = telegramService.formatShiftReportMessage(
            user?.full_name || user?.username || 'Nhân viên',
            result.system_cash,
            declaredCash,
            result.variance,
            result.audit_status
         );
         await telegramService.sendMessage(message);

         toast.success('Đã chốt ca thành công');
         if (onSuccess) onSuccess();
         // Do NOT onClose() here, let user see the result.
      } else {
         toast.error(result.message || 'Lỗi khi chốt ca');
      }
    } catch (error: any) {
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
          {blockedInfo ? (
            /* BLOCKED STATE UI */
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="p-6 rounded-2xl border-2 border-red-100 bg-red-50 flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 mb-2">
                  <AlertCircle size={32} />
                </div>
                
                <div>
                  <h3 className="text-xl font-black text-red-800 mb-1">
                    KHÔNG THỂ MỞ CA
                  </h3>
                  <p className="text-slate-600 font-medium text-sm leading-relaxed">
                    Nhân viên <span className="font-bold text-red-700">{blockedInfo.staff_name}</span> đang giữ ca làm việc.
                    <br/>
                    Hệ thống chỉ cho phép 1 ca hoạt động tại một thời điểm.
                  </p>
                </div>

                <div className="w-full bg-white/50 rounded-xl p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                   Yêu cầu bàn giao trước khi tiếp quản
                </div>
              </div>

              {user?.role === 'Admin' && (
                <div className="space-y-3">
                   <div className="flex items-center gap-2 px-2">
                      <div className="h-px bg-slate-200 flex-1"></div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Admin Control</span>
                      <div className="h-px bg-slate-200 flex-1"></div>
                   </div>
                   <button 
                      onClick={handleForceClose}
                      className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-lg uppercase tracking-wide shadow-xl shadow-red-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                   >
                      <LogOut size={20} />
                      Đóng Ca Hộ (Force Close)
                   </button>
                   <p className="text-[10px] text-slate-400 text-center italic">
                      * Hành động này sẽ được ghi lại trong nhật ký hệ thống
                   </p>
                </div>
              )}
            </div>
          ) : closeResult ? (
            /* CASE 3: SHOW CLOSE RESULT */
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className={cn(
                "p-6 rounded-2xl border-2 flex flex-col items-center text-center gap-4",
                closeResult.variance === 0 
                  ? "bg-green-50 border-green-100" 
                  : "bg-orange-50 border-orange-100"
              )}>
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center shrink-0 mb-2",
                  closeResult.variance === 0 ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
                )}>
                  {closeResult.variance === 0 ? <CheckCircle2 size={32} /> : <AlertCircle size={32} />}
                </div>
                
                <div>
                  <h3 className={cn(
                    "text-xl font-black mb-1",
                    closeResult.variance === 0 ? "text-green-800" : "text-orange-800"
                  )}>
                    {closeResult.variance === 0 ? "Chốt ca hoàn hảo!" : "Có chênh lệch tiền mặt"}
                  </h3>
                  <p className="text-slate-500 font-medium text-sm">
                    {closeResult.variance === 0 
                      ? "Số tiền thực tế khớp hoàn toàn với hệ thống." 
                      : "Vui lòng kiểm tra lại các giao dịch tiền mặt."}
                  </p>
                </div>

                <div className="w-full bg-white/50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-bold">Hệ thống ghi nhận:</span>
                    <span className="font-bold text-slate-900">{formatMoney(closeResult.system_cash)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-bold">Chênh lệch:</span>
                    <span className={cn(
                      "font-bold",
                      closeResult.variance > 0 ? "text-green-600" : "text-red-600"
                    )}>{closeResult.variance > 0 ? '+' : ''}{formatMoney(closeResult.variance)}</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={handleFinish}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-lg uppercase tracking-wide shadow-xl shadow-slate-200 transition-all active:scale-[0.98]"
              >
                Hoàn tất & Đóng
              </button>
            </div>
          ) : loading && !currentShift ? (
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
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Kiểm đếm tiền mặt (Két)</label>
                    
                    <div className="bg-slate-50 rounded-2xl p-4 space-y-3 max-h-[300px] overflow-y-auto">
                      <div className="grid grid-cols-2 gap-3">
                        {DENOMINATIONS.map((d) => (
                          <div key={d} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                            <span className="text-xs font-bold text-slate-500 w-16 text-right">{formatMoney(d)}</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={denominations[d] || ''}
                              onChange={(e) => handleDenominationChange(d, parseInt(e.target.value) || 0)}
                              className="w-full text-sm font-bold text-slate-900 text-right outline-none bg-transparent"
                            />
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                        <span className="text-xs font-bold text-slate-500 uppercase">Tổng thực tế</span>
                        <span className="text-lg font-black text-slate-900">{formatMoney(declaredCash)}</span>
                      </div>
                    </div>
                    
                    <p className="text-[10px] text-slate-400 font-medium italic text-center">
                        * Hãy đếm kỹ từng mệnh giá tiền trong két
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
