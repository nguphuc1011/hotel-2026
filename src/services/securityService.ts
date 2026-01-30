import { supabase } from '@/lib/supabase';

export type SecurityAction = 
  | 'checkin_custom_price'
  | 'checkin_cancel_booking'
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

export type PolicyType = 'ALLOW' | 'PIN' | 'APPROVAL' | 'DENY';

export const securityService = {
  /**
   * Resolve the effective policy for the current user and action
   * Uses the "3-in-1" logic: User Override > Role Override > Global Setting
   */
  async getPolicy(action: SecurityAction): Promise<PolicyType> {
    // Try to get user from localStorage (custom AuthProvider)
    let staffId: string | null = null;
    try {
      const storedUser = localStorage.getItem('1hotel_user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        staffId = user.id;
      }
    } catch (e) {
      console.error('Error reading user from localStorage:', e);
    }

    // Fallback to Supabase Auth if available
    if (!staffId) {
      const { data: { user } } = await supabase.auth.getUser();
      staffId = user?.id || null;
    }

    if (!staffId) {
      console.warn(`[Security] No staff ID found for ${action}, falling back to PIN`);
      return 'PIN'; 
    }

    const { data, error } = await supabase.rpc('fn_resolve_policy', {
      p_staff_id: staffId,
      p_action_key: action
    });

    if (error) {
      console.error(`[Security] Error resolving policy for ${action}:`, error);
      return 'PIN'; // Fail safe
    }

    console.log(`[Security] Policy for ${action} (User: ${staffId}): ${data}`);
    return data as PolicyType;
  },

  /**
   * DEPRECATED: Use getPolicy() instead.
   * Kept for backward compatibility.
   * Returns true if the action requires any form of security interaction (PIN or APPROVAL).
   */
  async checkActionRequiresPin(action: SecurityAction): Promise<boolean> {
    const policy = await this.getPolicy(action);
    return policy === 'PIN' || policy === 'APPROVAL';
  },

  /**
   * Verify staff PIN (Local Security)
   */
  async verifyPin(staffId: string, pin: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('fn_verify_staff_pin', {
      p_staff_id: staffId,
      p_pin_hash: pin
    });

    if (error) {
      console.error('Error verifying PIN:', error);
      return false;
    }

    return !!data;
  },

  /**
   * Create an approval request (Remote Approval)
   */
  async createApprovalRequest(action: SecurityAction, requestData: any = {}) {
    // Try to get staffId from localStorage
    let staffId: string | null = null;
    try {
      const storedUser = localStorage.getItem('1hotel_user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        staffId = user.id;
      }
    } catch (e) {}

    const { data, error } = await supabase.rpc('fn_create_approval_request', {
      p_action_key: action,
      p_request_data: requestData,
      p_staff_id: staffId
    });

    if (error) throw error;
    return data; // { success: true, approval_id: '...' }
  },

  /**
   * Approve a request (Manager Override or Telegram)
   */
  async approveRequest(requestId: string, managerPin?: string) {
    const { data, error } = await supabase.rpc('fn_approve_request', {
      p_manager_id: null,
      p_manager_pin: managerPin ? String(managerPin) : null,
      p_method: managerPin ? 'PIN_OVERRIDE' : 'TELEGRAM',
      p_request_id: String(requestId)
    });

    if (error) throw error;
    return data;
  },

  /**
   * Check status of an approval request (Polling)
   */
  async checkApprovalStatus(requestId: string) {
    const { data, error } = await supabase.rpc('fn_check_approval_status', {
      p_request_id: requestId
    });

    if (error) throw error;
    return data; // { status: 'PENDING' | 'APPROVED' | 'REJECTED', approved_by_id: '...', approved_by_name: '...' }
  },

  /**
   * Get all security settings (for Admin UI)
   */
  async getAllSecuritySettings() {
    const { data, error } = await supabase.rpc('fn_get_security_matrix');
    if (error) throw error;
    return data;
  }
};
