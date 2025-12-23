'use client';

import { useState } from 'react';
import { useHotel } from '@/hooks/useHotel';
import { RoomCard } from '@/components/dashboard/RoomCard';
import { CheckInModal } from '@/components/dashboard/CheckInModal';
import { FolioModal } from '@/components/dashboard/FolioModal';
import { motion } from 'framer-motion';
import { Room } from '@/types';
import { supabase } from '@/lib/supabase';

export default function Dashboard() {
  const { rooms, settings, isLoading, mutateRooms } = useHotel();
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [folioRoom, setFolioRoom] = useState<Room | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  const timeRules = settings?.find((s: any) => s.key === 'time_rules')?.value;

  const handleRoomClick = async (room: Room) => {
    if (room.status === 'available') {
      setSelectedRoom(room);
    } else if (['hourly', 'daily', 'overnight'].includes(room.status)) {
      setFolioRoom(room);
    } else if (['dirty', 'repair'].includes(room.status)) {
      if (window.confirm(`Xác nhận phòng ${room.room_number} đã sẵn sàng đón khách?`)) {
        try {
          const { error } = await supabase
            .from('rooms')
            .update({ status: 'available', current_booking_id: null })
            .eq('id', room.id);
          
          if (error) throw error;
          mutateRooms();
        } catch (error) {
          console.error('Error updating status:', error);
          alert('Không thể cập nhật trạng thái phòng');
        }
      }
    }
  };

  const handlePayment = async (amount: number) => {
    // Placeholder for payment logic
    if (!folioRoom) return;
    
    try {
      // 1. Update booking status to completed
      if (folioRoom.current_booking_id) {
         await supabase
          .from('bookings')
          .update({ 
            status: 'completed', 
            check_out_at: new Date().toISOString(),
            // total_amount: amount 
          })
          .eq('id', folioRoom.current_booking_id);
      }

      // 2. Set room to dirty
      await supabase
        .from('rooms')
        .update({ status: 'dirty', current_booking_id: null })
        .eq('id', folioRoom.id);

      mutateRooms();
      alert(`Thanh toán phòng ${folioRoom.room_number} thành công!`);
    } catch (error) {
      console.error(error);
      alert('Lỗi thanh toán');
    }
  };

  const handleCheckIn = async (data: any) => {
    try {
      if (!selectedRoom) return;

      let customerId = null;
      
      // 1. Create/Find Customer
      if (data.customer && data.customer.name) {
        // Try to find existing first to avoid unique constraint errors if not handled
        const { data: existingCust } = await supabase
          .from('customers')
          .select('id')
          .or(`phone.eq.${data.customer.phone},id_card.eq.${data.customer.idCard}`)
          .maybeSingle();

        if (existingCust) {
          customerId = existingCust.id;
          // Optional: Update visit count or info
        } else {
          const { data: newCust, error: custError } = await supabase
            .from('customers')
            .insert([{
              full_name: data.customer.name,
              phone: data.customer.phone,
              id_card: data.customer.idCard,
              visit_count: 1,
              total_spent: 0
            }])
            .select()
            .single();

          if (custError) {
             console.error('Error creating customer:', custError);
             // Proceed without customer or throw? Let's proceed but warn.
          } else {
            customerId = newCust.id;
          }
        }
      }

      // 2. Create booking
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert([{
          room_id: selectedRoom.id,
          customer_id: customerId,
          check_in_at: new Date().toISOString(),
          rental_type: data.rentalType,
          initial_price: data.price,
          deposit_amount: data.deposit || 0,
          room_charge_locked: 0,
          status: 'active'
        }])
        .select()
        .single();

      if (bookingError) throw bookingError;

      // 3. Update room status
      const { error: roomError } = await supabase
        .from('rooms')
        .update({ 
          status: data.rentalType, // 'hourly', 'daily', 'overnight'
          current_booking_id: booking.id
        })
        .eq('id', selectedRoom.id);

      if (roomError) throw roomError;

      // Success
      alert(`Đã nhận phòng ${selectedRoom.room_number} thành công!`);
      setSelectedRoom(null);
      mutateRooms(); // Refresh data immediately
      
    } catch (error: any) {
      console.error('Check-in error:', error);
      alert(`Lỗi khi nhận phòng: ${error.message}`);
    }
  };

  const seedRooms = async () => {
    if (rooms.length > 0) {
      const confirmReset = window.confirm(
        'Bạn có chắc chắn muốn nạp lại dữ liệu mẫu? Hành động này sẽ cập nhật lại giá và thông tin cho các phòng hiện có.'
      );
      if (!confirmReset) return;
    }

    setIsSeeding(true);
    try {
      const sampleRooms = Array.from({ length: 12 }, (_, i) => {
        const floor = Math.floor(i / 4) + 1;
        const num = (i % 4) + 1;
        return {
          room_number: `${floor}0${num}`,
          area: `Tầng ${floor}`,
          room_type: num === 4 ? 'VIP' : 'Standard',
          status: 'available',
          prices: { 
            hourly: 60000, 
            next_hour: 20000, 
            overnight: 150000, 
            daily: 250000 
          },
          enable_overnight: true
        };
      });

      const { error } = await supabase
        .from('rooms')
        .upsert(sampleRooms, { onConflict: 'room_number' });
      if (error) throw error;
      
      mutateRooms();
      alert('Đã khởi tạo 12 phòng mẫu thành công!');
    } catch (error: any) {
      console.error('Seed error:', error);
      alert(`Lỗi khởi tạo: ${error.message}`);
    } finally {
      setIsSeeding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  // Empty State with Seed Button
  if (!isLoading && rooms.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Chưa có dữ liệu phòng</h2>
          <p className="text-zinc-500">Database đang trống. Hãy khởi tạo dữ liệu mẫu để bắt đầu.</p>
        </div>
        <button
          onClick={seedRooms}
          disabled={isSeeding}
          className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg transition hover:bg-blue-700 disabled:opacity-50"
        >
          {isSeeding ? 'Đang khởi tạo...' : 'Khởi tạo 12 phòng mẫu'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20"> {/* Add padding bottom for mobile scroll */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            Sơ đồ phòng
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-lg text-zinc-500">
              {rooms?.filter(r => r.status === 'available').length || 0} phòng trống • {rooms?.length || 0} tổng số
            </p>
            <button 
              onClick={seedRooms}
              disabled={isSeeding}
              className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-500 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-400"
            >
              {isSeeding ? 'Đang nạp...' : 'Khởi tạo lại dữ liệu'}
            </button>
          </div>
        </div>
        
        <div className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm dark:bg-zinc-900">
          {['Tất cả', 'Trống', 'Đang ở', 'Chờ dọn'].map((filter) => (
            <button
              key={filter}
              className="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 xl:gap-8"
      >
        {rooms.map((room) => (
          <RoomCard 
            key={room.id} 
            room={room} 
            onClick={handleRoomClick}
          />
        ))}
      </motion.div>

      {selectedRoom && (
        <CheckInModal 
          room={selectedRoom} 
          timeRules={timeRules}
          onClose={() => setSelectedRoom(null)}
          onConfirm={handleCheckIn}
        />
      )}

      {folioRoom && (
        <FolioModal
          room={folioRoom}
          timeRules={timeRules}
          isOpen={!!folioRoom}
          onClose={() => setFolioRoom(null)}
          onPayment={handlePayment}
        />
      )}
    </div>
  );
}
