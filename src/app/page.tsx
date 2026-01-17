'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { serviceService } from '@/services/serviceService';
import { customerService } from '@/services/customerService';
import { bookingService } from '@/services/bookingService';
import { DashboardRoom, RoomStatus } from '@/types/dashboard';
import RoomCard from '@/components/dashboard/RoomCard';
import DashboardHeader, { FilterState } from '@/components/dashboard/DashboardHeader';
import CheckInModal from '@/components/dashboard/CheckInModal';
import RoomFolioModal from '@/components/dashboard/RoomFolioModal';
import { differenceInMinutes } from 'date-fns';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';
import { toast } from 'sonner';

export default function DashboardPage() {
  const { confirm: confirmDialog, alert: alertDialog } = useGlobalDialog();
  const [rooms, setRooms] = useState<DashboardRoom[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New Filter State
  const [filters, setFilters] = useState<FilterState>({
    available: true,
    daily: true,
    hourly: true,
    dirty: true,
    repair: true
  });

  // Modal State
  const [selectedRoom, setSelectedRoom] = useState<DashboardRoom | null>(null);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isFolioOpen, setIsFolioOpen] = useState(false);

  // Virtual Time State
  const [isVirtualEnabled, setIsVirtualEnabled] = useState(false);
  const [virtualTime, setVirtualTime] = useState(new Date().toISOString());

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
          customer:customers(full_name, balance)
        `)
        .in('status', ['confirmed', 'checked_in']);

      if (bookingsError) throw bookingsError;

      // 2.1 Calculate real-time bills for active bookings
      const activeBookings = await Promise.all((bookingsData || []).map(async (b) => {
        try {
          const { data: billData } = await supabase.rpc('calculate_booking_bill', { 
            p_booking_id: b.id,
            p_now_override: isVirtualEnabled ? virtualTime : null
          });
          return { 
            ...b, 
            // Use the calculated total_amount from the billing engine
            total_amount: billData?.total_amount || 0,
            // Ensure we have the correct check-in time for the timer
            check_in_at: b.check_in_actual
          };
        } catch (e) {
          console.error(`Error calculating bill for booking ${b.id}:`, e);
          return { ...b, check_in_at: b.check_in_actual };
        }
      }));

      // 3. Merge Data
      const mergedRooms: DashboardRoom[] = roomsData.map((room: any) => {
        const booking = activeBookings.find(b => b.room_id === room.id);
        
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
            customer_balance: booking.customer?.balance || 0,
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

  // Real-time Subscription & Initial Fetch
  useEffect(() => {
    fetchData();

    // Subscribe to changes in rooms and bookings
    const roomsChannel = supabase
      .channel('public:rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        fetchData();
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
       // If virtual time is NOT enabled, we just trigger re-render
       // If virtual time IS enabled, we might want to increment it, 
       // but for testing usually static is better or manually controlled.
       setRooms(prev => [...prev]); 
    }, 60000);

    return () => {
      supabase.removeChannel(roomsChannel);
      supabase.removeChannel(bookingsChannel);
      clearInterval(interval);
    };
  }, [isVirtualEnabled, virtualTime]);

  // Handle virtual time toggle
  const handleVirtualToggle = (enabled: boolean) => {
    setIsVirtualEnabled(enabled);
    if (enabled) {
      setVirtualTime(new Date().toISOString());
    }
  };

  // Filtering Logic
  const filteredRooms = useMemo(() => {
    return rooms.filter(room => {
      if (room.status === 'available') return filters.available;
      if (room.status === 'dirty') return filters.dirty;
      if (room.status === 'repair') return filters.repair;
      if (room.status === 'occupied') {
         const isHourly = room.current_booking?.booking_type === 'hourly';
         return isHourly ? filters.hourly : filters.daily;
      }
      return false; // Should not happen if all statuses covered
    });
  }, [rooms, filters]);

  // Counts for Header
  const counts = useMemo(() => {
    return {
      total: rooms.length,
      available: rooms.filter(r => r.status === 'available').length,
      daily: rooms.filter(r => r.status === 'occupied' && r.current_booking?.booking_type !== 'hourly').length,
      hourly: rooms.filter(r => r.status === 'occupied' && r.current_booking?.booking_type === 'hourly').length,
      dirty: rooms.filter(r => r.status === 'dirty').length,
      repair: rooms.filter(r => r.status === 'repair').length,
    };
  }, [rooms]);

  const handleToggleFilter = (key: keyof FilterState) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Handle Click
  const handleRoomClick = async (room: DashboardRoom) => {
    setSelectedRoom(room);
    if (room.status === 'available') {
      setIsCheckInOpen(true);
    } else if (room.status === 'occupied') {
      setIsFolioOpen(true);
    } else if (room.status === 'dirty') {
      const confirmClean = await confirmDialog({
        title: 'Xác nhận dọn phòng',
        message: `Xác nhận phòng ${room.name} đã dọn xong?`,
        confirmLabel: 'Đã dọn xong',
        type: 'confirm'
      });
      
      if (confirmClean) {
        // Optimistic update local state
        setRooms(prevRooms => prevRooms.map(r => 
          r.id === room.id ? { ...r, status: 'available' as RoomStatus, current_booking: undefined } : r
        ));

        // Update and refresh
        await updateRoomStatus(room.id, 'available');
        toast.success(`Phòng ${room.name} đã dọn xong`);
        fetchData();
      }
    }
  };

  const updateRoomStatus = async (roomId: string, newStatus: RoomStatus) => {
    try {
      await supabase.from('rooms').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', roomId);
    } catch (e) {
      console.error(e);
      toast.error('Lỗi cập nhật trạng thái');
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
      
      // Use BookingService (RPC) instead of direct insert
      await bookingService.checkIn({
        room_id: bookingData.room_id,
        rental_type: bookingData.rental_type,
        customer_id: customerId,
        deposit: bookingData.deposit || 0,
        services: bookingData.services || [],
        customer_name: bookingData.customer_name,
        notes: bookingData.notes,
        // Optional fields that might be ignored by backend if not supported yet
        extra_adults: bookingData.extra_adults,
        extra_children: bookingData.extra_children,
        custom_price: bookingData.custom_price,
        custom_price_reason: bookingData.custom_price_reason
      });

      // Refresh Data
      toast.success('Nhận phòng thành công');
      fetchData();
      setIsCheckInOpen(false);
    } catch (error) {
      console.error('Check-in error:', JSON.stringify(error, null, 2));
      await alertDialog({
        title: 'Lỗi nhận phòng',
        message: (error as any).message || 'Lỗi không xác định',
        type: 'error'
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-4 md:p-8 pb-32">
      <div className="max-w-[1600px] mx-auto">
        <DashboardHeader 
          counts={counts}
          filters={filters}
          onToggle={handleToggleFilter}
          isVirtualEnabled={isVirtualEnabled}
          virtualTime={virtualTime}
          onVirtualToggle={handleVirtualToggle}
          onVirtualTimeChange={setVirtualTime}
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
                virtualTime={isVirtualEnabled ? virtualTime : null}
              />
            ))}
          </div>
        )}

        {!loading && filteredRooms.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            <p>Không tìm thấy phòng nào phù hợp bộ lọc.</p>
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
            virtualTime={isVirtualEnabled ? virtualTime : null}
          />
        )}
    </div>
  );
}
