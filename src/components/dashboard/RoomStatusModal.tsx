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
    <div className="fixed inset-0 z-[50000] flex flex-col justify-end sm:justify-center items-center backdrop-blur-sm bg-slate-900/60 p-0 sm:p-4">
      {/* Modal Container */}
      <div className="w-full bg-white rounded-t-[32px] sm:rounded-[32px] sm:max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div>
                <h2 className="text-xl font-bold text-slate-800">Trạng thái phòng {room.name}</h2>
                <p className="text-sm text-slate-500 font-medium">Chọn trạng thái mới cho phòng này</p>
            </div>
            <button 
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-colors"
            >
                <X className="w-5 h-5 text-slate-500" />
            </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
            
            {/* Status Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Available */}
                <button
                    onClick={() => setSelectedStatus('available')}
                    disabled={room.status === 'occupied'}
                    className={cn(
                        "flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border-2 transition-all h-32",
                        selectedStatus === 'available' 
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm ring-2 ring-emerald-200 ring-offset-2" 
                            : "border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/50 text-slate-600",
                        room.status === 'occupied' && "opacity-50 cursor-not-allowed grayscale"
                    )}
                >
                    <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", selectedStatus === 'available' ? "bg-emerald-200" : "bg-slate-100")}>
                        <CheckCircle className={cn("w-6 h-6", selectedStatus === 'available' ? "text-emerald-700" : "text-slate-400")} />
                    </div>
                    <span className="font-bold text-sm">Sẵn sàng</span>
                </button>

                {/* Dirty */}
                <button
                    onClick={() => setSelectedStatus('dirty')}
                    disabled={room.status === 'occupied'}
                    className={cn(
                        "flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border-2 transition-all h-32",
                        selectedStatus === 'dirty' 
                            ? "border-amber-500 bg-amber-50 text-amber-700 shadow-sm ring-2 ring-amber-200 ring-offset-2" 
                            : "border-slate-100 hover:border-amber-200 hover:bg-amber-50/50 text-slate-600",
                        room.status === 'occupied' && "opacity-50 cursor-not-allowed grayscale"
                    )}
                >
                    <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", selectedStatus === 'dirty' ? "bg-amber-200" : "bg-slate-100")}>
                        <Brush className={cn("w-6 h-6", selectedStatus === 'dirty' ? "text-amber-700" : "text-slate-400")} />
                    </div>
                    <span className="font-bold text-sm">Cần dọn</span>
                </button>

                {/* Repair */}
                <button
                    onClick={() => setSelectedStatus('repair')}
                    disabled={room.status === 'occupied'}
                    className={cn(
                        "flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border-2 transition-all h-32",
                        selectedStatus === 'repair' 
                            ? "border-rose-500 bg-rose-50 text-rose-700 shadow-sm ring-2 ring-rose-200 ring-offset-2" 
                            : "border-slate-100 hover:border-rose-200 hover:bg-rose-50/50 text-slate-600",
                        room.status === 'occupied' && "opacity-50 cursor-not-allowed grayscale"
                    )}
                >
                    <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", selectedStatus === 'repair' ? "bg-rose-200" : "bg-slate-100")}>
                        <Wrench className={cn("w-6 h-6", selectedStatus === 'repair' ? "text-rose-700" : "text-slate-400")} />
                    </div>
                    <span className="font-bold text-sm">Bảo trì</span>
                </button>
            </div>

            {room.status === 'occupied' && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-medium">Phòng đang có khách, không thể đổi trạng thái.</span>
                </div>
            )}

            {/* Note */}
            <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 block">Ghi chú (hiển thị trên sơ đồ)</label>
                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Nhập lý do (ví dụ: Hỏng máy lạnh, Cần thay bóng đèn...)"
                    className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all resize-none h-24 text-sm font-medium"
                />
            </div>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
            <button 
                onClick={onClose}
                className="flex-1 py-3.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
            >
                Hủy bỏ
            </button>
            <button 
                onClick={handleSubmit}
                disabled={isSubmitting || room.status === 'occupied'}
                className={cn(
                    "flex-[2] py-3.5 rounded-xl font-bold text-white shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-2",
                    isSubmitting || room.status === 'occupied' 
                        ? "bg-slate-300 shadow-none cursor-not-allowed" 
                        : "bg-blue-600 hover:bg-blue-700"
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
