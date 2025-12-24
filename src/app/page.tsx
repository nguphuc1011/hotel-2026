'use client';

import { useState, useMemo } from 'react';
import { useHotel } from '@/hooks/useHotel';
import { RoomCard } from '@/components/dashboard/RoomCard';
import { CheckInModal } from '@/components/dashboard/CheckInModal';
import { FolioModal } from '@/components/dashboard/FolioModal';
import { Room } from '@/types';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';

export default function Dashboard() {
  const { rooms, settings, isLoading, mutateRooms } = useHotel();
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [folioRoom, setFolioRoom] = useState<Room | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [activeFilterIds, setActiveFilterIds] = useState<string[]>(['available', 'hourly', 'daily', 'dirty', 'repair']);

  const timeRules = settings?.find((s: any) => s.key === 'time_rules')?.value;

  const roomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rooms.forEach(room => {
      counts[room.status] = (counts[room.status] || 0) + 1;
    });
    return counts;
  }, [rooms]);

  const onToggleFilter = (id: string) => {
    setActiveFilterIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id) 
        : [...prev, id]
    );
  };

  const filteredRooms = rooms.filter(room => {
    if (room.status === 'overnight') return activeFilterIds.includes('daily');
    return activeFilterIds.includes(room.status);
  });

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
          <h2 className="text-2xl font-bold text-zinc-900">Chưa có dữ liệu phòng</h2>
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
      <DashboardHeader 
        activeFilterIds={activeFilterIds}
        onToggleFilter={onToggleFilter}
        roomCounts={roomCounts}
      />

      <motion.div 
        layout
        className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 xl:gap-8"
      >
        <AnimatePresence mode='popLayout'>
          {filteredRooms.map((room) => (
            <motion.div
              layout
              key={room.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            >
              <RoomCard 
                room={room} 
                onClick={handleRoomClick}
              />
            </motion.div>
          ))}
        </AnimatePresence>
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
          settings={settings}
          isOpen={!!folioRoom}
          onClose={() => setFolioRoom(null)}
          onPayment={handlePayment}
        />
      )}
    </div>
  );
}

{/* Force Update 19:15 */}
{/* Trigger Build Again */}
