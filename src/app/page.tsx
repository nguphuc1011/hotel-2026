'use client';

import { useState, useMemo } from 'react';
import { useHotel } from '@/hooks/useHotel';
import { EventService } from '@/services/events';
import { RoomCard } from '@/components/dashboard/RoomCard';
import { CheckInModal } from '@/components/dashboard/CheckInModal';
import FolioModal from '@/components/dashboard/FolioModal';
import CustomerInsightsModal from '@/components/dashboard/CustomerInsightsModal';
import { Room, Customer, Booking, Setting } from '@/types';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useNotification } from '@/context/NotificationContext';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { HotelService } from '@/services/hotel';
import { ShoppingCart, Plus } from 'lucide-react';
import { QuickSaleModal } from '@/components/dashboard/QuickSaleModal';

import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { Check, AlertTriangle } from 'lucide-react';

export default function Dashboard() {
  const { rooms, settings, services, isLoading, mutateRooms } = useHotel();
  const { showNotification } = useNotification();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [folioRoomId, setFolioRoomId] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isQuickSaleOpen, setIsQuickSaleOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );
  const folioRoom = useMemo(
    () => rooms.find((r) => r.id === folioRoomId) || null,
    [rooms, folioRoomId]
  );
  const [activeFilterIds, setActiveFilterIds] = useState<string[]>([
    'available',
    'hourly',
    'daily',
    'dirty',
    'repair',
  ]);
  const [customerInsightsData, setCustomerInsightsData] = useState<{
    customer: Customer;
    bookings: Booking[];
  } | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: (inputValue?: string) => void;
    variant?: 'danger' | 'info';
    confirmText?: string;
    cancelText?: string;
    showInput?: boolean;
    inputPlaceholder?: string;
    inputRequired?: boolean;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const systemSettings = settings?.find((s: Setting) => s.key === 'system_settings')?.value;
  const timeRules = systemSettings
    ? {
        check_in: systemSettings.check_in || '14:00',
        check_out: systemSettings.check_out || '12:00',
        overnight: systemSettings.overnight || { start: '22:00', end: '08:00' },
        early_rules: systemSettings.early_rules || [],
        late_rules: systemSettings.late_rules || [],
        full_day_early_before: systemSettings.full_day_early_before || '05:00',
        full_day_late_after: systemSettings.full_day_late_after || '18:00',
      }
    : {
        check_in: '14:00',
        check_out: '12:00',
        overnight: { start: '22:00', end: '08:00' },
        early_rules: [],
        late_rules: [],
        full_day_early_before: '05:00',
        full_day_late_after: '18:00',
      };

  const roomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rooms.forEach((room) => {
      counts[room.status] = (counts[room.status] || 0) + 1;
    });
    return counts;
  }, [rooms]);

  const onToggleFilter = (id: string) => {
    setActiveFilterIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const filteredRooms = rooms.filter((room) => {
    if (room.status === 'overnight') return activeFilterIds.includes('daily');
    return activeFilterIds.includes(room.status);
  });

  const handleRoomClick = (room: Room) => {
    // 1. Nếu phòng đang có khách (có booking active) -> Mở Folio (Chi tiết thanh toán)
    if (room.current_booking) {
      setFolioRoomId(room.id);
      setSelectedRoomId(null);
      return;
    }

    // 2. Nếu phòng đang dơ (dirty) -> Hỏi xác nhận dọn xong
    if (room.status === 'dirty') {
      setConfirmConfig({
        isOpen: true,
        title: 'Xác nhận dọn phòng',
        description: `Phòng ${room.room_number} đã dọn dẹp xong và sẵn sàng đón khách?`,
        confirmText: 'ĐÃ DỌN XONG',
        cancelText: 'QUAY LẠI',
        variant: 'info',
        onConfirm: async () => {
          try {
            const { error } = await supabase
              .from('rooms')
              .update({
                status: 'available',
                current_booking_id: null,
                last_status_change: null,
              })
              .eq('id', room.id);

            if (error) throw error;
            mutateRooms();
            setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
            showNotification(`Phòng ${room.room_number} đã sẵn sàng!`, 'success');
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Lỗi cập nhật trạng thái:', error);
            showNotification('Không thể cập nhật trạng thái phòng', 'error');
          }
        },
      });
      return;
    }

    // 3. Nếu phòng đang sửa chữa (repair)
    if (room.status === 'repair') {
      showNotification(`Phòng ${room.room_number} đang sửa chữa, không thể nhận khách.`, 'warning');
      return;
    }

    // 4. Các trường hợp còn lại (mặc định là Available) -> Mở Check-in
    setSelectedRoomId(room.id);
    setFolioRoomId(null);
  };

  const handlePayment = async (
    bookingId: string,
    amount: number,
    paymentMethod: string = 'cash',
    surcharge: number = 0,
    auditNote?: string,
    actualPaid?: number
  ) => {
    if (!folioRoom) return;

    try {
      // eslint-disable-next-line no-console
      console.log('Bắt đầu thanh toán cho phòng:', folioRoom.room_number, {
        bookingId,
        amount,
        paymentMethod,
        surcharge,
        actualPaid
      });

      // 1. Lấy ghi chú hiện tại để nối thêm audit info
      const { data: currentBooking } = await supabase
        .from('bookings')
        .select('notes')
        .eq('id', bookingId)
        .single();

      const updatedNotes = [currentBooking?.notes, auditNote ? `[THANH TOÁN] ${auditNote}` : '']
        .filter(Boolean)
        .join('\n');

      // 3. Gọi RPC xử lý thanh toán thông qua HotelService (Atomic)
      const normalizedPaymentMethod = paymentMethod === 'transfer' ? 'BANK_TRANSFER' : (paymentMethod || 'CASH').toUpperCase();

      const result = await HotelService.checkOut({
        bookingId,
        roomId: folioRoom.id,
        totalAmount: Number(amount) || 0,
        paymentMethod: normalizedPaymentMethod,
        surcharge: Number(surcharge) || 0,
        amountPaid: actualPaid !== undefined ? Number(actualPaid) : Number(amount),
        notes: currentBooking?.notes || '',
        auditNote: auditNote
      });

      // eslint-disable-next-line no-console
      console.log('Thanh toán hoàn tất qua RPC, kết quả:', result);

      // 4. Reset state, refresh data, and show notification
      setFolioRoomId(null);
      await mutateRooms();
      
      const newBalance = result.new_balance;
      
      // Hiển thị thông báo dựa trên số dư mới nhất từ Database
      if (newBalance < 0) {
        toast.warning(`Đã trả phòng ${folioRoom.room_number}. Tổng dư nợ khách hàng: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Math.abs(newBalance))}`, {
          description: "Số dư đã được cập nhật từ Database",
          duration: 6000,
          icon: <AlertTriangle className="text-rose-500" />
        });
      } else {
        toast.success(`Trả phòng ${folioRoom.room_number} thành công!`, {
          icon: <Check className="text-emerald-500" />,
          duration: 4000
        });
      }

      // 5. Gửi thông báo hệ thống (Mắt Thần)
      HotelService.notifySystemChange('check_out', folioRoom.id).catch(console.error);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Lỗi trong quá trình thanh toán:', error);
      showNotification(`Lỗi thanh toán: ${error.message}`, 'error');
    }
  };

  const _handleMerge = async (
    sourceBookingId: string,
    targetRoomId: string,
    breakdown: PricingBreakdown
  ) => {
    const sourceRoom = rooms.find((r) => r.current_booking?.id === sourceBookingId);
    const targetRoom = rooms.find((r) => r.id === targetRoomId);

    if (!sourceRoom || !targetRoom || !targetRoom.current_booking) {
      showNotification('Không tìm thấy thông tin phòng để gộp', 'error');
      return;
    }

    try {
      // 1. Chuẩn bị dữ liệu gộp
      const mergeData = {
        booking_id: sourceBookingId,
        room_number: sourceRoom.room_number,
        amount: breakdown.total_amount,
        details: breakdown,
        merged_at: new Date().toISOString(),
      };

      // 2. Cập nhật phòng đích (thêm vào merged_bookings)
      const currentMerged = targetRoom.current_booking.merged_bookings || [];
      const { error: targetError } = await supabase
        .from('bookings')
        .update({
          merged_bookings: [...currentMerged, mergeData],
        })
        .eq('id', targetRoom.current_booking.id);

      if (targetError) throw targetError;

      // 3. Hoàn tất booking nguồn (đã gộp)
      const { error: sourceError } = await supabase
        .from('bookings')
        .update({
          status: 'completed',
          check_out_at: new Date().toISOString(),
          final_amount: 0, // Đã gộp vào phòng khác
          notes:
            (sourceRoom.current_booking.notes || '') +
            `\n[Đã gộp vào phòng ${targetRoom.room_number}]`,
        })
        .eq('id', sourceBookingId);

      if (sourceError) throw sourceError;

      // 4. Chuyển trạng thái phòng nguồn sang 'dirty'
      const { error: roomError } = await supabase
        .from('rooms')
        .update({
          status: 'dirty',
          current_booking_id: null,
        })
        .eq('id', sourceRoom.id);

      if (roomError) throw roomError;

      // 5. Kết thúc
      setFolioRoomId(null);
      await mutateRooms();
      showNotification(
        `Đã gộp hóa đơn phòng ${sourceRoom.room_number} vào phòng ${targetRoom.room_number}`,
        'success'
      );
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Lỗi khi gộp hóa đơn:', error);
      showNotification(`Lỗi gộp hóa đơn: ${error.message}`, 'error');
    }
  };

  const handleCancel = async () => {
    if (!folioRoom) return;

    setConfirmConfig({
      isOpen: true,
      title: 'Xác nhận hủy phòng',
      description: `Bạn có chắc chắn muốn hủy đặt phòng ${folioRoom.room_number}? Mọi dữ liệu phiên này sẽ bị xóa và phòng sẽ chuyển sang trạng thái CHỜ DỌN.`,
      variant: 'danger',
      showInput: true,
      inputPlaceholder: 'Lý do hủy phòng...',
      inputRequired: true,
      onConfirm: async (reason) => {
        try {
          const bookingId = folioRoom.current_booking_id || folioRoom.current_booking?.id;

          // 1. Update booking to 'cancelled' with reason
          if (bookingId) {
            // Get current notes
            const { data: currentBooking } = await supabase
              .from('bookings')
              .select('notes')
              .eq('id', bookingId)
              .single();

            const updatedNotes = [currentBooking?.notes, `[HỦY PHÒNG] Lý do: ${reason}`]
              .filter(Boolean)
              .join('\n');

            const { error: bookingError } = await supabase
              .from('bookings')
              .update({
                status: 'cancelled',
                check_out_at: new Date().toISOString(),
                notes: updatedNotes,
              })
              .eq('id', bookingId);

            if (bookingError) throw bookingError;

            // 1b. Ghi log sự kiện (Móng ngầm)
            await EventService.emit({
              type: 'BOOKING_CANCEL',
              entity_type: 'booking',
              entity_id: bookingId,
              action: 'Hủy đặt phòng',
              reason: reason,
              severity: 'danger',
            });
          }

          // 2. Set room status to 'dirty'
          const { error: roomError } = await supabase
            .from('rooms')
            .update({
              status: 'dirty',
              current_booking_id: null,
              last_status_change: new Date().toISOString(),
            })
            .eq('id', folioRoom.id);

          if (roomError) throw roomError;

          // 3. Reset state and show notification
          setFolioRoomId(null);
          await mutateRooms();
          setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
          showNotification(`Đã hủy phòng ${folioRoom.room_number} thành công!`, 'success');
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Lỗi khi hủy phòng:', error);
          showNotification('Lỗi khi hủy phòng', 'error');
        }
      },
    });
  };

  const handleCheckIn = async (data: CheckInData) => {
    console.log('page.tsx: handleCheckIn called with data:', data);
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      if (!selectedRoom) {
        console.warn('page.tsx: handleCheckIn aborted because selectedRoom is null');
        setIsProcessing(false);
        return;
      }

      // 1. Thực hiện Check-in Atomic qua RPC
      const booking = await HotelService.checkIn({
        roomId: selectedRoom.id,
        customer: {
          id: data.customer?.id,
          name: data.customer?.name || 'Khách vãng lai',
          phone: data.customer?.phone,
          idCard: data.customer?.idCard,
          address: data.customer?.address,
        },
        rentalType: data.rentalType,
        price: data.price,
        deposit: data.deposit,
        depositMethod: data.depositMethod,
        notes: data.notes,
        services: data.services.map(s => ({
          service_id: s.service_id || s.id,
          quantity: s.quantity,
          price: s.price
        })),
        allServices: services,
      });

      // 2. Fetch Customer Insights (Optional UI feature)
      if (booking && booking.customer_id) {
        const { data: fullCustomer } = await supabase
          .from('customers')
          .select('*')
          .eq('id', booking.customer_id)
          .single();
        
        const { data: customerBookings } = await supabase
          .from('bookings')
          .select('*, rooms(room_number)')
          .eq('customer_id', booking.customer_id)
          .eq('status', 'completed')
          .order('check_out_at', { ascending: false })
          .limit(1);

        if (fullCustomer && fullCustomer.full_name !== 'Khách vãng lai') {
          setCustomerInsightsData({ customer: fullCustomer, bookings: customerBookings || [] });
        }
      }

      // 3. Kết thúc quy trình
      setSelectedRoomId(null);
      await mutateRooms();
      
      toast.success(`Nhận phòng ${selectedRoom.room_number} thành công!`, {
        icon: <Check className="text-emerald-500" />,
        duration: 4000
      });

      // 4. Thông báo hệ thống
      HotelService.notifySystemChange('check_in', selectedRoom.id).catch(console.error);
    } catch (error: any) {
      console.error('Lỗi Check-in:', error);
      showNotification(`Lỗi khi nhận phòng: ${error.message || 'Lỗi không xác định'}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };
  const triggerNightAudit = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase.rpc('night_audit', { p_audit_date: today });
      if (error) throw error;
      await mutateRooms();
      showNotification(`Đã chốt doanh thu ngày ${today}: ${data?.charges_created || 0} phòng`, 'success');
    } catch (err: any) {
      showNotification(`Lỗi Night Audit: ${err.message}`, 'error');
    }
  };

  const seedRooms = async () => {
    if (rooms.length > 0) {
      setConfirmConfig({
        isOpen: true,
        title: 'Nạp lại dữ liệu?',
        description:
          'Bạn có chắc chắn muốn nạp lại dữ liệu mẫu? Hành động này sẽ cập nhật lại giá và thông tin cho các phòng hiện có.',
        variant: 'danger',
        onConfirm: () => {
          setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
          executeSeed();
        },
      });
      return;
    }
    executeSeed();
  };

  const executeSeed = async () => {
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
            daily: 250000,
          },
          enable_overnight: true,
        };
      });

      const { error } = await supabase
        .from('rooms')
        .upsert(sampleRooms, { onConflict: 'room_number' });
      if (error) throw error;

      mutateRooms();
      showNotification('Đã khởi tạo 12 phòng mẫu thành công!', 'success');
    } catch (error: unknown) {
      const err = error as any;
      // eslint-disable-next-line no-console
      console.error('Seed error:', err);
      showNotification(`Lỗi khởi tạo: ${err.message}`, 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white/80 backdrop-blur-sm fixed inset-0 z-[200]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent shadow-lg" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">
            Đang tải dữ liệu...
          </p>
        </div>
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
    <div className="space-y-4 pb-20">
      {' '}
      {/* Add padding bottom for mobile scroll */}
      <DashboardHeader
        roomCounts={roomCounts}
        activeFilterIds={activeFilterIds}
        onToggleFilter={onToggleFilter}
        hotelName="Hotel 2026"
      />
      <div className="flex justify-end px-2">
        <button
          onClick={triggerNightAudit}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-widest active:scale-[0.98] transition-all"
        >
          Chốt doanh thu ngay
        </button>
      </div>
      <motion.div
        layout
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 pt-0"
      >
        <AnimatePresence mode="popLayout">
          {filteredRooms.map((room) => (
            <motion.div
              layout
              key={`${room.id}-${room.status}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            >
              <RoomCard room={room} settings={settings} onClick={handleRoomClick} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      <CheckInModal
        room={selectedRoom}
        services={services}
        timeRules={timeRules}
        isOpen={!!selectedRoomId}
        isProcessing={isProcessing}
        onClose={() => setSelectedRoomId(null)}
        onConfirm={handleCheckIn}
      />
      <FolioModal
        isOpen={!!folioRoomId}
        onClose={() => setFolioRoomId(null)}
        room={folioRoom}
        settings={settings}
        services={services}
        onPayment={handlePayment}
        onUpdate={mutateRooms}
        onCancel={handleCancel}
        isAdmin={true}
      />
      {customerInsightsData && (
        <CustomerInsightsModal
          customer={customerInsightsData.customer}
          bookings={customerInsightsData.bookings}
          onClose={() => setCustomerInsightsData(null)}
        />
      )}
      <ConfirmDialog
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        description={confirmConfig.description}
        confirmText={confirmConfig.confirmText}
        cancelText={confirmConfig.cancelText}
        variant={confirmConfig.variant}
        showInput={confirmConfig.showInput}
        inputPlaceholder={confirmConfig.inputPlaceholder}
        inputRequired={confirmConfig.inputRequired}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Floating Action Button for Quick Sale */}
      <div className="fixed bottom-32 right-8 z-[90]">
        <button
          onClick={() => setIsQuickSaleOpen(true)}
          className="w-16 h-16 rounded-full bg-blue-600 text-white shadow-2xl flex items-center justify-center hover:bg-blue-700 hover:scale-110 active:scale-95 transition-all group"
        >
          <ShoppingCart size={28} />
          <span className="absolute right-full mr-4 px-3 py-1 bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Bán lẻ tại quầy
          </span>
        </button>
      </div>

      <QuickSaleModal
        isOpen={isQuickSaleOpen}
        onClose={() => setIsQuickSaleOpen(false)}
        services={services}
      />
    </div>
  );
}

{
  /* Force Update 19:15 */
}
{
  /* Trigger Build Again */
}
