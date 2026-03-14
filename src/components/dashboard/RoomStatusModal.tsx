'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, Brush, Wrench, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DashboardRoom, RoomStatus } from '@/types/dashboard';

interface RoomStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: DashboardRoom | null;
  initialStatus?: RoomStatus;
  onUpdateStatus: (roomId: string, status: RoomStatus, note?: string) => Promise<void>;
}

export default function RoomStatusModal({
  isOpen,
  onClose,
  room,
  initialStatus,
  onUpdateStatus,
}: RoomStatusModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<RoomStatus>('available');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (room && isOpen) {
      setSelectedStatus(initialStatus || room.status);
      setNote(room.notes || '');
    }
  }, [room, isOpen, initialStatus]);

  const handleSubmit = async () => {
    if (!room) return;
    if (selectedStatus === room.status && !note.trim()) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpdateStatus(room.id, selectedStatus, note);
      toast.success(`Đã cập nhật trạng thái phòng ${room.name}`);
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Có lỗi xảy ra khi cập nhật trạng thái');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted || !isOpen || !room) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className={cn(
        "w-full bg-white shadow-2xl overflow-hidden flex flex-col animate-in duration-300",
        "h-[92vh] mt-auto rounded-t-[40px] slide-in-from-bottom-full md:h-auto md:max-w-lg md:rounded-[32px] md:zoom-in-95 md:max-h-[90vh] md:mt-0"
      )}>
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
                    <CheckCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-800 leading-none">Trạng thái phòng {room.name}</h3>
                    <p className="text-xs text-slate-500 mt-1 font-medium">Chọn trạng thái mới cho phòng này</p>
                </div>
            </div>
            <button 
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full transition-all active:scale-95 border border-slate-200 shadow-sm"
            >
                <X className="w-5 h-5 text-slate-500" />
            </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-6 space-y-6 bg-slate-50 relative overflow-y-auto custom-scrollbar">
            
            {/* Status Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Available */}
                <button
                    onClick={() => setSelectedStatus('available')}
                    disabled={room.status === 'occupied'}
                    className={cn(
                        "flex flex-col items-center justify-center gap-3 p-5 rounded-[32px] border-none transition-all h-36 bg-white shadow-sm",
                        selectedStatus === 'available' 
                            ? "bg-emerald-600 text-white shadow-xl shadow-emerald-500/20 scale-105 z-10" 
                            : "text-slate-600 hover:bg-white hover:shadow-md",
                        room.status === 'occupied' && "opacity-50 cursor-not-allowed grayscale"
                    )}
                >
                    <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-colors", selectedStatus === 'available' ? "bg-white/20" : "bg-emerald-50")}>
                        <CheckCircle className={cn("w-7 h-7", selectedStatus === 'available' ? "text-white" : "text-emerald-600")} />
                    </div>
                    <span className="font-bold text-sm tracking-tight">Sẵn sàng</span>
                </button>

                {/* Dirty */}
                <button
                    onClick={() => setSelectedStatus('dirty')}
                    disabled={room.status === 'occupied'}
                    className={cn(
                        "flex flex-col items-center justify-center gap-3 p-5 rounded-[32px] border-none transition-all h-36 bg-white shadow-sm",
                        selectedStatus === 'dirty' 
                            ? "bg-amber-500 text-white shadow-xl shadow-amber-500/20 scale-105 z-10" 
                            : "text-slate-600 hover:bg-white hover:shadow-md",
                        room.status === 'occupied' && "opacity-50 cursor-not-allowed grayscale"
                    )}
                >
                    <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-colors", selectedStatus === 'dirty' ? "bg-white/20" : "bg-amber-50")}>
                        <Brush className={cn("w-7 h-7", selectedStatus === 'dirty' ? "text-white" : "text-amber-600")} />
                    </div>
                    <span className="font-bold text-sm tracking-tight">Cần dọn</span>
                </button>

                {/* Repair */}
                <button
                    onClick={() => setSelectedStatus('repair')}
                    disabled={room.status === 'occupied'}
                    className={cn(
                        "flex flex-col items-center justify-center gap-3 p-5 rounded-[32px] border-none transition-all h-36 bg-white shadow-sm",
                        selectedStatus === 'repair' 
                            ? "bg-rose-600 text-white shadow-xl shadow-rose-500/20 scale-105 z-10" 
                            : "text-slate-600 hover:bg-white hover:shadow-md",
                        room.status === 'occupied' && "opacity-50 cursor-not-allowed grayscale"
                    )}
                >
                    <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-colors", selectedStatus === 'repair' ? "bg-white/20" : "bg-rose-50")}>
                        <Wrench className={cn("w-7 h-7", selectedStatus === 'repair' ? "text-white" : "text-rose-600")} />
                    </div>
                    <span className="font-bold text-sm tracking-tight">Bảo trì</span>
                </button>
            </div>

            {room.status === 'occupied' && (
                <div className="flex items-center gap-4 p-5 bg-blue-50 text-blue-700 rounded-[32px] border border-blue-100 shadow-sm animate-in slide-in-from-top-2">
                    <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-6 h-6 text-blue-600" />
                    </div>
                    <span className="text-sm font-bold leading-tight">Phòng đang có khách, không thể đổi trạng thái.</span>
                </div>
            )}

            {/* Note */}
            <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1">Ghi chú (hiển thị trên sơ đồ)</label>
                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Nhập lý do (ví dụ: Hỏng máy lạnh, Cần thay bóng đèn...)"
                    className="w-full h-32 rounded-[40px] bg-white p-6 text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 border-none outline-none transition-all resize-none shadow-sm"
                />
            </div>

        </div>

        {/* Footer */}
        <div className="p-6 bg-white border-t border-slate-100 flex items-center gap-4 shrink-0">
            <button 
                onClick={onClose}
                className="flex-1 py-4 rounded-[24px] font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-wider"
            >
                Hủy bỏ
            </button>
            <button 
                onClick={handleSubmit}
                disabled={isSubmitting || room.status === 'occupied'}
                className={cn(
                    "flex-[2] py-4 rounded-[24px] font-bold text-white uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-3",
                    isSubmitting || room.status === 'occupied' 
                        ? "bg-slate-300 cursor-not-allowed shadow-none" 
                        : "bg-blue-600 hover:bg-blue-700 active:scale-95"
                )}
            >
                {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
