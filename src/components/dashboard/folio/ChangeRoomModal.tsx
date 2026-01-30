
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRightLeft, BedDouble } from 'lucide-react';
import { toast } from 'sonner';
import { bookingService } from '@/services/bookingService';
import { roomService } from '@/services/roomService';
import { Room } from '@/types/dashboard';

interface ChangeRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  currentRoomName: string;
  onSuccess: () => void;
  verifiedStaff?: { id: string, name: string };
}

export default function ChangeRoomModal({ isOpen, onClose, bookingId, currentRoomName, onSuccess, verifiedStaff }: ChangeRoomModalProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadRooms();
    }
  }, [isOpen]);

  const loadRooms = async () => {
    setIsLoading(true);
    try {
      // Get all rooms and filter available ones
      const allRooms = await roomService.getRooms();
      // Only show rooms that are truly available (status === 'available')
      const available = allRooms.filter(r => r.status === 'available');
      setRooms(available);
    } catch (error) {
      console.error('Failed to load rooms', error);
      toast.error('Lỗi tải danh sách phòng');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedRoomId) {
      toast.error('Vui lòng chọn phòng mới');
      return;
    }

    setIsSubmitting(true);
    try {
      await bookingService.changeRoom(bookingId, selectedRoomId, reason, verifiedStaff);
      toast.success('Đổi phòng thành công');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi đổi phòng');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 leading-none">Đổi phòng</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">Hiện tại: {currentRoomName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm font-bold text-slate-700 mb-2 block">Chọn phòng mới</label>
            {isLoading ? (
              <div className="text-center py-4 text-slate-500">Đang tải danh sách phòng...</div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-4 text-red-500 bg-red-50 rounded-xl">Không có phòng trống</div>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                {rooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoomId(room.id)}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${
                      selectedRoomId === room.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-100 hover:border-blue-200 text-slate-600'
                    }`}
                  >
                    <BedDouble className="w-5 h-5" />
                    <span className="font-bold">{room.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-bold text-slate-700 mb-2 block">Lý do đổi</label>
            <textarea
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              rows={3}
              placeholder="Nhập lý do đổi phòng..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedRoomId}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? 'Đang xử lý...' : 'Xác nhận đổi phòng'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
