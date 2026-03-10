import { supabase } from '@/lib/supabase';

export interface GroupBookingInfo {
  is_group: boolean;
  master_id?: string;
  members?: GroupMember[];
  children?: GroupMember[];
  rooms?: GroupMember[]; // Add rooms
  group_payable_total?: number;
  selected_payable_total?: number;
  selected_child_ids?: string[];
}

export interface GroupMember {
  booking_id: string;
  room_name: string;
  customer_name: string; // Thêm thuộc tính này
  is_master: boolean;
  status: string;
  total_amount: number;
  deposit_amount: number;
  payable_amount: number;
}

export const groupBookingService = {
  // Gộp phòng: Master trả tiền cho Child
  async groupRooms(masterId: string, childIds: string[]) {
    const { data, error } = await supabase.rpc('group_rooms', {
      p_master_id: masterId,
      p_child_ids: childIds,
    });

    if (error) {
      console.error('Supabase RPC Error in groupRooms:', JSON.stringify(error, null, 2));
      return { success: false, message: error.message }; // Trả về đối tượng lỗi nhất quán
    }
    // Giả định nếu không có lỗi, RPC thành công.
    // Đảm bảo client luôn nhận được đối tượng có thuộc tính 'success'.
    return { success: true, data: data }; // Trả về đối tượng thành công nhất quán
  },

  // Tách phòng khỏi nhóm
  async ungroupRoom(bookingId: string) {
    const { data, error } = await supabase.rpc('ungroup_room', {
      p_booking_id: bookingId,
    });

    if (error) throw error;
    return data;
  },

  async getBookingBill(bookingId: string) {
    const { data, error } = await supabase.rpc('calculate_booking_bill', {
      p_booking_id: bookingId,
    });

    if (error) {
      console.error('Supabase RPC Error in getBookingBill:', JSON.stringify(error, null, 2));
      throw new Error(`Lỗi khi tải hóa đơn booking: ${error.message}`);
    }
    return data;
  },

  // Lấy thông tin chi tiết nhóm phòng
  async getGroupDetails(bookingId: string, selectedChildIds?: string[]): Promise<GroupBookingInfo> {
    const { data, error } = await supabase.rpc('get_group_details', {
      p_booking_id: bookingId,
      p_selected_child_ids: selectedChildIds || null,
    });

    if (error) {
      console.error('Supabase RPC Error in getGroupDetails (Supabase client error):', JSON.stringify(error, null, 2), {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        bookingId,
        selectedChildIds
      });
      throw new Error(`Lỗi khi tải thông tin nhóm phòng (client): ${error.message || 'Không xác định'}`);
    }
    
    // Check if the RPC function itself returned an error object
    if (data && data.success === false) {
      console.error('Supabase RPC Error in getGroupDetails (PostgreSQL function error):', {
        message: data.message,
        code: data.code,
        context: data.context,
        bookingId: data.booking_id || bookingId,
        selectedChildIds
      });
      throw new Error(`Lỗi khi tải thông tin nhóm phòng (server): ${data.message || 'Không xác định'}`);
    }
    
    if (!data) {
      throw new Error('Không có dữ liệu trả về từ hàm get_group_details');
    }
    
    return data as GroupBookingInfo;
  }
};
