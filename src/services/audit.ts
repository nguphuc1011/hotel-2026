import { supabase } from '@/lib/supabase';

export type AuditActionType = 
  | 'CHECK_IN' 
  | 'CHECK_OUT' 
  | 'CANCEL_BOOKING' 
  | 'UPDATE_PRICE' 
  | 'DELETE_SERVICE' 
  | 'STOCK_ADJUST'
  | 'ROOM_ISSUE_REPORT'
  | 'ROOM_ISSUE_RESOLVE';

export interface AuditLogParams {
  action_type: AuditActionType;
  table_name?: string;
  record_id?: string;
  old_value?: any;
  new_value?: any;
  reason?: string;
  severity?: 'info' | 'warning' | 'critical';
}

export const AuditService = {
  /**
   * Ghi nhật ký hành động vào bảng audit_logs
   */
  async log(params: AuditLogParams) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action: `[${(params.table_name || 'unknown').toUpperCase()}] ${params.action_type}`,
        entity_id: params.record_id,
        old_value: params.old_value,
        new_value: params.new_value,
        reason: params.reason
      });

      if (error) {
        console.error('[AuditService] Lỗi ghi log:', error);
      }
    } catch (err) {
      console.error('[AuditService] Lỗi hệ thống khi ghi log:', err);
    }
  }
};
