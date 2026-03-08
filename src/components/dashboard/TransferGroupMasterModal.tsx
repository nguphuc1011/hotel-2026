import React, { useState, useEffect } from 'react';
import { X, Loader2, ArrowRight } from 'lucide-react';
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
    <div className="fixed inset-0 z-[50000] flex flex-col justify-end sm:justify-center items-center backdrop-blur-md bg-slate-900/60">
      <div className="w-full h-full sm:w-full sm:max-w-xl sm:h-auto sm:max-h-[90vh] sm:rounded-[40px] bg-slate-50 flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="relative p-6 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="bg-slate-900 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg uppercase tracking-wider shadow-sm">Chuyển Chủ Nhóm</span>
            <h2 className="text-lg font-bold text-slate-800"></h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="mb-4">
            <p className="text-sm text-slate-600">Phòng chủ hiện tại: <span className="font-bold">{oldMasterBooking.room_name}</span></p>
            <p className="text-sm text-slate-600">Khách: <span className="font-bold">{oldMasterBooking.customer_name || 'Khách vãng lai'}</span></p>
          </div>

          <div className="mb-6">
            <label htmlFor="newMaster" className="block text-sm font-medium text-slate-700 mb-2">
              Chọn phòng chủ mới:
            </label>
            <select
              id="newMaster"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              value={newMasterBookingId || ''}
              onChange={(e) => setNewMasterBookingId(e.target.value)}
            >
              <option value="">-- Chọn phòng --</option>
              {childBookings.map((booking) => (
                <option key={booking.id} value={booking.id}>
                  {booking.room_name} - {booking.customer_name || 'Khách vãng lai'}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Hành động với phòng chủ cũ ({oldMasterBooking.room_name}):
            </label>
            <div className="mt-2 space-y-2">
              <div className="flex items-center">
                <input
                  id="action-ungroup"
                  name="actionForOldMaster"
                  type="radio"
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-slate-300"
                  value="ungroup"
                  checked={actionForOldMaster === 'ungroup'}
                  onChange={() => setActionForOldMaster('ungroup')}
                />
                <label htmlFor="action-ungroup" className="ml-3 block text-sm text-slate-700">
                  Tách khỏi nhóm (trở thành booking độc lập)
                </label>
              </div>
              <div className="flex items-center">
                <input
                  id="action-become-child"
                  name="actionForOldMaster"
                  type="radio"
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-slate-300"
                  value="become_child"
                  checked={actionForOldMaster === 'become_child'}
                  onChange={() => setActionForOldMaster('become_child')}
                />
                <label htmlFor="action-become-child" className="ml-3 block text-sm text-slate-700">
                  Trở thành phòng con của phòng chủ mới
                </label>
              </div>
              <div className="flex items-center">
                <input
                  id="action-cancel"
                  name="actionForOldMaster"
                  type="radio"
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-slate-300"
                  value="cancel"
                  checked={actionForOldMaster === 'cancel'}
                  onChange={() => setActionForOldMaster('cancel')}
                />
                <label htmlFor="action-cancel" className="ml-3 block text-sm text-slate-700">
                  Hủy phòng chủ cũ
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-white border-t border-slate-100 flex items-center gap-4 z-50">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-[24px] font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-wider"
          >
            Hủy bỏ
          </button>
          <button
            onClick={handleSubmit}
            disabled={!newMasterBookingId || isSubmitting}
            className="flex-[2] py-4 rounded-[24px] font-bold text-white uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 active:scale-95"
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
