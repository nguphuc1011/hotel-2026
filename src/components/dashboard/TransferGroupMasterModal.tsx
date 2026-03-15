import React, { useState, useEffect } from 'react';
import { X, Loader2, ArrowRight, ArrowRightLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';
import { toast } from 'sonner';
import { bookingService } from '@/services/bookingService';
import { BookingWithRoomAndCustomer } from '@/types/Booking';
import { Room } from '@/types/Room';

interface TransferGroupMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  oldMasterBooking: BookingWithRoomAndCustomer;
  childBookings: BookingWithRoomAndCustomer[];
}

const TransferGroupMasterModal: React.FC<TransferGroupMasterModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  oldMasterBooking,
  childBookings,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newMasterBookingId, setNewMasterBookingId] = useState<string | null>(null);
  const [actionForOldMaster, setActionForOldMaster] = useState<'become_child' | 'ungroup' | 'cancel'>('ungroup');

  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setNewMasterBookingId(null);
      setActionForOldMaster('ungroup');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!newMasterBookingId) {
      toast.error('Vui lòng chọn một phòng chủ mới.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await bookingService.transferGroupMaster(
        oldMasterBooking.id,
        newMasterBookingId,
        actionForOldMaster
      );

      if (result.success) {
        toast.success(result.message || 'Chuyển chủ nhóm thành công!');
        onSuccess();
        onClose();
      } else {
        toast.error(result.message || 'Lỗi khi chuyển chủ nhóm.');
      }
    } catch (error) {
      console.error('Error transferring group master:', error);
      toast.error('Đã xảy ra lỗi khi chuyển chủ nhóm.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[70000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className={cn(
          "w-full bg-white shadow-2xl overflow-hidden flex flex-col animate-in duration-300",
          "h-[92vh] mt-auto rounded-t-[40px] slide-in-from-bottom-full md:h-auto md:max-w-xl md:rounded-[32px] md:zoom-in-95 md:max-h-[90vh] md:mt-0"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* --- HEADER --- */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 leading-none">Chuyển chủ nhóm</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">Thay đổi phòng đại diện cho đoàn</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full transition-all active:scale-95 border border-slate-200 shadow-sm"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* --- BODY --- */}
        <div className="flex-1 p-6 space-y-6 bg-slate-50 relative overflow-y-auto custom-scrollbar">
          
          {/* Current Master Info */}
          <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400">
                <span className="font-black text-lg">#1</span>
            </div>
            <div className="flex-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Chủ nhóm hiện tại</span>
                <div className="flex items-center justify-between">
                    <h4 className="text-lg font-bold text-slate-800">Phòng {oldMasterBooking.room_name}</h4>
                    <span className="text-sm font-medium text-slate-500">{oldMasterBooking.customer_name || 'Khách vãng lai'}</span>
                </div>
            </div>
          </div>

          {/* New Master Selection */}
          <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
            <label htmlFor="newMaster" className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-blue-500" /> Chọn phòng chủ mới
            </label>
            <div className="relative group bg-slate-50 rounded-[24px] p-1 border border-slate-100">
                <select
                    id="newMaster"
                    className="w-full py-4 px-5 bg-transparent border-none text-base font-bold text-slate-800 focus:ring-0 outline-none appearance-none"
                    value={newMasterBookingId || ''}
                    onChange={(e) => setNewMasterBookingId(e.target.value)}
                >
                    <option value="">-- Chọn phòng từ danh sách con --</option>
                    {childBookings.map((booking) => (
                        <option key={booking.id} value={booking.id}>
                            Phòng {booking.room_name} - {booking.customer_name || 'Khách vãng lai'}
                        </option>
                    ))}
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <ArrowRight className="w-5 h-5 text-slate-400 rotate-90" />
                </div>
            </div>
          </div>

          {/* Action Selection */}
          <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1">
              Hành động với phòng chủ cũ ({oldMasterBooking.room_name})
            </label>
            <div className="space-y-3">
              {[
                { id: 'ungroup', label: 'Tách khỏi nhóm', sub: 'Trở thành booking độc lập' },
                { id: 'become_child', label: 'Làm phòng con', sub: 'Trở thành phòng con của chủ mới' },
                { id: 'cancel', label: 'Hủy phòng này', sub: 'Xóa booking chủ cũ khỏi hệ thống' },
              ].map((action) => {
                const isActive = actionForOldMaster === action.id;
                return (
                  <button
                    key={action.id}
                    onClick={() => setActionForOldMaster(action.id as any)}
                    className={cn(
                        "w-full p-4 rounded-[24px] border-none flex items-center justify-between transition-all duration-300 shadow-sm",
                        isActive 
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 scale-[1.02] z-10" 
                            : "bg-slate-50 text-slate-600 hover:bg-white hover:shadow-md"
                    )}
                  >
                    <div className="text-left">
                        <div className={cn("font-bold text-sm uppercase tracking-wide", isActive ? "text-white" : "text-slate-800")}>{action.label}</div>
                        <div className={cn("text-[10px] font-medium opacity-70", isActive ? "text-blue-100" : "text-slate-500")}>{action.sub}</div>
                    </div>
                    <div className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                        isActive ? "bg-white border-white shadow-inner" : "bg-white border-slate-200"
                    )}>
                        {isActive && <div className="w-2.5 h-2.5 bg-blue-600 rounded-full" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* --- FOOTER --- */}
        <div className="p-6 bg-white border-t border-slate-100 flex items-center gap-4 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-[24px] font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-wider"
          >
            Hủy bỏ
          </button>
          <button
            onClick={handleSubmit}
            disabled={!newMasterBookingId || isSubmitting}
            className={cn(
                "flex-[2] py-4 rounded-[24px] font-bold text-white uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-3",
                !newMasterBookingId || isSubmitting ? "bg-slate-300 cursor-not-allowed shadow-none" : "bg-blue-600 hover:bg-blue-700 active:scale-95"
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <span>Xác nhận chuyển</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransferGroupMasterModal;
