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
import { useAuthStore } from '@/stores/authStore';
import { PERMISSION_KEYS } from '@/services/permissionService';
import { ShieldCheck } from 'lucide-react';

// --- Group Color Constants ---
const PREDEFINED_GROUP_COLORS = [
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

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
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
  // Hàm trợ giúp để tạo màu hex ngẫu nhiên
  const getRandomColor = useCallback(() => {
    let color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    // Đảm bảo màu được tạo không bị trùng với các màu đã sử dụng hoặc màu định nghĩa trước
    while (usedColorsRef.current.has(color) || PREDEFINED_GROUP_COLORS.includes(color)) {
      color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    }
    return color;
  }, []); // Dependencies stable

  const [settings, setSettings] = useState<any>(null);

  // Fetch Dashboard Data
  const fetchData = useCallback(async (isSilent = false) => {
    if (!can(PERMISSION_KEYS.VIEW_DASHBOARD)) return;

    try {
      // Only show full-screen loader if we have no rooms yet (initial load)
      // Use functional state check to avoid rooms dependency
      setLoading(prevLoading => {
        if (!isSilent && rooms.length === 0) return true;
        return prevLoading;
      });
      
      console.log(`[Dashboard] Fetching data (isSilent: ${isSilent}) at ${new Date().toLocaleTimeString()}`);
      
      // 1. Fetch Dashboard Data & Settings in parallel
      const [unifiedResult, settingsResult] = await Promise.all([
        supabase.rpc('fn_get_dashboard_data'),
        supabase.rpc('get_system_settings')
      ]);

      if (unifiedResult.error) throw unifiedResult.error;
      
      if (unifiedResult.data) {
        const { rooms: roomsData, bookings: bookingsData, rates: ratesData, wallets: walletsData } = unifiedResult.data;
        
        // 2. Update Settings only if changed
        const newSettings = settingsResult.data || null;
        setSettings((prev: any) => {
          if (JSON.stringify(prev) === JSON.stringify(newSettings)) return prev;
          return newSettings;
        });

        // Reset color maps
        masterBookingIdToColorMapRef.current.clear();
        usedColorsRef.current.clear();
        colorIndexRef.current = 0;

        const ratesByBookingId = new Map<string, any>(
          ratesData.map((r: any) => [r.booking_id, r])
        );

        const processedBookings = bookingsData.map((b: any) => {
          const rate = ratesByBookingId.get(b.id);
          const total_amount = rate?.total_amount ?? b.total_amount ?? 0;
          return {
            ...b,
            total_amount: total_amount,
            amount_to_pay: total_amount - (b.deposit_amount || 0),
            customer_balance: b.customer?.balance || 0,
            check_in_at: rate?.check_in_at ?? b.check_in_actual,
            duration_text: rate?.duration_text,
            pricing_ladder: rate?.pricing_ladder,
            service_total: rate?.service_total ?? 0,
            surcharge_amount: rate?.surcharge_amount ?? 0,
            extra_person_charge: rate?.extra_person_charge ?? 0, // THÊM EXTRA PERSON
            discount_amount: rate?.discount_amount ?? 0, // THÊM DISCOUNT
            custom_surcharge: rate?.custom_surcharge ?? 0, // THÊM CUSTOM SURCHARGE
            explanation: rate?.explanation // THÊM GIẢI THÍCH
          };
        });

        // Merge Data
        const mergedRooms: DashboardRoom[] = roomsData.map((room: any) => {
          const booking = processedBookings.find((b: any) => b.room_id === room.id);

          let dashboardRoom: DashboardRoom = {
            id: room.id,
            name: room.room_number || room.name,
            category_id: room.category_id,
            category_name: room.category?.name,
            price_hourly: room.category?.price_hourly,
            price_next_hour: room.category?.price_next_hour, // THÊM PRICENEXTHOUR
            price_daily: room.category?.price_daily,
            price_overnight: room.category?.price_overnight,
            base_hourly_limit: room.category?.base_hourly_limit,
            hourly_unit: room.category?.hourly_unit,
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
              booking_type: booking.rental_type,
              total_amount: booking.total_amount || 0,
              amount_to_pay: booking.amount_to_pay || 0,
              deposit_amount: booking.deposit_amount || 0, // THÊM DEPOSIT
              status: booking.status,
              duration_text: booking.duration_text,
              parent_booking_id: booking.parent_booking_id,
              is_group_member: !!booking.parent_booking_id,
              pricing_ladder: booking.pricing_ladder,
              service_total: booking.service_total || 0,
              surcharge_amount: booking.surcharge_amount || 0,
              extra_person_charge: booking.extra_person_charge || 0, // THÊM EXTRA PERSON
              discount_amount: booking.discount_amount || 0, // THÊM DISCOUNT
              custom_surcharge: booking.custom_surcharge || 0, // THÊM CUSTOM SURCHARGE
              explanation: booking.explanation // THÊM GIẢI THÍCH
            };

            // Check Group Master Logic
            const groupMembers = processedBookings.filter((b: any) => b.parent_booking_id === booking.id);
            if (groupMembers.length > 0) {
              dashboardRoom.is_group_master = true;
              dashboardRoom.group_count = groupMembers.length;
            }

            // Check Group Member Logic to find Master Name
            if (dashboardRoom.current_booking.is_group_member && dashboardRoom.current_booking.parent_booking_id) {
               const masterBooking = processedBookings.find((b: any) => b.id === dashboardRoom.current_booking?.parent_booking_id);
               if (masterBooking) {
                  const masterRoom = roomsData.find((r: any) => r.id === masterBooking.room_id);
                  if (masterRoom) {
                     dashboardRoom.current_booking.master_room_name = masterRoom.room_number || masterRoom.name;
                  }
               }
            }
            
            if (dashboardRoom.status === 'available') {
               dashboardRoom.status = 'occupied';
            }
          }

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
              if (colorIndexRef.current < PREDEFINED_GROUP_COLORS.length) {
                assignedColor = PREDEFINED_GROUP_COLORS[colorIndexRef.current];
              } else {
                assignedColor = getRandomColor();
              }
              masterBookingIdToColorMapRef.current.set(masterId, assignedColor);
              usedColorsRef.current.add(assignedColor);
              colorIndexRef.current++;
            } else {
              assignedColor = masterBookingIdToColorMapRef.current.get(masterId)!;
            }
            room.group_color = assignedColor;

          } else if (room.current_booking?.is_group_member && room.current_booking.parent_booking_id) {
            const masterId = room.current_booking.parent_booking_id;
            if (!masterBookingIdToColorMapRef.current.has(masterId)) {
              let assignedColor: string;
              if (colorIndexRef.current < PREDEFINED_GROUP_COLORS.length) {
                assignedColor = PREDEFINED_GROUP_COLORS[colorIndexRef.current];
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
        setWallets(walletsData || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [can, getRandomColor]); // Remove rooms.length dependency

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
            fetchData(); // Khôi phục gọi trực tiếp
        } else {
            // Only show error if it's not "already cancelled" (optional, but for now show all)
            toast.error("Lỗi tự động hủy: " + result.message);
        }
    } catch (e: any) {
        console.error("Auto-finalize error", e);
        toast.error("Lỗi hệ thống khi tự động hủy: " + e.message);
    }
  };

  // Initial Load
  useEffect(() => {
    if (can(PERMISSION_KEYS.VIEW_DASHBOARD)) {
      fetchData();
    }
  }, [can]); // Only re-run when permission changes, NOT when fetchData changes

  // Smart Update Logic based on User Requirements
  useEffect(() => {
    if (isAuthLoading || !can(PERMISSION_KEYS.VIEW_DASHBOARD) || !settings) return;

    // 1. Function to calculate next update times for all active rooms
    const getNextUpdateTimes = () => {
      const times: number[] = [];
      const now = new Date();
      const nowMs = now.getTime();
      const config = settings; 

      rooms.forEach(room => {
        if (room.status !== 'occupied' || !room.current_booking) return;
        
        const checkIn = new Date(room.current_booking.check_in_at);
        const bookingType = room.current_booking.booking_type;
        
        // SaaS Logic: Prefer category-specific settings (from room object), fallback to global config
        const graceMinutes = config.grace_minutes || 0;
        const graceOutEnabled = config.grace_out_enabled;

        if (bookingType === 'hourly') {
          // Use values from the room (which came from its category)
          const baseHours = room.base_hourly_limit || config.base_hourly_limit || 1;
          const hourlyUnit = room.hourly_unit || config.hourly_unit || 60;
          
          // Mốc 1: Hết block đầu + ân hạn
          const firstMarkMs = checkIn.getTime() + (baseHours * 60 + (graceOutEnabled ? graceMinutes : 0)) * 60000;
          if (firstMarkMs > nowMs) times.push(firstMarkMs);

          // Mốc tiếp theo: Mỗi block tiếp theo + ân hạn (tối đa 12 block tiếp theo để bao phủ 1 ngày)
          for (let i = 1; i <= 12; i++) {
            const nextMarkMs = checkIn.getTime() + (baseHours * 60 + i * hourlyUnit + (graceOutEnabled ? graceMinutes : 0)) * 60000;
            if (nextMarkMs > nowMs) {
              times.push(nextMarkMs);
              break; 
            }
          }

          // Mốc chuyển Qua đêm (nếu có auto-switch)
          if (config.auto_overnight_switch && config.overnight_start_time) {
            const [h, m] = config.overnight_start_time.split(':').map(Number);
            const overnightStart = new Date();
            overnightStart.setHours(h, m, 0, 0);
            if (overnightStart.getTime() > nowMs) times.push(overnightStart.getTime());
          }
        } else {
          // Daily / Overnight Logic
          const isOvernight = bookingType === 'overnight';
          // Dùng mốc trả phòng từ cài đặt (SaaS dynamic)
          const targetTimeStr = isOvernight ? (config.overnight_checkout_time || config.check_out_time) : config.check_out_time;
          const lateCutoffStr = config.full_day_late_after; 
          
          if (targetTimeStr) {
            const [h, m] = targetTimeStr.split(':').map(Number);
            const checkOutMark = new Date();
            checkOutMark.setHours(h, m, 0, 0);
            
            // Mốc 1: Giờ trả phòng + ân hạn (Bắt đầu tính phụ thu muộn)
            const lateStartMs = checkOutMark.getTime() + (graceOutEnabled ? graceMinutes : 0) * 60000;
            if (lateStartMs > nowMs) times.push(lateStartMs);
          }

          if (lateCutoffStr) {
            const [h, m] = lateCutoffStr.split(':').map(Number);
            const lateCutoffMark = new Date();
            lateCutoffMark.setHours(h, m, 0, 0);
            
            // Mốc 2: Mốc nhảy thêm 1 ngày tiền phòng (Full Day Late)
            if (lateCutoffMark.getTime() > nowMs) times.push(lateCutoffMark.getTime());
          }

          // Mốc 3: Night Audit (Mốc reset ngày mới/tính thêm ngày nếu ở tiếp)
          if (config.night_audit_time) {
            const [h, m] = config.night_audit_time.split(':').map(Number);
            const auditMark = new Date();
            auditMark.setHours(h, m, 0, 0);
            if (auditMark.getTime() <= nowMs) auditMark.setDate(auditMark.getDate() + 1);
            times.push(auditMark.getTime());
          }
        }
      });

      // Remove duplicates and sort
      return Array.from(new Set(times)).sort((a, b) => a - b);
    };

    const scheduleNextUpdates = () => {
      const nextTimes = getNextUpdateTimes();
      if (nextTimes.length === 0) return;

      const nextTargetMs = nextTimes[0];
      const delayMs = nextTargetMs - new Date().getTime();

      // User's "Safety Surround" logic: Update 2 minutes before, at the mark, and 2 minutes after
      const surroundDelays = [
        delayMs - 120000, // 2 mins before
        delayMs,          // exactly at the mark
        delayMs + 120000  // 2 mins after
      ].filter(d => d > 0);

      const timers = surroundDelays.map(d => {
        return setTimeout(() => {
          console.log(`Smart Update triggered (surround logic) at ${new Date().toLocaleTimeString()}`);
          fetchData(true); // Silent update
        }, d);
      });

      return timers;
    };

    const timers = scheduleNextUpdates();
    
    // Fallback: Still keep a slow polling (e.g. 30 mins) just in case of edge cases
    const fallbackInterval = setInterval(() => {
      console.log("Smart Update: Fallback slow refresh...");
      fetchData();
    }, 30 * 60 * 1000);

    return () => {
      timers?.forEach(clearTimeout);
      clearInterval(fallbackInterval);
    };
  }, [isAuthLoading, can, rooms, settings, fetchData]);

  // Real-time Subscription with Debounced Refresh
  useEffect(() => {
    if (isAuthLoading || !can(PERMISSION_KEYS.VIEW_DASHBOARD)) return;

    let refreshTimeout: NodeJS.Timeout;

    const debouncedFetch = () => {
      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        console.log('Real-time Update triggered at', new Date().toLocaleTimeString());
        fetchData(true); // Silent update
      }, 1000);
    };

    const channel = supabase
      .channel('dashboard_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => debouncedFetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => debouncedFetch())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_services' }, () => debouncedFetch())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log('Real-time: Connected to dashboard_updates');
        }
      });

    return () => {
      clearTimeout(refreshTimeout);
      supabase.removeChannel(channel);
    };
  }, [isAuthLoading, can, fetchData]);

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

  const handleToggleFilter = useCallback((key: keyof FilterState) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Handle Room Click
  const handleRoomClick = useCallback((room: DashboardRoom) => {
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
  }, [fetchData]);

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
        fetchData(); // Khôi phục gọi trực tiếp
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
      fetchData(true); // Khôi phục gọi trực tiếp để UI cập nhật tức thì
    } catch (e) {
      console.error(e);
      toast.error('Lỗi cập nhật trạng thái');
    }
  };

  const handleCheckIn = useCallback(async (bookingData: any) => {
    try {
      console.log('Booking Data received in handleCheckIn:', bookingData);
      
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
        customer_id: customerId || undefined,
        deposit: bookingData.deposit || 0,
        payment_method: bookingData.payment_method || 'cash',
        services: bookingData.services || [],
        customer_name: bookingData.customer_name,
        notes: bookingData.notes,
        extra_adults: bookingData.extra_adults,
        extra_children: bookingData.extra_children,
        custom_price: bookingData.custom_price,
        custom_price_reason: bookingData.custom_price_reason,
        source: bookingData.source || 'direct',
        verifiedStaff: bookingData.verified_by_staff_id ? {
          id: bookingData.verified_by_staff_id,
          name: bookingData.verified_by_staff_name || ''
        } : undefined
      });

      toast.success('Nhận phòng thành công');
      setIsCheckInOpen(false);
      
      // Khôi phục gọi trực tiếp fetchData để UI cập nhật tức thì sau khi Check-in
      // (Bên cạnh cơ chế Real-time để đảm bảo trải nghiệm người dùng tốt nhất)
      fetchData(true); 
    } catch (error: any) {
      // Robust error logging for Next.js 16 / Turbopack
      const detailedError = error instanceof Error 
        ? JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)))
        : error;

      console.error('Check-in error full:', detailedError);
      
      const errorMsg = error?.message || error?.details || (typeof error === 'string' ? error : 'Lỗi không xác định');
      
      await alertDialog({
        title: 'Lỗi nhận phòng',
        message: errorMsg,
        type: 'error'
      });
    }
  }, [fetchData, alertDialog]);

  const handleOpenStatusModal = useCallback((room: DashboardRoom) => {
    setIsCheckInOpen(false);
    setSelectedRoomForStatus(room);
    setInitialStatusForModal(room.status);
    setIsStatusModalOpen(true);
  }, []);

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

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-32">
      <div className="w-full px-0 md:px-8 py-0 md:py-6">
        <DashboardHeader 
          hotelName={settings?.hotel_name}
          counts={counts}
          filters={filters}
          onToggle={handleToggleFilter}
          onRefresh={fetchData}
          loading={loading}
        />

        {/* Room Grid */}
        <div className="w-full px-4 md:px-0 mt-4 md:mt-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-8 4xl:grid-cols-10 gap-4 md:gap-6 pb-20">
               {filteredRooms.map((room) => (
                 <RoomCard 
                   key={room.id} 
                   room={room} 
                   settings={settings}
                   onClick={handleRoomClick}
                   onStatusChange={handleOpenStatusModal}
                 />
               ))}
             </div>
          )}
        </div>

        {/* Modals - Level up from conditional block to avoid unmounting when selectedRoom changes slightly */}
        <CheckInModal
          isOpen={isCheckInOpen}
          onClose={() => setIsCheckInOpen(false)}
          room={selectedRoom!}
          onCheckIn={handleCheckIn}
          onOpenStatusModal={() => handleOpenStatusModal(selectedRoom!)}
        />
        
        <RoomFolioModal
          isOpen={isFolioOpen}
          onClose={() => setIsFolioOpen(false)}
          onUpdate={() => fetchData(true)}
          room={selectedRoom!}
          booking={selectedRoom?.current_booking!}
          onGroupRoom={() => {
            setIsFolioOpen(false);
            setIsGroupModalOpen(true);
          }}
        />

        <GroupRoomModal
          isOpen={isGroupModalOpen}
          onClose={() => setIsGroupModalOpen(false)}
          masterRoom={selectedRoom!}
          onSuccess={() => fetchData()}
          rooms={rooms}
        />

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
