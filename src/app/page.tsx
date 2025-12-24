'use client';

import { useState, useMemo } from 'react';
import { useHotel } from '@/hooks/useHotel';
import { RoomCard } from '@/components/dashboard/RoomCard';
import { CheckInModal } from '@/components/dashboard/CheckInModal';
import { FolioModal } from '@/components/dashboard/FolioModal';
import CustomerInsightsModal from '@/components/dashboard/CustomerInsightsModal';
import { Room, Customer, Booking } from '@/types';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function Dashboard() {
  const { rooms, settings, customers, services, isLoading, mutateRooms } = useHotel();
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [folioRoom, setFolioRoom] = useState<Room | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [activeFilterIds, setActiveFilterIds] = useState<string[]>(['available', 'hourly', 'daily', 'dirty', 'repair']);
  const [customerInsightsData, setCustomerInsightsData] = useState<{ customer: Customer, bookings: Booking[] } | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant?: 'danger' | 'info';
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const systemSettings = settings?.find((s: any) => s.key === 'system_settings')?.value;
  const timeRules = systemSettings || {
    check_in: '14:00',
    check_out: '12:00',
    overnight: { start: '22:00', end: '08:00' },
    early_rules: [],
    late_rules: [],
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

  const handleRoomClick = async (room: Room) => {
    if (room.status === 'available') {
      setSelectedRoom(room);
    } else if (['hourly', 'daily', 'overnight'].includes(room.status)) {
      setFolioRoom(room);
    } else if (['dirty', 'repair'].includes(room.status)) {
      setConfirmConfig({
        isOpen: true,
        title: 'Xác nhận dọn phòng',
        description: `Xác nhận phòng ${room.room_number} đã sẵn sàng đón khách?`,
        onConfirm: async () => {
          try {
            const { error } = await supabase
              .from('rooms')
              .update({ status: 'available', current_booking_id: null })
              .eq('id', room.id);
            
            if (error) throw error;
            mutateRooms();
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Không thể cập nhật trạng thái phòng');
          }
        }
      });
    }
  };

  const handlePayment = async (amount: number) => {
    if (!folioRoom) return;
    
    try {
      // 1. Update booking status to completed
      if (folioRoom.current_booking_id) {
        const { data: booking } = await supabase
          .from('bookings')
          .update({ 
            status: 'completed', 
            check_out_at: new Date().toISOString(),
            final_amount: amount
          })
          .eq('id', folioRoom.current_booking_id)
          .select('customer_id')
          .single();

        // 2. Update customer stats if linked
        if (booking?.customer_id) {
          // Lấy thông tin hiện tại của khách hàng
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
                total_spent: (customer.total_spent || 0) + amount
              })
              .eq('id', booking.customer_id);
          }
        }
      }

      // 3. Set room to dirty
      await supabase
        .from('rooms')
        .update({ status: 'dirty', current_booking_id: null })
        .eq('id', folioRoom.id);

      mutateRooms();
      setFolioRoom(null);
      toast.success(`Thanh toán phòng ${folioRoom.room_number} thành công!`);
    } catch (error) {
      console.error(error);
      toast.error('Lỗi thanh toán');
    }
  };

  const handleCheckIn = async (data: any) => {
    try {
      if (!selectedRoom) return;

      let customerId = null;
      
      // 1. Create/Find Customer
      const customerName = data.customer?.name?.trim() || 'KHÁCH VÃNG LAI';
      const customerPhone = data.customer?.phone?.trim() || '';
      const customerIdCard = data.customer?.idCard?.trim() || '';
      const customerPlate = data.customer?.plate_number?.trim() || '';

      // Try to find existing first by phone or id_card (only if provided and not empty)
      let existingCust = null;
      const searchConditions = [];
      if (customerPhone) searchConditions.push(`phone.eq.${customerPhone}`);
      if (customerIdCard) searchConditions.push(`id_card.eq.${customerIdCard}`);

      if (searchConditions.length > 0) {
        const { data: found } = await supabase
          .from('customers')
          .select('id, plate_number')
          .or(searchConditions.join(','))
          .maybeSingle();
        existingCust = found;
      }

      if (existingCust) {
        customerId = existingCust.id;
        // Cập nhật biển số xe nếu chưa có hoặc khác
        if (customerPlate && customerPlate !== existingCust.plate_number) {
          await supabase
            .from('customers')
            .update({ plate_number: customerPlate })
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

        if (fullCustomer) {
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
            plate_number: customerPlate,
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
          rental_type: data.rentalType,
          initial_price: data.price,
          deposit_amount: data.deposit || 0,
          notes: data.notes,
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
      setSelectedRoom(null);
      mutateRooms(); // Refresh data immediately
      
    } catch (error: any) {
      console.error('Chi tiết lỗi Check-in:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        fullError: error
      });
      toast.error(`Lỗi khi nhận phòng: ${error.message || 'Lỗi không xác định'}`);
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
      toast.success('Đã khởi tạo 12 phòng mẫu thành công!');
    } catch (error: any) {
      console.error('Seed error:', error);
      toast.error(`Lỗi khởi tạo: ${error.message}`);
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
          services={services}
          customers={customers}
          timeRules={timeRules}
          onClose={() => setSelectedRoom(null)}
          onConfirm={handleCheckIn}
        />
      )}

      {folioRoom && (
        <FolioModal
          room={folioRoom}
          settings={settings}
          services={services}
          isOpen={!!folioRoom}
          onClose={() => setFolioRoom(null)}
          onPayment={handlePayment}
        />
      )}

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
        variant={confirmConfig.variant}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

{/* Force Update 19:15 */}
{/* Trigger Build Again */}
