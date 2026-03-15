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
  CREATE_TRANSACTION: 'create_transaction',

  // Dashboard
  VIEW_DASHBOARD: 'view_dashboard',
  
  // Settings
  VIEW_SETTINGS: 'view_settings',
  VIEW_REPORTS: 'view_reports',
  MANAGE_PERMISSIONS: 'manage_permissions',
  
  // Settings Detailed
  VIEW_SETTINGS_GENERAL: 'view_settings_general',
  VIEW_SETTINGS_PRICING: 'view_settings_pricing',
  VIEW_SETTINGS_CATEGORIES: 'view_settings_categories',
  VIEW_SETTINGS_SERVICES: 'view_settings_services',
  VIEW_SETTINGS_CASH_FLOW: 'view_settings_cash_flow',
  VIEW_SETTINGS_SYSTEM: 'view_settings_system',
  
  // Customers
  VIEW_CUSTOMERS: 'view_customers',
  
  // Money Page Extended
  VIEW_MONEY_TRANSACTION_HISTORY: 'view_money_transaction_history',
  VIEW_MONEY_DEBT_LIST: 'view_money_debt_list',
  FINANCE_ADJUST_WALLET: 'finance_adjust_wallet',
  
  // SaaS Admin
  VIEW_SAAS_ADMIN: 'view_saas_admin',
} as const;

export const DEFAULT_ROLES: RolePermission[] = [
  { 
    role_code: 'OWNER', 
    role_name: 'Chủ khách sạn', 
    permissions: ['*'] 
  },
  { 
    role_code: 'Admin', 
    role_name: 'Quản trị viên', 
    permissions: ['*'] 
  },
  { 
    role_code: 'Manager', 
    role_name: 'Quản lý', 
    permissions: ['view_dashboard', 'view_money', 'view_reports', 'view_settings'] 
  },
  { 
    role_code: 'Staff', 
    role_name: 'Nhân viên', 
    permissions: ['view_dashboard'] 
  }
];

export const permissionService = {
  async getRolePermissions(roleCode: string, hotelId?: string): Promise<string[]> {
    try {
      let query = supabase
        .from('role_permissions')
        .select('permissions')
        .eq('role_code', roleCode);
      
      if (hotelId) {
        query = query.eq('hotel_id', hotelId);
      }

      const { data, error } = await query.maybeSingle();
      
      if (error || !data) {
        // Fallback to defaults if table doesn't exist or role not found
        if (error) console.warn('Fetching permissions from DB failed, using defaults:', error.message);
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

  async updateRolePermissions(roleCode: string, permissions: string[], hotelId: string) {
    // Find role name from DEFAULT_ROLES to satisfy NOT NULL constraint
    const roleDef = DEFAULT_ROLES.find(r => r.role_code === roleCode);
    const roleName = roleDef ? roleDef.role_name : roleCode;

    const { error } = await supabase
      .from('role_permissions')
      .upsert({ 
        role_code: roleCode, 
        role_name: roleName,
        permissions,
        hotel_id: hotelId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'role_code, hotel_id'
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
