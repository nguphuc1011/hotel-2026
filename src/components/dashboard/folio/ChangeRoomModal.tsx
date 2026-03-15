
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRightLeft, BedDouble } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { bookingService } from '@/services/bookingService';
import { roomService } from '@/services/roomService';
import { Room } from '@/types/dashboard';

interface ChangeRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string | undefined;
  currentRoomName: string;
  onSuccess: () => void;
  verifiedStaff?: { id: string, name: string };
}

export default function ChangeRoomModal({ isOpen, onClose, bookingId, currentRoomName, onSuccess, verifiedStaff }: ChangeRoomModalProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [priceMode, setPriceMode] = useState<'KEEP_OLD' | 'USE_NEW'>('USE_NEW');
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
    if (!selectedRoomId || !bookingId) {
      toast.error('Vui lòng chọn phòng mới');
      return;
    }

    setIsSubmitting(true);
    try {
      await bookingService.changeRoom(bookingId, selectedRoomId, reason, verifiedStaff, priceMode);
      toast.success('Đổi phòng thành công');
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi đổi phòng');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !bookingId) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[70000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className={cn(
          "w-full bg-white shadow-2xl overflow-hidden flex flex-col animate-in duration-300",
          "h-[92vh] mt-auto rounded-t-[40px] slide-in-from-bottom-full md:h-auto md:max-w-md md:rounded-[32px] md:zoom-in-95 md:max-h-[90vh] md:mt-0"
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
              <h3 className="text-lg font-bold text-slate-800 leading-none">Đổi phòng</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">Phòng hiện tại: {currentRoomName}</p>
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
          
          {/* Room Selection Section */}
          <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1">Chọn phòng trống mới</label>
            {isLoading ? (
              <div className="text-center py-12 flex flex-col items-center gap-3 bg-slate-50 rounded-[32px]">
                <div className="w-12 h-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
                <span className="text-sm font-bold text-slate-400">Đang tìm phòng trống...</span>
              </div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-12 px-6 bg-rose-50 rounded-[32px] border border-rose-100">
                <p className="text-rose-600 font-bold">Không tìm thấy phòng nào đang trống!</p>
                <p className="text-xs text-rose-400 mt-1 font-medium">Vui lòng dọn dẹp hoặc trả phòng khác trước.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar pt-1">
                {rooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoomId(room.id)}
                    className={cn(
                        "p-4 rounded-[24px] border-none flex flex-col items-center gap-2 transition-all duration-300 shadow-sm",
                        selectedRoomId === room.id
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 scale-105 z-10"
                            : "bg-slate-50 text-slate-600 hover:bg-white hover:shadow-md"
                    )}
                  >
                    <BedDouble className={cn("w-6 h-6", selectedRoomId === room.id ? "text-white" : "text-slate-400")} />
                    <span className="font-black text-sm">{room.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Price Mode Section */}
          <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1">Chế độ áp dụng giá</label>
            <div className="flex bg-slate-50 rounded-full p-1.5 shadow-sm border border-slate-100">
              {[
                { id: 'USE_NEW', label: 'GIÁ PHÒNG MỚI' },
                { id: 'KEEP_OLD', label: 'GIỮ GIÁ CŨ' },
              ].map((mode) => {
                const isActive = priceMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setPriceMode(mode.id as any)}
                    className={cn(
                        "flex-1 py-3.5 rounded-full transition-all duration-300 font-black text-[10px] tracking-widest uppercase",
                        isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-slate-400 hover:bg-slate-100"
                    )}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reason Section */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1">Lý do đổi phòng</label>
            <textarea
              className="w-full h-24 rounded-[32px] bg-white p-5 text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 border-none outline-none transition-all resize-none shadow-sm"
              placeholder="Nhập lý do đổi phòng (tùy chọn)..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
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
            disabled={isSubmitting || !selectedRoomId}
            className={cn(
                "flex-[2] py-4 rounded-[24px] font-bold text-white uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-3",
                isSubmitting || !selectedRoomId ? "bg-slate-300 cursor-not-allowed shadow-none" : "bg-blue-600 hover:bg-blue-700 active:scale-95"
            )}
          >
            {isSubmitting ? 'Đang xử lý...' : 'Xác nhận đổi phòng'}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
