import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Users, 
  Search, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  User,
  Unlink,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DashboardRoom } from '@/types/dashboard';
import { supabase } from '@/lib/supabase';
import { groupBookingService } from '@/services/groupBookingService';
import { formatMoney } from '@/utils/format';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSecurity } from '@/hooks/useSecurity';

interface GroupRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterRoom: DashboardRoom;
  onSuccess: () => void;
  rooms: DashboardRoom[]; // Added
}

interface AvailableRoom {
  id: string; // Booking ID
  room_name: string;
  customer_name: string;
  amount: number;
}

export default function GroupRoomModal({
  isOpen, 
  onClose, 
  masterRoom,
  onSuccess,
  rooms // Added
}: GroupRoomModalProps) {
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { verify, SecurityModals } = useSecurity();

  // Fetch available rooms (checked_in, not same as master, not already grouped)
  const fetchRooms = useCallback(async () => {
    setIsLoading(true);
    try {
      // Check if masterRoom has a valid booking
      if (!masterRoom?.current_booking?.id) {
        console.warn('Master room has no active booking');
        setAvailableRooms([]);
        return;
      }

      // Logic: Lấy các phòng đang có khách (checked_in)
      // Loại trừ phòng hiện tại (masterRoom)
      // Loại trừ các phòng đã thuộc nhóm khác (parent_booking_id is not null)
      
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          room_id,
          room:rooms!bookings_room_id_fkey!inner(room_number),
          customer:customers(full_name),
          total_amount,
          parent_booking_id
        `)
        .eq('status', 'checked_in')
        .neq('id', masterRoom.current_booking.id)
        .is('parent_booking_id', null);

      if (error) throw error;

      // Filter out rooms that are already group masters
      const filteredBookingsData = data.filter((booking: any) => {
        const dashboardRoom = rooms.find(r => r.current_booking?.id === booking.id);
        return !(dashboardRoom?.is_group_master);
      });

      // Transform data to simple structure
      const roomsToSet = await Promise.all(filteredBookingsData.map(async (b: any) => {
        let amount = 0;
        try {
          const bill = await groupBookingService.getBookingBill(b.id);
          amount = bill?.total_amount || 0;
        } catch (billError) {
          console.error(`Error fetching bill for booking ${b.id}:`, billError);
        }
        return {
          id: b.id, // Booking ID
          room_name: b.room?.room_number,
          customer_name: b.customer?.full_name || 'Khách vãng lai',
          amount: amount
        };
      }));

      setAvailableRooms(roomsToSet);
    } catch (error) {
      console.error('Error fetching rooms:', JSON.stringify(error, null, 2));
      toast.error('Không thể tải danh sách phòng');
    } finally {
      setIsLoading(false);
    }
  }, [masterRoom, rooms]); // Dependencies for useCallback: masterRoom and rooms

  useEffect(() => {
    if (isOpen && masterRoom) {
      fetchRooms();
    }
  }, [isOpen, masterRoom, fetchRooms]); // Added fetchRooms to useEffect dependencies

  const handleToggleRoom = (bookingId: string) => {
    setSelectedRooms(prev => 
      prev.includes(bookingId) 
        ? prev.filter(id => id !== bookingId)
        : [...prev, bookingId]
    );
  };

  const handleSubmit = async () => {
    if (selectedRooms.length === 0) return;
    
    verify('folio_group_rooms', async () => {
      setIsSubmitting(true);
      try {
        if (!masterRoom.current_booking?.id) {
            throw new Error("Phòng chính không hợp lệ");
        }
        
        const result: { success: boolean; message?: string; data?: any } = await groupBookingService.groupRooms(
          masterRoom.current_booking.id,
          selectedRooms
        );

        if (result.success) {
          toast.success(`Đã gộp ${selectedRooms.length} phòng vào nhóm thành công!`);
          onSuccess();
          onClose();
        } else {
          toast.error(result.message || 'Có lỗi xảy ra khi gộp phòng');
        }
      } catch (error) {
        console.error('Group rooms error:', error);
        toast.error('Gộp phòng thất bại');
      } finally {
        setIsSubmitting(false);
      }
    }, {
      master_room: masterRoom.name,
      child_rooms_count: selectedRooms.length,
      child_room_ids: selectedRooms
    });
  };

  if (!isOpen) return null;

  const filteredRooms = availableRooms.filter(r => 
    r.room_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return createPortal(
    <div className="fixed inset-0 z-[50000] flex flex-col justify-end sm:justify-center items-center backdrop-blur-md bg-slate-900/60">
      {SecurityModals}
      <div className="w-full h-[95vh] sm:w-full sm:max-w-xl sm:h-auto sm:max-h-[90vh] sm:rounded-[40px] bg-slate-50 flex flex-col shadow-2xl overflow-hidden relative">
        
        {/* Header */}
        <div className="h-16 flex justify-between items-center px-6 bg-white z-50 shrink-0 shadow-sm border-b border-slate-100/50">
          <div className="flex items-center gap-3">
            <span className="bg-slate-900 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg uppercase tracking-wider shadow-sm">Gộp Phòng</span>
            <h2 className="text-lg font-bold text-slate-800"></h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-full transition-all active:scale-95">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] bg-slate-50 relative">
          {/* Search */}
          <div className="relative group bg-white rounded-[32px] shadow-sm p-1 transition-shadow hover:shadow-md">
            <div className="flex items-center px-4">
                <Search className="w-5 h-5 text-slate-400 mr-3" />
                <input
                    type="text"
                    placeholder="Tìm theo tên phòng hoặc tên khách..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full py-4 bg-transparent border-none text-base font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-0 outline-none"
                />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {isLoading ? (
              <div className="text-center py-8 text-slate-400">Đang tải danh sách...</div>
            ) : filteredRooms.length === 0 ? (
              <div className="text-center py-8 flex flex-col items-center text-slate-400">
                <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                <p>Không tìm thấy phòng nào phù hợp để gộp.</p>
                <p className="text-xs mt-1">(Chỉ hiển thị các phòng đang có khách và chưa thuộc nhóm nào)</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredRooms.map((room: any) => {
                  const isSelected = selectedRooms.includes(room.id);
                  return (
                    <div 
                      key={room.id}
                      onClick={() => handleToggleRoom(room.id)}
                      className={cn(
                        "cursor-pointer p-4 rounded-[32px] border-2 transition-all duration-200 relative group flex flex-col items-center justify-center text-center",
                        isSelected 
                          ? 'border-blue-500 bg-blue-50/50' 
                          : 'border-slate-100 hover:border-blue-200 bg-white'
                      )}
                    >
                      <div className="flex flex-col items-center justify-center mb-2">
                        <span className="text-2xl font-bold text-slate-900">
                          {room.room_name}
                        </span>
                      </div>
                      
                      <div className="text-sm text-slate-600 mb-1 truncate">
                        {room.customer_name || 'Khách vãng lai'}
                      </div>
                      
                      <div className="text-xs font-medium text-slate-400">
                        Tạm tính: {formatMoney(room.amount || 0)}
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-blue-500 text-white p-1 rounded-full">
                          <CheckCircle2 size={12} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-white border-t border-slate-100 flex items-center gap-4 z-50">
          <div className="text-sm text-slate-500 flex-1">
            Đã chọn: <span className="font-bold text-slate-900">{selectedRooms.length}</span> phòng
          </div>
          <button 
            onClick={onClose}
            className="flex-1 py-4 rounded-[24px] font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-wider"
          >
            Hủy bỏ
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={selectedRooms.length === 0 || isSubmitting}
            className={cn(
                "flex-[2] py-4 rounded-[24px] font-bold text-white uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-3",
                isSubmitting ? "bg-slate-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 active:scale-95"
            )}
          >
            {isSubmitting ? (
                <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Đang xử lý...</span>
                </>
            ) : (
                <>
                    <span>Xác nhận gộp</span>
                    <ArrowRight className="w-5 h-5" />
                </>
            )}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
