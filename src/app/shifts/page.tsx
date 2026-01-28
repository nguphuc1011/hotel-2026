'use client';

import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  History, 
  Clock, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Lock
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { shiftService, Shift } from '@/services/shiftService';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';

export default function ShiftPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  
  // Open Shift State
  const [startCash, setStartCash] = useState(0);
  const [isOpening, setIsOpening] = useState(false);

  // Close Shift State
  const [declaredCash, setDeclaredCash] = useState(0);
  const [notes, setNotes] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [closeResult, setCloseResult] = useState<{ system_cash: number; variance: number } | null>(null);

  useEffect(() => {
    if (user?.id) {
      loadCurrentShift();
    }
  }, [user?.id]);

  const loadCurrentShift = async () => {
    try {
      setLoading(true);
      const shift = await shiftService.getCurrentShift(user!.id);
      setCurrentShift(shift);
    } catch (error) {
      console.error('Error loading shift:', error);
      toast.error('Không thể tải thông tin ca làm việc');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenShift = async () => {
    if (!user) return;
    try {
      setIsOpening(true);
      await shiftService.openShift(user.id, startCash);
      toast.success('Đã mở ca làm việc thành công');
      await loadCurrentShift();
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi mở ca');
    } finally {
      setIsOpening(false);
    }
  };

  const handleCloseShift = async () => {
    if (!currentShift) return;
    try {
      setIsClosing(true);
      const result = await shiftService.closeShift(currentShift.id, declaredCash, notes);
      
      if (result.success) {
        setCloseResult({
          system_cash: result.system_cash,
          variance: result.variance
        });
        toast.success('Đã chốt ca thành công');
        setCurrentShift(null); // Clear current shift
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi chốt ca');
    } finally {
      setIsClosing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-8 pb-32">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Quản lý Ca làm việc</h1>
          <p className="text-slate-500 font-medium mt-2">Theo dõi dòng tiền và đối soát cuối ca (Blind Close)</p>
        </div>

        {/* Close Result Notification */}
        {closeResult && (
          <div className={cn(
            "p-6 rounded-2xl border-2 animate-in fade-in slide-in-from-top-4",
            closeResult.variance === 0 
              ? "bg-green-50 border-green-100" 
              : "bg-orange-50 border-orange-100"
          )}>
            <div className="flex items-start gap-4">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                closeResult.variance === 0 ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
              )}>
                {closeResult.variance === 0 ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
              </div>
              <div className="space-y-1">
                <h3 className={cn(
                  "text-lg font-bold",
                  closeResult.variance === 0 ? "text-green-800" : "text-orange-800"
                )}>
                  {closeResult.variance === 0 ? "Chốt ca hoàn hảo!" : "Có chênh lệch tiền mặt"}
                </h3>
                <p className="text-slate-600 font-medium">
                  Hệ thống ghi nhận: <span className="font-bold">{formatMoney(closeResult.system_cash)}</span>
                  <br />
                  Chênh lệch: <span className={cn(
                    "font-bold",
                    closeResult.variance > 0 ? "text-green-600" : "text-red-600"
                  )}>{closeResult.variance > 0 ? '+' : ''}{formatMoney(closeResult.variance)}</span>
                </p>
                <button 
                  onClick={() => setCloseResult(null)}
                  className="text-sm font-bold underline mt-2 opacity-60 hover:opacity-100"
                >
                  Đóng thông báo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        {!currentShift ? (
          /* OPEN SHIFT CARD */
          <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-8 md:p-12 text-center max-w-lg mx-auto">
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-[28px] flex items-center justify-center mx-auto mb-6 shadow-sm">
                <Wallet size={32} />
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">Bắt đầu Ca làm việc mới</h2>
              <p className="text-slate-500 font-medium mb-8">
                Vui lòng kiểm đếm tiền mặt trong két và nhập số dư đầu ca để bắt đầu phiên làm việc.
              </p>

              <div className="space-y-6 text-left">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Tiền đầu ca (Thực tế)</label>
                  <MoneyInput 
                    value={startCash}
                    onChange={setStartCash}
                    className="h-14 text-lg font-bold"
                    placeholder="0"
                  />
                </div>

                <button
                  onClick={handleOpenShift}
                  disabled={isOpening}
                  className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {isOpening ? <Loader2 className="animate-spin" /> : (
                    <>
                      <span>Mở Ca Ngay</span>
                      <ArrowRight size={20} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ACTIVE SHIFT CARD */
          <div className="grid md:grid-cols-2 gap-6">
            {/* Status Card */}
            <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Đang hoạt động
                  </div>
                  <span className="text-slate-400 font-medium text-sm">
                    {format(new Date(currentShift.start_time), 'HH:mm dd/MM/yyyy')}
                  </span>
                </div>
                
                <h2 className="text-4xl font-black text-slate-900 mb-1">
                  {formatMoney(currentShift.start_cash)}
                </h2>
                <p className="text-slate-500 font-bold">Số dư đầu ca</p>
              </div>

              <div className="mt-8 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-3 text-slate-600">
                  <Clock size={20} />
                  <span className="font-medium">Phiên làm việc của: <span className="font-bold text-slate-900">{user?.full_name}</span></span>
                </div>
              </div>
            </div>

            {/* Close Form */}
            <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 p-8">
              <div className="flex items-center gap-3 mb-6 text-orange-600">
                <Lock size={24} />
                <h3 className="text-xl font-black">Chốt Ca (Blind Close)</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Tiền mặt thực đếm tại két</label>
                  <MoneyInput 
                    value={declaredCash}
                    onChange={setDeclaredCash}
                    className="h-12 font-bold"
                  />
                  <p className="text-xs text-slate-400 font-medium">
                    * Nhập chính xác số tiền bạn đang giữ. Hệ thống sẽ đối soát ngầm.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Ghi chú (nếu có)</label>
                  <textarea 
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] text-sm font-medium"
                    placeholder="Giải trình chênh lệch..."
                  />
                </div>

                <button
                  onClick={handleCloseShift}
                  disabled={isClosing}
                  className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold shadow-lg transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2 mt-2"
                >
                  {isClosing ? <Loader2 className="animate-spin" /> : "Xác nhận Chốt Ca"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
