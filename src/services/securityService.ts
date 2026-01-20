import { supabase } from '@/lib/supabase';

export type SecurityAction = 
  | 'checkin_custom_price'
  | 'checkin_override_surcharge'
  | 'checkin_debt_allow'
  | 'folio_add_service'
  | 'folio_remove_service'
  | 'folio_edit_service'
  | 'folio_change_room'
  | 'checkout_discount'
  | 'checkout_custom_surcharge'
  | 'checkout_mark_as_debt'
  | 'checkout_refund'
  | 'checkout_void_bill'
  | 'checkout_payment'
  | 'finance_manual_cash_out'
  | 'finance_create_income'
  | 'inventory_adjust'
  | 'finance_manage_category'
  | 'finance_delete_transaction';

export const securityService = {
  /**
   * Kiểm tra xem một hành động có yêu cầu mã PIN hay không dựa trên cấu hình settings_security
   */
  async checkActionRequiresPin(action: SecurityAction): Promise<boolean> {
    const { data, error } = await supabase
      .from('settings_security')
      .select('is_enabled')
      .eq('key', action)
      .single();

    if (error) {
      console.error('Lỗi khi kiểm tra cấu hình bảo mật:', error);
      // Mặc định là TRUE để an toàn nếu có lỗi
      return true;
    }

    return data?.is_enabled ?? true;
  },

  /**
   * Xác thực mã PIN của nhân viên
   */
  async verifyPin(staffId: string, pin: string): Promise<boolean> {
    // Trong thực tế, PIN nên được băm ở client trước khi gửi lên hoặc dùng RPC để so sánh
    // Ở đây dùng RPC fn_verify_staff_pin đã tạo
    const { data, error } = await supabase.rpc('fn_verify_staff_pin', {
      p_staff_id: staffId,
      p_pin_hash: pin // Giả định pin truyền vào đã là dạng hash hoặc plain tùy logic
    });

    if (error) {
      console.error('Lỗi xác thực PIN:', error);
      return false;
    }

    return !!data;
  },

  /**
   * Lấy toàn bộ cấu hình bảo mật
   */
  async getAllSecuritySettings() {
    const { data, error } = await supabase.rpc('fn_get_security_settings');
    if (error) throw error;
    return data;
  }
};
