import { supabase } from '@/lib/supabase';
import { Room, Booking, Customer, Service } from '@/types';

export const HotelService = {
  /**
   * CHECK-IN: Đảm bảo tính nguyên tử (Atomic)
   * Tạo booking và cập nhật trạng thái phòng trong một luồng duy nhất
   */
  async checkIn(params: {
    roomId: string;
    customer: {
      name: string;
      phone?: string;
      idCard?: string;
      address?: string;
    };
    rentalType: string;
    checkInAt?: string;
    price: number;
    deposit?: number;
    notes?: string;
    services?: Array<{ service_id: string; quantity: number; price: number }>;
    allServices?: Service[]; // Để lấy tên dịch vụ
  }) {
    // 1. Kiểm tra trạng thái phòng
    const { data: room, error: roomErr } = await supabase
      .from('rooms')
      .select('status, room_number')
      .eq('id', params.roomId)
      .single();

    if (roomErr || !['available', 'reserved'].includes(room?.status)) {
       // Cho phép check-in nếu reserved (đặt trước) hoặc available
       if (room?.status !== 'available' && room?.status !== 'reserved') {
          throw new Error(`Phòng ${room?.room_number || ''} không khả dụng để check-in (Status: ${room?.status})`);
       }
    }

    // 2. Tìm hoặc Tạo khách hàng
    let customerId = await this.findOrCreateCustomer(params.customer);

    // 3. Chuẩn bị dữ liệu services_used
    const servicesUsed = params.services?.map(s => {
      const serviceInfo = params.allServices?.find(as => String(as.id) === String(s.service_id));
      return {
        id: s.service_id,
        service_id: s.service_id,
        name: serviceInfo?.name || 'Dịch vụ',
        price: s.price,
        quantity: s.quantity,
        total: s.price * s.quantity
      };
    }) || [];

    // 4. Tạo Booking
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .insert({
        room_id: params.roomId,
        customer_id: customerId,
        check_in_at: params.checkInAt || new Date().toISOString(),
        rental_type: params.rentalType,
        initial_price: params.price,
        deposit_amount: params.deposit || 0,
        notes: params.notes,
        status: 'active',
        services_used: servicesUsed
      })
      .select()
      .single();

    if (bookingErr) throw bookingErr;

    // 5. Cập nhật trạng thái phòng
    const { error: updateRoomErr } = await supabase
      .from('rooms')
      .update({ 
        status: params.rentalType, // Set status to rental type (hourly/daily/overnight)
        current_booking_id: booking.id,
        last_status_change: new Date().toISOString()
      })
      .eq('id', params.roomId);

    if (updateRoomErr) {
      // Rollback booking (Manual)
      await supabase.from('bookings').delete().eq('id', booking.id);
      throw updateRoomErr;
    }

    // 6. Gửi thông báo hệ thống (nếu cần)
    await this.notifySystemChange('check_in', params.roomId);

    return booking;
  },

  /**
   * Helper: Tìm hoặc tạo khách hàng
   */
  async findOrCreateCustomer(customerData: { name: string; phone?: string; idCard?: string; address?: string }) {
    let customerName = customerData.name?.trim();
    if (!customerName) customerName = 'Khách vãng lai';

    // Nếu là khách vãng lai và không có thông tin định danh
    if (customerName === 'Khách vãng lai' && !customerData.phone && !customerData.idCard) {
      const { data } = await supabase
        .from('customers')
        .select('id')
        .eq('full_name', 'Khách vãng lai')
        .maybeSingle();
      if (data) return data.id;
    }

    // Tìm kiếm khách hàng tồn tại
    if (customerData.phone || customerData.idCard) {
      const conditions = [];
      if (customerData.phone) conditions.push(`phone.eq.${customerData.phone}`);
      if (customerData.idCard) conditions.push(`id_card.eq.${customerData.idCard}`);
      
      const { data } = await supabase
        .from('customers')
        .select('id, address')
        .or(conditions.join(','))
        .maybeSingle();

      if (data) {
        // Cập nhật địa chỉ nếu có thay đổi
        if (customerData.address && customerData.address !== data.address) {
          await supabase.from('customers').update({ address: customerData.address }).eq('id', data.id);
        }
        return data.id;
      }
    }

    // Tạo khách hàng mới
    const { data: newCust, error } = await supabase
      .from('customers')
      .insert({
        full_name: customerName,
        phone: customerData.phone,
        id_card: customerData.idCard,
        address: customerData.address,
        visit_count: 1,
        total_spent: 0
      })
      .select('id')
      .single();

    if (error) throw error;
    return newCust.id;
  },

  /**
   * THANH TOÁN & CHECK-OUT: Sử dụng RPC resolve_checkout
   */
  async checkOut(params: {
    bookingId: string;
    roomId: string;
    totalAmount: number;
    paymentMethod: string;
    discount?: number;
    surcharge?: number;
    finalAmount: number;
    notes?: string;
    auditNote?: string;
    user?: any; // User object for logging
  }) {
    console.log('[HotelService] Bắt đầu quy trình checkOut (RPC)...', params.bookingId);
    
    // Chuẩn bị notes tổng hợp
    const fullNotes = [
      params.auditNote ? `[THANH TOÁN] ${params.auditNote}` : '',
      params.notes
    ].filter(Boolean).join('\n');

    const { data: { user } } = await supabase.auth.getUser();

    // Gọi RPC resolve_checkout
    const { data, error } = await supabase.rpc('resolve_checkout', {
      p_booking_id: params.bookingId,
      p_payment_method: params.paymentMethod,
      p_total_amount: params.totalAmount,
      p_final_amount: params.finalAmount,
      p_surcharge: params.surcharge || 0,
      p_notes: fullNotes,
      p_user_id: user?.id || params.user?.id
    });

    if (error) {
      console.error('[HotelService] Lỗi RPC resolve_checkout:', error);
      throw new Error(`Lỗi thanh toán: ${error.message}`);
    }

    if (data && !data.success) {
       throw new Error(data.message || 'Lỗi xử lý thanh toán');
    }

    console.log('[HotelService] Check-out thành công qua RPC');
    return { success: true };
  },

  /**
   * HỆ THỐNG THÔNG BÁO REAL-TIME TOÀN CỤC
   */
  async notifySystemChange(type: string, roomId: string) {
    // Có thể dùng bảng events hoặc chỉ cần trigger update nhẹ vào bảng rooms
    // Hiện tại chỉ cần log hoặc update 1 field dummy nếu cần trigger
    // Tuy nhiên, việc update status phòng ở trên đã đủ để trigger realtime 'rooms' rồi.
  }
};
