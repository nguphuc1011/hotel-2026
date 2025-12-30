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

export default function Dashboard() {
  const { rooms, settings, customers, services, isLoading, mutateRooms } = useHotel();
  const { showNotification } = useNotification();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [folioRoomId, setFolioRoomId] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  
  const selectedRoom = useMemo(() => rooms.find(r => r.id === selectedRoomId) || null, [rooms, selectedRoomId]);
  const folioRoom = useMemo(() => rooms.find(r => r.id === folioRoomId) || null, [rooms, folioRoomId]);
  const [activeFilterIds, setActiveFilterIds] = useState<string[]>(['available', 'hourly', 'daily', 'dirty', 'repair']);
  const [customerInsightsData, setCustomerInsightsData] = useState<{ customer: Customer, bookings: Booking[] } | null>(null);
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
  const timeRules = systemSettings ? {
    check_in: systemSettings.check_in || '14:00',
    check_out: systemSettings.check_out || '12:00',
    overnight: systemSettings.overnight || { start: '22:00', end: '08:00' },
    early_rules: systemSettings.early_rules || [],
    late_rules: systemSettings.late_rules || [],
    full_day_early_before: systemSettings.full_day_early_before || '05:00',
    full_day_late_after: systemSettings.full_day_late_after || '18:00',
  } : {
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
                last_status_change: null 
              })
              .eq('id', room.id);
            
            if (error) throw error;
            mutateRooms();
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
            showNotification(`Phòng ${room.room_number} đã sẵn sàng!`, 'success');
          } catch (error) {
            console.error('Lỗi cập nhật trạng thái:', error);
            showNotification('Không thể cập nhật trạng thái phòng', 'error');
          }
        }
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

  const handlePayment = async (bookingId: string, amount: number, auditNote?: string) => {
    if (!folioRoom) return;

    try {
      console.log('Bắt đầu thanh toán cho phòng:', folioRoom.room_number);

      // 1. Get current notes to append audit info
      const { data: currentBooking } = await supabase
        .from('bookings')
        .select('notes')
        .eq('id', bookingId)
        .single();

      const updatedNotes = [
        currentBooking?.notes,
        auditNote ? `[THANH TOÁN] ${auditNote}` : ''
      ].filter(Boolean).join('\n');

      // 2. Update booking status, final amount and notes
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .update({
          status: 'completed',
          check_out_at: new Date().toISOString(),
          final_amount: amount,
          notes: updatedNotes,
        })
        .eq('id', bookingId)
        .select('customer_id')
        .single();

      if (bookingError) {
        console.error('Lỗi cập nhật booking:', bookingError);
        throw new Error(bookingError.message);
      }

      // 2. Update customer statistics if available
      if (booking?.customer_id) {
        const { data: customer } = await supabase
          .from('customers')
          .select('visit_count, total_spent')
          .eq('id', booking.customer_id)
          .single();

        if (customer) {
          await supabase
            .from('customers')
            .update({
              visit_count: (customer.visit_count || 0) + 1,
              total_spent: (customer.total_spent || 0) + amount,
            })
            .eq('id', booking.customer_id);
        }
      }

      // 3. Update room status to 'dirty'
      const { error: roomError } = await supabase
        .from('rooms')
        .update({
          status: 'dirty',
          current_booking_id: null,
          last_status_change: new Date().toISOString(),
        })
        .eq('id', folioRoom.id);

      if (roomError) {
        console.error('Lỗi cập nhật trạng thái phòng:', roomError);
        throw new Error(roomError.message);
      }

      // 4. Ghi nhận giao dịch vào bảng Thu Chi (Cashflow)
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const userName = user?.user_metadata?.full_name || user?.email || 'Hệ thống';
        
        // Tìm ID của danh mục "Tiền phòng"
        const { data: categoryData } = await supabase
          .from('cashflow_categories')
          .select('id')
          .eq('name', 'Tiền phòng')
          .eq('type', 'income')
          .single();

        const cashflowData: any = {
          type: 'income',
          category: 'Tiền phòng',
          category_name: 'Tiền phòng',
          content: `Thanh toán phòng ${folioRoom.room_number}`,
          amount: Number(amount),
          payment_method: 'cash',
          created_by: userName,
          created_at: new Date().toISOString(),
          notes: `Booking ID: ${bookingId}`
        };

        // Chỉ thêm category_id nếu tìm thấy UUID hợp lệ
        if (categoryData?.id) {
          cashflowData.category_id = categoryData.id;
        }

        const { error: cashflowError } = await supabase
          .from('cashflow')
          .insert([cashflowData]);

        if (cashflowError) {
          console.error('Lỗi ghi nhận thu chi:', cashflowError);
          showNotification(`Thanh toán thành công nhưng lỗi ghi sổ thu chi: ${cashflowError.message}`, 'error');
        } else {
          console.log('Đã ghi nhận thu chi thành công');
        }
      } catch (cfErr: any) {
        console.error('Lỗi hệ thống khi ghi thu chi:', cfErr);
        showNotification(`Lỗi hệ thống khi ghi thu chi: ${cfErr.message}`, 'error');
      }
      
      console.log('Thanh toán hoàn tất, đang refresh dữ liệu...');

      // 5. Reset state, refresh data, and show notification
      setFolioRoomId(null);
      await mutateRooms();
      showNotification(`Thanh toán phòng ${folioRoom.room_number} thành công!`, 'success');
    } catch (error: any) {
      console.error('Lỗi trong quá trình thanh toán:', error);
      showNotification(`Lỗi thanh toán: ${error.message}`, 'error');
    }
  };

  const handleMerge = async (sourceBookingId: string, targetRoomId: string, breakdown: PricingBreakdown) => {
    const sourceRoom = rooms.find(r => r.current_booking?.id === sourceBookingId);
    const targetRoom = rooms.find(r => r.id === targetRoomId);
    
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
        merged_at: new Date().toISOString()
      };

      // 2. Cập nhật phòng đích (thêm vào merged_bookings)
      const currentMerged = targetRoom.current_booking.merged_bookings || [];
      const { error: targetError } = await supabase
        .from('bookings')
        .update({
          merged_bookings: [...currentMerged, mergeData]
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
          notes: (sourceRoom.current_booking.notes || '') + `\n[Đã gộp vào phòng ${targetRoom.room_number}]`
        })
        .eq('id', sourceBookingId);

      if (sourceError) throw sourceError;

      // 4. Chuyển trạng thái phòng nguồn sang 'dirty'
      const { error: roomError } = await supabase
        .from('rooms')
        .update({
          status: 'dirty',
          current_booking_id: null
        })
        .eq('id', sourceRoom.id);

      if (roomError) throw roomError;

      // 5. Kết thúc
      setFolioRoomId(null);
      await mutateRooms();
      showNotification(`Đã gộp hóa đơn phòng ${sourceRoom.room_number} vào phòng ${targetRoom.room_number}`, 'success');
    } catch (error: any) {
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

            const updatedNotes = [
              currentBooking?.notes,
              `[HỦY PHÒNG] Lý do: ${reason}`
            ].filter(Boolean).join('\n');

            const { error: bookingError } = await supabase
              .from('bookings')
              .update({ 
                status: 'cancelled', 
                check_out_at: new Date().toISOString(),
                notes: updatedNotes
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
              severity: 'danger'
            });
          }

          // 2. Set room status to 'dirty'
          const { error: roomError } = await supabase
            .from('rooms')
            .update({ 
              status: 'dirty', 
              current_booking_id: null,
              last_status_change: new Date().toISOString()
            })
            .eq('id', folioRoom.id);

          if (roomError) throw roomError;

          // 3. Reset state and show notification
          setFolioRoomId(null);
          await mutateRooms();
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          showNotification(`Đã hủy phòng ${folioRoom.room_number} thành công!`, 'success');
        } catch (error) {
          console.error('Lỗi khi hủy phòng:', error);
          showNotification('Lỗi khi hủy phòng', 'error');
        }
      }
    });
  };

  const handleCheckIn = async (data: CheckInData) => {
    try {
      if (!selectedRoom) return;

      let customerId = null;
      
      // 1. Create/Find Customer
      let customerName = data.customer?.name?.trim();
      const customerPhone = data.customer?.phone?.trim() || '';
      const customerIdCard = data.customer?.idCard?.trim() || '';
      const customerAddress = data.customer?.address?.trim() || '';

      // Nếu không có tên khách, dùng "Khách mới"
      if (!customerName) {
        customerName = 'Khách mới';
      }

      // Try to find existing first by name (if it's "Khách mới") or phone or id_card
      let existingCust = null;
      
      if (customerName === 'Khách mới') {
        const { data: foundDefault } = await supabase
          .from('customers')
          .select('id, address')
          .eq('full_name', 'Khách mới')
          .maybeSingle();
        existingCust = foundDefault;
      }

      if (!existingCust && (customerPhone || customerIdCard)) {
        const searchConditions = [];
        if (customerPhone) searchConditions.push(`phone.eq.${customerPhone}`);
        if (customerIdCard) searchConditions.push(`id_card.eq.${customerIdCard}`);
        
        const { data: found } = await supabase
          .from('customers')
          .select('id, address')
          .or(searchConditions.join(','))
          .maybeSingle();
        existingCust = found;
      }

      if (existingCust) {
        customerId = existingCust.id;
        // Cập nhật địa chỉ nếu chưa có hoặc khác
        if (customerAddress && customerAddress !== existingCust.address) {
          await supabase
            .from('customers')
            .update({ address: customerAddress })
            .eq('id', customerId);
        }

        // Fetch full customer data and their bookings for the insights modal
        const { data: fullCustomer } = await supabase.from('customers').select('*').eq('id', customerId).single();
        const { data: customerBookings } = await supabase
          .from('bookings')
          .select('*, rooms(room_number)')
          .eq('customer_id', customerId)
          .eq('status', 'completed')
          .order('check_out_at', { ascending: false })
          .limit(1);

        if (fullCustomer && customerName !== 'Khách mới') {
          setCustomerInsightsData({ customer: fullCustomer, bookings: customerBookings || [] });
        }
      } else {
        // Create new customer (including KHÁCH VÃNG LAI)
        const { data: newCust, error: custError } = await supabase
          .from('customers')
          .insert([{
            full_name: customerName,
            phone: customerPhone,
            id_card: customerIdCard,
            address: customerAddress,
            visit_count: 1,
            total_spent: 0
          }])
          .select()
          .single();

        if (custError) {
          console.error('Error creating customer:', custError);
        } else {
          customerId = newCust.id;
        }
      }

      // 2. Create booking
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert([{
          room_id: selectedRoom.id,
          customer_id: customerId,
          check_in_at: new Date().toISOString(),
          system_created_at: new Date().toISOString(), // Giờ hệ thống thực tế
          rental_type: data.rentalType,
          initial_price: data.price,
          deposit_amount: data.deposit || 0,
          notes: data.notes,
          room_charge_locked: 0,
          status: 'active',
          custom_surcharge: 0,
          room_charge_suggested: 0,
          room_charge_actual: 0,
          services_used: data.services.map(s => {
            const serviceId = s.service_id || s.id;
            const serviceInfo = services.find(si => String(si.id) === String(serviceId));
            return {
              id: serviceId,
              service_id: serviceId,
              name: serviceInfo?.name || 'Dịch vụ',
              price: s.price,
              quantity: s.quantity,
              total: s.price * s.quantity
            };
          })
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
      setSelectedRoomId(null);
      await mutateRooms(); // Refresh data immediately
      showNotification(`Nhận phòng ${selectedRoom.room_number} thành công!`, 'success');
    } catch (error: unknown) {
      const err = error as any;
      console.error('Chi tiết lỗi Check-in:', {
        message: err.message,
        details: err.details,
        hint: err.hint,
        code: err.code,
        fullError: err
      });
      showNotification(`Lỗi khi nhận phòng: ${err.message || 'Lỗi không xác định'}`, 'error');
    }
  };

  const seedRooms = async () => {
    if (rooms.length > 0) {
      setConfirmConfig({
        isOpen: true,
        title: 'Nạp lại dữ liệu?',
        description: 'Bạn có chắc chắn muốn nạp lại dữ liệu mẫu? Hành động này sẽ cập nhật lại giá và thông tin cho các phòng hiện có.',
        variant: 'danger',
        onConfirm: () => {
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          executeSeed();
        }
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
      showNotification('Đã khởi tạo 12 phòng mẫu thành công!', 'success');
    } catch (error: unknown) {
      const err = error as any;
      console.error('Seed error:', err);
      showNotification(`Lỗi khởi tạo: ${err.message}`, 'error');
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
    <div className="space-y-4 pb-20"> {/* Add padding bottom for mobile scroll */}
      <DashboardHeader 
        roomCounts={roomCounts} 
        activeFilterIds={activeFilterIds}
        onToggleFilter={onToggleFilter}
        onSeed={seedRooms}
        isSeeding={isSeeding}
      />

      <motion.div 
        layout
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 pt-0"
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
                settings={settings}
                onClick={handleRoomClick}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      <CheckInModal 
        room={selectedRoom} 
        services={services}
        customers={customers}
        timeRules={timeRules}
        isOpen={!!selectedRoomId}
        onClose={() => setSelectedRoomId(null)}
        onConfirm={handleCheckIn}
      />

      <FolioModal 
         isOpen={!!folioRoomId}
         onClose={() => setFolioRoomId(null)}
         room={folioRoom}
         settings={settings}
         services={services}
         customers={customers}
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
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

{/* Force Update 19:15 */}
{/* Trigger Build Again */}
