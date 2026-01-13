'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { serviceService } from '@/services/serviceService';
import { customerService } from '@/services/customerService';
import { DashboardRoom, RoomStatus } from '@/types/dashboard';
import RoomCard from '@/components/dashboard/RoomCard';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import CheckInModal from '@/components/dashboard/CheckInModal';
import RoomFolioModal from '@/components/dashboard/RoomFolioModal';
import { differenceInMinutes } from 'date-fns';

export default function DashboardPage() {
  const [rooms, setRooms] = useState<DashboardRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RoomStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [selectedRoom, setSelectedRoom] = useState<DashboardRoom | null>(null);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isFolioOpen, setIsFolioOpen] = useState(false);

  // Fetch initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch Rooms
      const { data: roomsData, error: roomsError } = await supabase
        .from('rooms')
        .select(`
          *,
          category:room_categories(id, name, price_hourly, price_overnight, price_daily)
        `)
        .order('room_number', { ascending: true });

      if (roomsError) throw roomsError;

      // 2. Fetch Active Bookings
      // We want bookings that are NOT checked_out or cancelled
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers(full_name)
        `)
        .in('status', ['confirmed', 'checked_in']);

      if (bookingsError) throw bookingsError;

      // 3. Merge Data
      const mergedRooms: DashboardRoom[] = roomsData.map((room: any) => {
        const booking = bookingsData?.find(b => b.room_id === room.id);
        
        let dashboardRoom: DashboardRoom = {
          id: room.id,
          name: room.room_number || room.name,
          category_id: room.category_id,
          category_name: room.category?.name,
          price_hourly: room.category?.price_hourly,
          price_daily: room.category?.price_daily,
          price_overnight: room.category?.price_overnight,
          status: room.status as RoomStatus,
          updated_at: room.updated_at, // For "dirty" timer
          notes: room.notes
        };

        if (booking) {
          dashboardRoom.current_booking = {
            id: booking.id,
            room_id: booking.room_id,
            customer_id: booking.customer_id,
            customer_name: booking.customer?.full_name,
            check_in_at: booking.check_in_at,
            booking_type: booking.rental_type, // Map rental_type from DB to booking_type in Interface
            total_amount: booking.total_amount || 0, // In real app, might need calculation logic here
            prepayment: booking.prepayment || 0,
            status: booking.status
          };
          // Force status to occupied if there's a booking, to be safe, 
          // though DB should stay in sync.
          if (dashboardRoom.status === 'available') {
             dashboardRoom.status = 'occupied';
          }
        }

        // Check "Clean Eye" logic
        if (dashboardRoom.status === 'dirty' && room.updated_at) {
          const minutesDirty = differenceInMinutes(new Date(), new Date(room.updated_at));
          if (minutesDirty > 60) {
            dashboardRoom.is_dirty_overdue = true;
          }
        }

        return dashboardRoom;
      });

      setRooms(mergedRooms);

    } catch (error) {
      console.error('Error fetching dashboard data:', JSON.stringify(error, null, 2));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Real-time Subscription
  useEffect(() => {
    fetchData();

    // Subscribe to changes in rooms and bookings
    const roomsChannel = supabase
      .channel('public:rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        fetchData(); // Reload all for simplicity, or optimize to update specific room
      })
      .subscribe();

    const bookingsChannel = supabase
      .channel('public:bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchData();
      })
      .subscribe();

    // Interval to update "minutes ago" or timers every minute
    const interval = setInterval(() => {
       setRooms(prev => [...prev]); // Trigger re-render to update relative times/flashing
    }, 60000);

    return () => {
      supabase.removeChannel(roomsChannel);
      supabase.removeChannel(bookingsChannel);
      clearInterval(interval);
    };
  }, []);

  // Filtering & Search
  const filteredRooms = useMemo(() => {
    return rooms.filter(room => {
      // 1. Status Filter
      if (filter !== 'all' && room.status !== filter) return false;
      
      // 2. Search Query
      if (searchQuery) {
        return room.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      
      return true;
    });
  }, [rooms, filter, searchQuery]);

  // Counts for Header
  const counts = useMemo(() => {
    return {
      total: rooms.length,
      available: rooms.filter(r => r.status === 'available').length,
      occupied: rooms.filter(r => r.status === 'occupied').length,
      dirty: rooms.filter(r => r.status === 'dirty').length,
      repair: rooms.filter(r => r.status === 'repair').length,
    };
  }, [rooms]);

  // Handle Click
  const handleRoomClick = (room: DashboardRoom) => {
    setSelectedRoom(room);
    if (room.status === 'available') {
      setIsCheckInOpen(true);
    } else if (room.status === 'occupied') {
      setIsFolioOpen(true);
    } else if (room.status === 'dirty') {
      const confirmClean = window.confirm(`Xác nhận phòng ${room.name} đã dọn xong?`);
      if (confirmClean) {
        // Optimistic update
        updateRoomStatus(room.id, 'available');
      }
    }
  };

  const updateRoomStatus = async (roomId: string, newStatus: RoomStatus) => {
    try {
      await supabase.from('rooms').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', roomId);
    } catch (e) {
      console.error(e);
      alert('Lỗi cập nhật trạng thái');
    }
  };

  const handleCheckIn = async (bookingData: any) => {
    try {
      // Resolve customer: use selected, otherwise default to "Khách vãng lai"
      let customerId = bookingData.customer_id || null;
      if (!customerId) {
        const walkIn = await customerService.getOrCreateWalkInCustomer();
        customerId = walkIn?.id || null;
      }
      
      // 1. Create Booking
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert([{
          room_id: bookingData.room_id,
          customer_id: customerId, // default walk-in if missing
          rental_type: bookingData.rental_type,
          check_in_actual: new Date().toISOString(),
          status: 'checked_in',
          deposit_amount: bookingData.deposit || 0
        }])
        .select()
        .single();

      if (bookingError) throw bookingError;

      // 1.5 Add Services (if any)
      if (bookingData.services && bookingData.services.length > 0) {
          await Promise.all(bookingData.services.map((s: any) => 
              serviceService.addServiceToBooking(booking.id, s.id, s.quantity, s.price)
          ));
      }

      // 2. Update Room Status
      await updateRoomStatus(bookingData.room_id, 'occupied');
      
      // 3. Refresh Data
      fetchData();
      setIsCheckInOpen(false);
    } catch (error) {
      console.error('Check-in error:', JSON.stringify(error, null, 2));
      alert('Lỗi nhận phòng: ' + ((error as any).message || 'Lỗi không xác định'));
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-8 pb-32">
      <div className="max-w-[1600px] mx-auto">
        <DashboardHeader 
          counts={counts}
          currentFilter={filter}
          onFilterChange={setFilter}
          onSearch={setSearchQuery}
        />

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
            {filteredRooms.map((room) => (
              <RoomCard 
                key={room.id} 
                room={room} 
                onClick={handleRoomClick} 
              />
            ))}
          </div>
        )}

        {!loading && filteredRooms.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            <p>Không tìm thấy phòng nào.</p>
          </div>
        )}
      </div>
      
      {/* Modals */}
      <CheckInModal 
        isOpen={isCheckInOpen}
        onClose={() => setIsCheckInOpen(false)}
        room={selectedRoom}
        onCheckIn={handleCheckIn}
      />
      
      {selectedRoom && selectedRoom.current_booking && (
        <RoomFolioModal
            isOpen={isFolioOpen}
            onClose={() => setIsFolioOpen(false)}
            room={selectedRoom}
            booking={selectedRoom.current_booking}
            onUpdate={fetchData}
        />
      )}
    </div>
  );
}
