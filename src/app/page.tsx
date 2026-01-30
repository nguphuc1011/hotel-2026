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
import HandoverModal from '@/components/dashboard/HandoverModal';
import { differenceInMinutes } from 'date-fns';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import { cashFlowService, Wallet } from '@/services/cashFlowService';
import WalletCards from '@/app/cash-flow/components/WalletCards';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();
  const { confirm: confirmDialog, alert: alertDialog } = useGlobalDialog();
  const [rooms, setRooms] = useState<DashboardRoom[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
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
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isFolioOpen, setIsFolioOpen] = useState(false);
  const [isHandoverOpen, setIsHandoverOpen] = useState(false);

  // Derived Selected Room (Always fresh)
  const selectedRoom = useMemo(() => {
    return rooms.find(r => r.id === selectedRoomId) || null;
  }, [rooms, selectedRoomId]);

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
            p_booking_id: b.id
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

      // 2.5 Fetch Pending/Approved Security Requests
      const { data: approvalData } = await supabase
        .from('pending_approvals')
        .select('*')
        .in('status', ['PENDING', 'APPROVED']);

      // 3. Merge Data
      const mergedRooms: DashboardRoom[] = roomsData.map((room: any) => {
        const booking = activeBookings.find(b => b.room_id === room.id);
        
        // Find relevant approval request
        // Match by Room Number (if available)
        const approval = approvalData?.find(req => {
           const rData = req.request_data as any;
           
           // CRITICAL FIX: Only show approval if it matches the CURRENT Booking ID
           // If booking exists, we MUST match booking_id
           if (booking && rData?.booking_id) {
               // Check if the approval's booking_id matches current booking
               // Use startsWith because booking_id in rData might be short or full
               return booking.id.startsWith(rData.booking_id) || rData.booking_id === booking.id;
           }
           
           // If no booking exists (room available/dirty), we only show approvals that are NOT tied to a specific closed booking
           // OR if it's a general room request (maintenance, etc)
           // BUT for cancellation requests (checkin_cancel_booking), they are tied to a booking.
           // If the room is now empty/dirty, that booking is gone/cancelled, so we should NOT show the approval anymore.
           if (!booking && req.action_key === 'checkin_cancel_booking') {
               return false; 
           }

           // Fallback for non-booking requests (e.g. maintenance)
           if (rData?.room_id && rData.room_id === room.id) return true;
           if (rData?.room_number === (room.room_number || room.name)) return true;
           
           return false;
        });

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
          notes: room.notes,
          pending_approval: approval ? {
            id: approval.id,
            action: approval.action_key,
            status: approval.status,
            request_data: approval.request_data
          } : undefined
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

  // --- Central Execution Handler (The Executioner) ---
  const handleAutoExecution = async (request: any) => {
    console.log("Unified Engine Executing:", request.action_key);
    
    // Dispatcher
    switch (request.action_key) {
        case 'checkin_cancel_booking':
            await handleAutoFinalizeCancellation(request);
            break;
        case 'folio_remove_service':
            // await handleRemoveService(request); // Placeholder for future
            console.log("Auto-remove service pending implementation");
            break;
        case 'folio_discount_bill':
            // await handleDiscountBill(request); // Placeholder
            console.log("Auto-discount pending implementation");
            break;
        default:
            console.warn("Unknown action key for auto-execution:", request.action_key);
    }
  };

  // Specific Handler: Cancel Booking
  const handleAutoFinalizeCancellation = async (request: any) => {
    try {
        const { full_booking_id, penalty_amount, payment_method, reason } = request.request_data;
        
        // Validation
        if (!full_booking_id) {
            console.error("Auto-finalize failed: Missing full_booking_id");
            return;
        }

        const approver = {
            id: request.approved_by_staff_id,
            name: 'Quản lý (Remote)' // Since we don't have name in the row, we use a generic name
        };
        
        toast.info(`Đang tự động hoàn tất hủy phòng cho yêu cầu #${request.id.slice(0,4)}...`);
        
        const result = await bookingService.cancelBooking(
            full_booking_id,
            approver,
            penalty_amount,
            payment_method,
            reason
        );
        
        if (result.success) {
            toast.success("Đã tự động hủy phòng thành công!");
            // fetchData will be triggered by booking table change, but we can force it
            fetchData();
        } else {
            // Only show error if it's not "already cancelled" (optional, but for now show all)
            toast.error("Lỗi tự động hủy: " + result.message);
        }
    } catch (e: any) {
        console.error("Auto-finalize error", e);
        toast.error("Lỗi hệ thống khi tự động hủy: " + e.message);
    }
  };

  // Real-time Subscription & Initial Fetch
  useEffect(() => {
    fetchData();

    // Consolidated Subscription
    const channel = supabase
      .channel('dashboard_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        console.log("Room updated, refreshing...");
        setTimeout(() => fetchData(), 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        console.log("Booking updated, refreshing...");
        setTimeout(() => fetchData(), 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_approvals' }, (payload) => {
        console.log("Approval updated:", payload);
        setTimeout(() => fetchData(), 500);

        // Auto-Finalize Logic for Cancellation
            if (payload.eventType === 'UPDATE') {
                const newRecord = payload.new as any;
                
                // Trigger if status is APPROVED (ignoring old record due to Replica Identity limitations)
                if (newRecord.status === 'APPROVED') {
                    console.log("Approval received:", newRecord.id);
                    // DISABLED Auto-Execution as per User Request (Room Map Sync Mode)
                    // handleAutoExecution(newRecord); 
                }
            }
      })
      .subscribe((status) => {
        console.log("Realtime subscription status:", status);
        if (status === 'SUBSCRIBED') {
            toast.success("Đã kết nối thời gian thực");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    setSelectedRoomId(room.id);
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
          onHandoverClick={() => setIsHandoverOpen(true)}
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
            pendingApproval={selectedRoom.pending_approval}
          />
        )}
      
      <HandoverModal 
        isOpen={isHandoverOpen}
        onClose={() => setIsHandoverOpen(false)}
      />
    </div>
  );
}
