import { supabase } from '@/lib/supabase';
import { Service } from '@/types';

export const HotelService = {
  /**
   * Lấy ca làm việc hiện tại của nhân viên
   */
  async getCurrentShift() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('staff_id', user.id)
      .eq('status', 'open')
      .order('start_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return data;
  },

  /**
   * Ghi nhận vào Sổ cái (Ledger)
   */
  async recordLedger(params: {
    type: 'REVENUE' | 'PAYMENT' | 'DEPOSIT' | 'REFUND' | 'EXPENSE' | 'DEBT_ADJUSTMENT';
    category: string;
    amount: number;
    paymentMethodCode?: string;
    bookingId?: string;
    customerId?: string;
    description?: string;
    meta?: any;
  }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const shift = await this.getCurrentShift();

    const { error } = await supabase.from('ledger').insert({
      shift_id: shift?.id,
      staff_id: user.id,
      booking_id: params.bookingId,
      customer_id: params.customerId,
      type: params.type,
      category: params.category,
      amount: Math.abs(params.amount),
      payment_method_code: params.paymentMethodCode || 'CASH',
      description: params.description,
      meta: params.meta || {}
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[Ledger] Lỗi ghi sổ:', error);
    }
  },

  /**
   * CHECK-IN: Đảm bảo tính nguyên tử (Atomic)
   * Sử dụng RPC handle_check_in để xử lý toàn bộ quy trình trong một transaction
   */
  async checkIn(params: {
    roomId: string;
    customer: {
      id?: string;
      name: string;
      phone?: string;
      idCard?: string;
      address?: string;
    };
    rentalType: string;
    checkInAt?: string;
    price: number;
    deposit?: number;
    depositMethod?: string;
    notes?: string;
    services?: Array<{ service_id: string; quantity: number; price: number }>;
    allServices?: Service[]; // Để lấy tên dịch vụ
    includeDebt?: boolean;
  }) {
    // 1. Chuẩn bị dữ liệu services_used
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

    // Gọi RPC handle_check_in
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase.rpc('handle_check_in', {
      p_room_id: params.roomId,
      p_rental_type: params.rentalType,
      p_customer_id: params.customer.id || null,
      p_customer_name: params.customer.name,
      p_customer_phone: params.customer.phone || null,
      p_customer_id_card: params.customer.idCard || null,
      p_customer_address: params.customer.address || null,
      p_check_in_at: params.checkInAt || new Date().toISOString(),
      p_initial_price: params.price,
      p_deposit_amount: params.deposit || 0,
      p_deposit_method: (params.depositMethod || 'cash').toUpperCase(),
      p_notes: params.notes || null,
      p_services_used: servicesUsed,
      p_staff_id: user?.id || null
    });

    if (error) {
      throw new Error(`Lỗi check-in: ${error.message}`);
    }

    if (data && !data.success) {
      throw new Error(data.message || 'Lỗi xử lý check-in');
    }

    return data.booking;
  },

  /**
   * TÌM KIẾM KHÁCH HÀNG (Tối ưu performance)
   */
  async searchCustomers(term: string) {
    if (!term || term.trim().length < 1) return [];

    const cleanTerm = term.trim();
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .or(`full_name.ilike.%${cleanTerm}%,phone.ilike.%${cleanTerm}%,id_card.ilike.%${cleanTerm}%`)
      .order('full_name')
      .limit(5);

    if (error) {
      return [];
    }
    return data || [];
  },

  /**
   * TÍNH TOÁN HÓA ĐƠN TỪ DATABASE (Pricing Brain V2)
   */
  async calculateBill(bookingId: string) {
    if (!bookingId || bookingId === 'undefined') {
      console.error('[HotelService] calculateBill bị gọi với bookingId không hợp lệ:', bookingId);
      return { success: false, message: 'ID đặt phòng không hợp lệ' };
    }

    const { data, error } = await supabase.rpc('calculate_booking_bill', {
      p_booking_id: bookingId
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[HotelService] Lỗi RPC calculate_booking_bill:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      
      return { 
        success: false, 
        message: `Lỗi hệ thống (RPC): ${error.message || 'Không có phản hồi'}`,
        total_amount: 0,
        final_amount: 0
      };
    }

    if (data && data.success === false) {
      // eslint-disable-next-line no-console
      console.warn('[HotelService] RPC trả về thất bại:', data.message);
      return data;
    }

    return data;
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
    amountPaid: number;
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
    const { data: { user } } = await supabase.auth.getUser();

    // Ensure we pass parameters correctly to the UNIFIED handle_checkout
    const { data, error } = await supabase.rpc('handle_checkout', {
      p_booking_id: params.bookingId,
      p_amount_paid: Number(params.amountPaid) || 0,
      p_payment_method: params.paymentMethod || 'CASH',
      p_surcharge: Number(params.surcharge) || 0,
      p_discount: Number(params.discount) || 0,
      p_notes: fullNotes || '',
      p_staff_id: user?.id || null
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[HotelService] Lỗi RPC handle_checkout:', error);
      throw new Error(`Lỗi thanh toán: ${error.message}`);
    }

    if (data && !data.success) {
      throw new Error(data.message || 'Lỗi xử lý thanh toán');
    }

    return data;
  },

  /**
   * THU NỢ KHÁCH HÀNG
   */
  async payDebt(params: {
    customerId: string;
    amount: number;
    method: string;
    cashier: string;
    note?: string;
    bookingId?: string;
  }) {
    const { data, error } = await supabase.rpc('handle_debt_payment', {
      p_customer_id: params.customerId,
      p_amount: params.amount,
      p_method: params.method,
      p_cashier_id: params.cashier,
      p_note: params.note || null,
    });

    if (error) throw error;

    return data;
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
