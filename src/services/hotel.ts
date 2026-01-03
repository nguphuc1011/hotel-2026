import { supabase } from '@/lib/supabase';
import { Service } from '@/types';

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
        throw new Error(
          `Phòng ${room?.room_number || ''} không khả dụng để check-in (Status: ${room?.status})`
        );
      }
    }

    // 2. Tìm hoặc Tạo khách hàng
    const customerId = await this.findOrCreateCustomer(params.customer);

    // 3. Chuẩn bị dữ liệu services_used
    const servicesUsed =
      params.services?.map((s) => {
        const serviceInfo = params.allServices?.find(
          (as) => String(as.id) === String(s.service_id)
        );
        return {
          id: s.service_id,
          service_id: s.service_id,
          name: serviceInfo?.name || 'Dịch vụ',
          price: s.price,
          quantity: s.quantity,
          total: s.price * s.quantity,
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
        services_used: servicesUsed,
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
        last_status_change: new Date().toISOString(),
      })
      .eq('id', params.roomId);

    if (updateRoomErr) {
      // Rollback booking (Manual)
      await supabase.from('bookings').delete().eq('id', booking.id);
      throw updateRoomErr;
    }

    return booking;
  },

  /**
   * Helper: Tìm hoặc tạo khách hàng
   */
  async findOrCreateCustomer(customerData: {
    name: string;
    phone?: string;
    idCard?: string;
    address?: string;
  }) {
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
          await supabase
            .from('customers')
            .update({ address: customerData.address })
            .eq('id', data.id);
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
        total_spent: 0,
      })
      .select('id')
      .single();

    if (error) throw error;
    return newCust.id;
  },

  /**
   * THANH TOÁN & CHECK-OUT: Sử dụng RPC handle_checkout (Hệ thống mới thống nhất)
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
    // eslint-disable-next-line no-console
    console.log('[HotelService] Bắt đầu quy trình checkOut (handle_checkout)...', params.bookingId);

    // Chuẩn bị notes tổng hợp
    const fullNotes = [params.auditNote ? `[THANH TOÁN] ${params.auditNote}` : '', params.notes]
      .filter(Boolean)
      .join('\n');

    // Gọi RPC handle_checkout (Unified - Alphabetical parameters)
    const { data, error } = await supabase.rpc('handle_checkout', {
      p_booking_id: params.bookingId,
      p_notes: fullNotes || '',
      p_payment_method: params.paymentMethod || 'cash',
      p_surcharge: Number(params.surcharge) || 0,
      p_total_amount: Number(params.finalAmount) || 0
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[HotelService] Lỗi RPC handle_checkout:', error);
      throw new Error(`Lỗi thanh toán: ${error.message}`);
    }

    if (data && !data.success) {
      throw new Error(data.message || 'Lỗi xử lý thanh toán');
    }

    // eslint-disable-next-line no-console
    console.log('[HotelService] Check-out thành công qua RPC handle_checkout');

    return { success: true };
  },

  /**
   * HỆ THỐNG THÔNG BÁO REAL-TIME TOÀN CỤC
   */
  async notifySystemChange(type: string, roomId: string) {
    try {
      // eslint-disable-next-line no-console
      console.log(
        `[MẮT THẦN] Đang chuẩn bị gửi thông báo tự động cho sự kiện: ${type}, RoomID: ${roomId}`
      );

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        // eslint-disable-next-line no-console
        console.warn('[MẮT THẦN] Không tìm thấy user đang đăng nhập, bỏ qua gửi thông báo.');
        return;
      }

      // Lấy thông tin phòng để nội dung thông báo "kêu" hơn
      const { data: room } = await supabase
        .from('rooms')
        .select('room_number')
        .eq('id', roomId)
        .single();

      const roomName = room?.room_number || 'Phòng';

      let title = '';
      let body = '';

      if (type === 'check_in') {
        title = `🔔 CHECK-IN: PHÒNG ${roomName}`;
        body = `Báo cáo Bệ Hạ! Phòng ${roomName} vừa có khách nhận phòng. Trạng thái đã chuyển sang "Đang ở".`;
      } else if (type === 'check_out') {
        title = `💰 CHECK-OUT: PHÒNG ${roomName}`;
        body = `Bệ Hạ ơi! Phòng ${roomName} đã làm thủ tục trả phòng và thanh toán thành công.`;
      } else if (type === 'room_change') {
        title = `🔄 ĐỔI PHÒNG: ${roomName}`;
        body = `Bệ Hạ ơi! Khách đã được chuyển sang Phòng ${roomName}. Các chi phí đã được cập nhật theo phòng mới.`;
      } else if (type === 'booking_edit') {
        title = `✏️ SỬA ĐẶT PHÒNG: ${roomName}`;
        body = `Báo cáo! Thông tin đặt phòng ${roomName} vừa được chỉnh sửa (giá hoặc thời gian).`;
      }

      if (title && body) {
        const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-notification`;

        // eslint-disable-next-line no-console
        console.log(`[MẮT THẦN] Đang gọi Edge Function: ${functionUrl}`);

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({
            user_id: user.id,
            title: title,
            body: body,
            tag: `${type}-${roomId}`, // Thêm tag để tránh lặp thông báo trên cùng 1 thiết bị
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          // eslint-disable-next-line no-console
          console.error(`[MẮT THẦN] Lỗi từ Edge Function (${response.status}):`, errorText);
        } else {
          const result = await response.json();
          // eslint-disable-next-line no-console
          console.log('[MẮT THẦN] Gửi thông báo thành công:', result);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[MẮT THẦN] Lỗi trong hệ thống notifySystemChange:', error);
    }
  },
};
