import { supabase } from '@/lib/supabase';

export type EventType = 
  | 'SERVICE_UPDATE' 
  | 'SERVICE_DELETE' 
  | 'PRICE_UPDATE' 
  | 'BOOKING_CANCEL' 
  | 'ROOM_CHANGE' 
  | 'DISCOUNT_APPLIED'
  | 'SURECHARGE_APPLIED'
  | 'PAYMENT_COMPLETED';

export interface SystemEvent {
  type: EventType;
  entity_type: 'booking' | 'service' | 'room' | 'customer' | 'cashflow';
  entity_id: string;
  action: string;
  old_value?: any;
  new_value?: any;
  reason?: string;
  severity?: 'info' | 'warning' | 'danger';
}

export const EventService = {
  /**
   * Phát đi một sự kiện hệ thống.
   * Hiện tại sẽ ghi vào audit_logs, tương lai có thể cắm thêm Webhook/Telegram.
   */
  async emit(event: SystemEvent) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // 1. Ghi log vào database (Móng ngầm)
      // Tâu Bệ Hạ: Thần đã cập nhật DB để có đủ các cột chuẩn hóa
      const logData: any = {
        user_id: user?.id,
        action: event.action,
        table_name: event.entity_type, // Chuẩn hóa table_name
        record_id: event.entity_id,    // Chuẩn hóa record_id (trước là entity_id)
        old_data: event.old_value,     // Chuẩn hóa old_data (trước là old_value)
        new_data: event.new_value,     // Chuẩn hóa new_data (trước là new_value)
        reason: event.reason,
        severity: event.severity || 'info'
      };

      const { error } = await supabase
        .from('audit_logs')
        .insert(logData);

      if (error) {
        console.error('[EventService] Lỗi khi ghi audit log:', error);
        // Tâu Bệ Hạ: Nếu vẫn lỗi RLS hoặc thiếu cột, thần sẽ thử ghi bản rút gọn nhất
        if (error.code === '42501' || error.code === 'PGRST204') {
          console.warn('[EventService] Đang thử ghi log rút gọn do lỗi DB...');
          try {
            await supabase.from('audit_logs').insert({
              action: `[REDUCED] ${event.action}`,
              reason: `Lỗi DB: ${error.message} | Lý do gốc: ${event.reason}`
            });
          } catch (e) {
            // Im lặng nếu vẫn lỗi
          }
        }
      }

      // 2. Webhook Ready: Nơi để cắm thêm các tích hợp bên ngoài
      this.triggerWebhooks(event);

      return { success: !error };
    } catch (err) {
      console.error('[EventService] Lỗi hệ thống:', err);
      return { success: false };
    }
  },

  /**
   * Placeholder cho việc tích hợp Webhook (Telegram, Zapier, v.v.)
   */
  async triggerWebhooks(event: SystemEvent) {
    // Tâu Bệ Hạ: Đây là nơi ta sẽ "cắm" dây truyền tin sau này.
    // Khi có biến động lớn (severity === 'danger'), ta có thể bắn Telegram ngay.
    if (event.severity === 'danger') {
      console.warn(`[WEBHOOK] Cảnh báo đỏ: ${event.action} - Lý do: ${event.reason}`);
      // await fetch(process.env.TELEGRAM_WEBHOOK_URL, { ... })
    }
  }
};
