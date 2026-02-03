import { supabase } from '@/lib/supabase';

export interface RolePermission {
  role_code: string;
  role_name: string;
  permissions: string[];
}

export const PERMISSION_KEYS = {
  // Money Page
  VIEW_MONEY: 'view_money',
  VIEW_MONEY_BALANCE_CASH: 'view_money_balance_cash',
  VIEW_MONEY_BALANCE_BANK: 'view_money_balance_bank',
  VIEW_MONEY_REVENUE: 'view_money_revenue',
  VIEW_MONEY_EXTRA_FUNDS: 'view_money_extra_funds', // Shows Escrow/Receivable/Revenue blocks
  VIEW_MONEY_EXTRA_FUNDS_RECEIVABLE: 'view_money_extra_funds_receivable', // Specific for debt
  VIEW_MONEY_TOTALS: 'view_money_totals', // NEW: Positive permission. If missing -> Blind Mode (******)

  // Dashboard
  VIEW_DASHBOARD: 'view_dashboard',
  
  // Settings
  VIEW_SETTINGS: 'view_settings',
  VIEW_REPORTS: 'view_reports',
  MANAGE_PERMISSIONS: 'manage_permissions',
  
  // Shift Operations
  SHIFT_FORCE_CLOSE: 'shift_force_close', // Admin/Owner override to close shift
} as const;

export const DEFAULT_ROLES: RolePermission[] = [
  { 
    role_code: 'Admin', 
    role_name: 'Quản trị viên', 
    permissions: ['*'] 
  },
  { 
    role_code: 'Manager', 
    role_name: 'Quản lý', 
    permissions: [
      PERMISSION_KEYS.VIEW_DASHBOARD,
      PERMISSION_KEYS.VIEW_MONEY,
      PERMISSION_KEYS.VIEW_MONEY_BALANCE_CASH,
      PERMISSION_KEYS.VIEW_MONEY_BALANCE_BANK,
      PERMISSION_KEYS.VIEW_MONEY_REVENUE,
      PERMISSION_KEYS.VIEW_MONEY_EXTRA_FUNDS,
      PERMISSION_KEYS.VIEW_MONEY_TOTALS, // Manager can see totals by default
      PERMISSION_KEYS.VIEW_SETTINGS,
      PERMISSION_KEYS.VIEW_REPORTS
    ] 
  },
  { 
    role_code: 'Staff', 
    role_name: 'Nhân viên', 
    permissions: [
      PERMISSION_KEYS.VIEW_DASHBOARD,
      PERMISSION_KEYS.VIEW_MONEY,
      // PERMISSION_KEYS.VIEW_MONEY_TOTALS, // Staff defaults to Blind Mode (Hidden totals)
      PERMISSION_KEYS.VIEW_MONEY_EXTRA_FUNDS_RECEIVABLE
    ] 
  }
];

export const permissionService = {
  async getRolePermissions(roleCode: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permissions')
        .eq('role_code', roleCode)
        .single();
      
      if (error || !data) {
        // Fallback to defaults if table doesn't exist or role not found
        console.warn('Fetching permissions from DB failed, using defaults:', error?.message);
        const defaultRole = DEFAULT_ROLES.find(r => r.role_code === roleCode);
        return defaultRole ? defaultRole.permissions : [];
      }
      
      return data.permissions as string[];
    } catch (err) {
      console.error('Error in getRolePermissions:', err);
      return [];
    }
  },

  async getAllRoles(): Promise<RolePermission[]> {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('*')
      .order('role_code');
      
    if (error) {
       console.warn('Fetching all roles failed, using defaults');
       return DEFAULT_ROLES;
    }
    return data as RolePermission[];
  },

  async updateRolePermissions(roleCode: string, permissions: string[]) {
    // Find role name from DEFAULT_ROLES to satisfy NOT NULL constraint
    const roleDef = DEFAULT_ROLES.find(r => r.role_code === roleCode);
    const roleName = roleDef ? roleDef.role_name : roleCode;

    const { error } = await supabase
      .from('role_permissions')
      .upsert({ 
        role_code: roleCode, 
        role_name: roleName,
        permissions,
        updated_at: new Date().toISOString()
      });
      
    if (error) throw error;
  },

  async updateUserPermissions(userId: string, permissions: string[] | null) {
    const { error } = await supabase
      .from('staff')
      .update({ permissions })
      .eq('id', userId);

    if (error) throw error;
  },
};
