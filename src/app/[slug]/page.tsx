'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { serviceService } from '@/services/serviceService';
import { customerService } from '@/services/customerService';
import { bookingService } from '@/services/bookingService';
import { DashboardRoom, RoomStatus } from '@/types/dashboard';
import RoomCard from '@/components/dashboard/RoomCard';
import RoomStatusModal from '@/components/dashboard/RoomStatusModal';
import DashboardHeader, { FilterState } from '@/components/dashboard/DashboardHeader';
import CheckInModal from '@/components/dashboard/CheckInModal';
import RoomFolioModal from '@/components/dashboard/RoomFolioModal';
import GroupRoomModal from '@/components/dashboard/GroupRoomModal';
import { differenceInMinutes } from 'date-fns';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import { cashFlowService, Wallet } from '@/services/cashFlowService';
import WalletCards from '@/app/[slug]/tien/components/WalletCards';
import { useRouter } from 'next/navigation';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSION_KEYS } from '@/services/permissionService';
import { ShieldCheck } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { can, isLoading: isAuthLoading } = usePermission();
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
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  
  // Status Change Modal State
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedRoomForStatus, setSelectedRoomForStatus] = useState<DashboardRoom | null>(null);
  const [initialStatusForModal, setInitialStatusForModal] = useState<RoomStatus | undefined>(undefined);

  // Derived Selected Room (Always fresh)
  const selectedRoom = useMemo(() => {
    return rooms.find(r => r.id === selectedRoomId) || null;
  }, [rooms, selectedRoomId]);

  // Sử dụng useRef để duy trì trạng thái của map và set màu
  const masterBookingIdToColorMapRef = useRef(new Map<string, string>());
  const usedColorsRef = useRef(new Set<string>());
  const colorIndexRef = useRef(0);

  // --- Group Color Assignment ---
  const predefinedGroupColors = [
    '#60A5FA', // Blue-400
    '#818CF8', // Indigo-400
    '#A78BFA', // Violet-400
    '#F472B6', // Pink-400
    '#FB7185', // Rose-400
    '#FBBF24', // Amber-400
    '#34D399', // Emerald-400
    '#22D3EE', // Cyan-400
    '#6EE7B7', // Teal-400
    '#9CA3AF', // Gray-400
  ];
  
  // Hàm trợ giúp để tạo màu hex ngẫu nhiên
  const getRandomColor = useCallback(() => {
    let color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    // Đảm bảo màu được tạo không bị trùng với các màu đã sử dụng hoặc màu định nghĩa trước
    while (usedColorsRef.current.has(color) || predefinedGroupColors.includes(color)) {
      color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    }
    return color;
  }, [usedColorsRef, predefinedGroupColors]); // Added dependencies

  // Fetch initial data
  const fetchData = useCallback(async () => { // Wrapped in useCallback
    if (!can(PERMISSION_KEYS.VIEW_DASHBOARD)) return;

    try {
      setLoading(true);
      
      // Reset color maps before assigning new colors
      masterBookingIdToColorMapRef.current.clear();
      usedColorsRef.current.clear();
      colorIndexRef.current = 0;
      
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
      // FALLBACK: If RLS is blocking direct 'bookings' access due to missing hotel_id,
      // we might need to rely on the RPC which has different security context or fix data.
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers(full_name, balance)
        `)
        .in('status', ['confirmed', 'checked_in', 'occupied']); // Added 'occupied' just in case

      if (bookingsError) throw bookingsError;

      // 2.1 Fetch real-time bills for all active bookings in one bulk RPC
      // This RPC might return bookings even if RLS on table is tricky
      let ratesData = [];
      try {
        const { data, error: ratesError } = await supabase
          .rpc('get_dashboard_room_rates');
        
        if (ratesError) {
          console.warn('Dashboard room rates RPC failed, continuing with partial data:', ratesError.message);
        } else {
          ratesData = data || [];
        }
      } catch (e) {
        console.warn('Exception in dashboard rates fetch:', e);
      }

      const ratesByBookingId = new Map<string, any>(
        ratesData.map((r: any) => [r.booking_id, r])
      );

      // Map rates to active bookings, and also handle bookings found in rates but not in bookingsData
      // (This happens if bookings have hotel_id=null and are hidden from normal table SELECT)
      const activeBookings = [...(bookingsData || [])];
      
      // Look for "ghost" bookings in ratesData that aren't in bookingsData
      ratesData.forEach((rate: any) => {
        if (!activeBookings.find(b => b.id === rate.booking_id)) {
          console.log("Found ghost booking from RPC:", rate.booking_id);
          activeBookings.push({
            id: rate.booking_id,
            room_id: rate.room_id,
            rental_type: rate.rental_type,
            check_in_at: rate.check_in_at,
            status: 'checked_in',
            total_amount: rate.total_amount,
            is_ghost: true // Flag for debugging
          });
        }
      });

      const processedBookings = activeBookings.map((b: any) => {
        const rate = ratesByBookingId.get(b.id);
        return {
          ...b,
          total_amount: rate?.total_amount ?? b.total_amount ?? 0,
          check_in_at: rate?.check_in_at ?? b.check_in_actual,
        };
      });

      // 3. Merge Data
      const mergedRooms: DashboardRoom[] = roomsData.map((room: any) => {
        const booking = processedBookings.find(b => b.room_id === room.id);

        let dashboardRoom: DashboardRoom = {
          id: room.id,
          name: room.room_number || room.name,
          category_id: room.category_id,
          category_name: room.category?.name,
          price_hourly: room.category?.price_hourly,
          price_daily: room.category?.price_daily,
          price_overnight: room.category?.price_overnight,
          status: room.status as RoomStatus,
          updated_at: room.updated_at,
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
            total_amount: booking.total_amount || 0,
            prepayment: booking.prepayment || 0,
            status: booking.status,
            duration_text: booking.duration_text,
            parent_booking_id: booking.parent_booking_id,
            is_group_member: !!booking.parent_booking_id
          };

          // Check Group Master Logic
          const groupMembers = activeBookings.filter((b: any) => b.parent_booking_id === booking.id);
          if (groupMembers.length > 0) {
            dashboardRoom.is_group_master = true;
            dashboardRoom.group_count = groupMembers.length;
          }

          // Check Group Member Logic to find Master Name
          if (dashboardRoom.current_booking.is_group_member && dashboardRoom.current_booking.parent_booking_id) {
             const masterBooking = activeBookings.find(b => b.id === dashboardRoom.current_booking?.parent_booking_id);
             if (masterBooking) {
                const masterRoom = roomsData.find((r: any) => r.id === masterBooking.room_id);
                if (masterRoom) {
                   dashboardRoom.current_booking.master_room_name = masterRoom.room_number || masterRoom.name;
                }
             }
          }
          
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

      const roomsWithGroupColors = mergedRooms.map(room => {
        if (room.is_group_master && room.current_booking?.id) {
          const masterId = room.current_booking.id;
          let assignedColor: string;

          if (!masterBookingIdToColorMapRef.current.has(masterId)) {
            // Gán màu mới nếu chưa có
            if (colorIndexRef.current < predefinedGroupColors.length) {
              assignedColor = predefinedGroupColors[colorIndexRef.current];
            } else {
              assignedColor = getRandomColor();
            }
            masterBookingIdToColorMapRef.current.set(masterId, assignedColor);
            usedColorsRef.current.add(assignedColor);
            colorIndexRef.current++;
          } else {
            // Sử dụng màu đã có
            assignedColor = masterBookingIdToColorMapRef.current.get(masterId)!;
          }
          room.group_color = assignedColor;

        } else if (room.current_booking?.is_group_member && room.current_booking.parent_booking_id) {
          const masterId = room.current_booking.parent_booking_id;
          // Nếu master đã có màu, sử dụng màu đó. Nếu không, gán một màu (fallback, không nên xảy ra nếu master được xử lý trước)
          if (!masterBookingIdToColorMapRef.current.has(masterId)) {
            let assignedColor: string;
            if (colorIndexRef.current < predefinedGroupColors.length) {
              assignedColor = predefinedGroupColors[colorIndexRef.current];
            } else {
              assignedColor = getRandomColor();
            }
            masterBookingIdToColorMapRef.current.set(masterId, assignedColor);
            usedColorsRef.current.add(assignedColor);
            colorIndexRef.current++;
          }
          room.group_color = masterBookingIdToColorMapRef.current.get(masterId);
        }
        return room;
      });

      setRooms(roomsWithGroupColors);

    } catch (error) {
      console.error('Error fetching dashboard data:', JSON.stringify(error, null, 2));
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [can, getRandomColor]); // Thêm can và getRandomColor vào dependency array

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
            // fetchData(); // Removed direct call, rely on real-time
        } else {
            // Only show error if it's not "already cancelled" (optional, but for now show all)
            toast.error("Lỗi tự động hủy: " + result.message);
        }
    } catch (e: any) {
        console.error("Auto-finalize error", e);
        toast.error("Lỗi hệ thống khi tự động hủy: " + e.message);
    }
  };

  useEffect(() => {
    if (!isAuthLoading && can(PERMISSION_KEYS.VIEW_DASHBOARD)) {
      fetchData();
    }
  }, [isAuthLoading, can]);

  // Real-time Subscription
  useEffect(() => {
    // Consolidated Subscription
    if (isAuthLoading || !can(PERMISSION_KEYS.VIEW_DASHBOARD)) return;

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
      .subscribe((status) => {
        console.log("Realtime subscription status:", status);
        if (status === 'SUBSCRIBED') {
            toast.success("Đã kết nối thời gian thực");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthLoading, can]);

  // Filtering Logic
  const filteredRooms = useMemo(() => {
    const result = rooms.filter(room => {
      if (room.status === 'available') return filters.available;
      if (room.status === 'dirty') return filters.dirty;
      if (room.status === 'repair') return filters.repair;
      if (room.status === 'occupied') {
         const isHourly = room.current_booking?.booking_type === 'hourly';
         return isHourly ? filters.hourly : filters.daily;
      }
      return false; // Should not happen if all statuses covered
    });
    return result;
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

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (!can(PERMISSION_KEYS.VIEW_DASHBOARD)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <ShieldCheck size={48} className="mx-auto text-slate-300 mb-4" />
          <h1 className="text-xl font-bold text-slate-700">Không có quyền truy cập</h1>
          <p className="text-slate-500">Vui lòng liên hệ quản lý.</p>
        </div>
      </div>
    );
  }

  const handleToggleFilter = (key: keyof FilterState) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Handle Room Click
  const handleRoomClick = (room: DashboardRoom) => {
    // If dirty, directly ask to mark as clean
    if (room.status === 'dirty') {
      handleMarkRoomAsClean(room);
      return;
    }
    
    // If repair, show simple options or modal
    if (room.status === 'repair') {
      setSelectedRoomForStatus(room);
      setInitialStatusForModal(room.status);
      setIsStatusModalOpen(true);
      return;
    }
    
    // If occupied, open Folio
    if (room.status === 'occupied') {
      if (!room.current_booking) {
        toast.error('Không tìm thấy thông tin đặt phòng. Đang cập nhật lại dữ liệu...');
        fetchData();
        return;
      }
      setSelectedRoomId(room.id);
      setIsFolioOpen(true);
      return;
    }

    // If available, open CheckIn
    setSelectedRoomId(room.id);
    setIsCheckInOpen(true);
  };

  const handleMarkRoomAsClean = async (room: DashboardRoom) => {
    const confirmed = await confirmDialog({
      title: 'Xác nhận dọn phòng',
      message: `Bạn có chắc chắn muốn đánh dấu phòng ${room.name} là đã dọn xong và sẵn sàng?`,
      type: 'info'
    });

    if (confirmed) {
      try {
        await updateRoomStatus(room.id, 'available');
        toast.success(`Phòng ${room.name} đã sẵn sàng.`);
        // fetchData(); // Removed direct call, rely on real-time
      } catch (e) {
        console.error('Error marking room as clean:', e);
        toast.error('Lỗi khi đánh dấu phòng đã dọn xong.');
      }
    }
  };

  const handleStatusChangeRequest = (room: DashboardRoom, status: RoomStatus) => {
    setSelectedRoomForStatus(room);
    setInitialStatusForModal(status);
    setIsStatusModalOpen(true);
  };

  const updateRoomStatus = async (roomId: string, newStatus: RoomStatus, note?: string) => {
    try {
      const updates: any = { 
        status: newStatus, 
        updated_at: new Date().toISOString() 
      };
      
      // Auto-clear notes when switching to Available
      if (newStatus === 'available') {
        updates.notes = null;
      } else if (note !== undefined) {
        updates.notes = note;
      }
      
      await supabase.from('rooms').update(updates).eq('id', roomId);
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
        custom_price_reason: bookingData.custom_price_reason,
        verifiedStaff: user ? { id: user.id, name: user.full_name } : undefined
      });

      toast.success('Nhận phòng thành công');
      setIsCheckInOpen(false);
      // fetchData(); // Removed direct call, rely on real-time
    } catch (error: any) {
      console.error('Check-in error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      await alertDialog({
        title: 'Lỗi nhận phòng',
        message: error.message || 'Lỗi không xác định',
        type: 'error'
      });
    }
  };

  const handleOpenStatusModal = (room: DashboardRoom) => {
    setIsCheckInOpen(false);
    setSelectedRoomForStatus(room);
    setInitialStatusForModal(room.status);
    setIsStatusModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB] p-1 md:p-8 pb-32">
      <div className="max-w-[1600px] mx-auto">
        <DashboardHeader 
          counts={counts}
          filters={filters}
          onToggle={handleToggleFilter}
        />

        {/* Room Grid */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto bg-[#F8F9FB] custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 md:gap-6 pb-20">
               {filteredRooms.map((room) => (
                 <RoomCard 
                   key={room.id} 
                   room={room} 
                   onClick={handleRoomClick}
                 />
               ))}
             </div>
          )}
        </div>

        {/* Modals */}
        {selectedRoom && (
          <>
            <CheckInModal
              isOpen={isCheckInOpen}
              onClose={() => setIsCheckInOpen(false)}
              room={selectedRoom}
              onCheckIn={handleCheckIn}
              onOpenStatusModal={() => handleOpenStatusModal(selectedRoom!)}
            />
            
              <RoomFolioModal
              isOpen={isFolioOpen}
              onClose={() => setIsFolioOpen(false)}
              onUpdate={() => {}}
              room={selectedRoom}
              booking={selectedRoom.current_booking!}
              onGroupRoom={() => {
                setIsFolioOpen(false);
                setIsGroupModalOpen(true);
              }}
            />

            <GroupRoomModal
              isOpen={isGroupModalOpen}
              onClose={() => setIsGroupModalOpen(false)}
              masterRoom={selectedRoom}
              onSuccess={() => {}}
              rooms={rooms} // Truyền danh sách rooms vào GroupRoomModal
            />
          </>
        )}

        <RoomStatusModal
          isOpen={isStatusModalOpen}
          onClose={() => setIsStatusModalOpen(false)}
          room={selectedRoomForStatus}
          initialStatus={initialStatusForModal}
          onUpdateStatus={updateRoomStatus}
        />
      </div>

    </div>
  );
}
