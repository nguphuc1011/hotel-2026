import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { permissionService } from '@/services/permissionService';

interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  role: string;
}

interface AuthState {
  user: UserProfile | null;
  permissions: string[];
  isLoading: boolean;
  
  // Actions
  fetchUser: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  // We need an async checker for modular permissions?
  // Ideally, we load all modular state into store at once.
  // But for now, let's keep it simple. `hasPermission` is synchronous for UI rendering.
  // We can load modular settings into the store as well.
  
  modularSettings: Record<string, any>; // Cache modular settings
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  permissions: [],
  modularSettings: {},
  isLoading: true,

  fetchUser: async () => {
    set({ isLoading: true });
    try {
      // Try to get user from localStorage first (Custom Auth)
      let userId = '';
      const storedUserStr = localStorage.getItem('1hotel_user');
      
      if (storedUserStr) {
        try {
          const storedUser = JSON.parse(storedUserStr);
          userId = storedUser.id;
        } catch (e) {
          console.error('Error parsing stored user', e);
        }
      }

      // If not in localStorage, try Supabase Auth (Fallback)
      if (!userId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) userId = user.id;
      }
      
      if (!userId) {
        set({ user: null, permissions: [], isLoading: false });
        return;
      }

      // 1. Get Profile & Role
      const { data: profile } = await supabase
        .from('staff')
        .select('id, username, full_name, role, permissions')
        .eq('id', userId)
        .single();
        
      if (!profile) {
         console.warn('User logged in but no staff profile found');
         set({ user: null, permissions: [], isLoading: false });
         return;
      }

      // 2. Load Modular Settings Cache
      const { data: modSettings } = await supabase.from('permission_settings').select('*');
      const settingsMap: Record<string, any> = {};
      if (modSettings) {
        modSettings.forEach(s => settingsMap[s.module_id] = s);
      }

      // 3. Get Base Permissions (Role-based only)
      let finalPermissions: string[] = [];
      
      // Force Admin to have * permissions regardless of DB state
      if (profile.role.toLowerCase() === 'admin') {
        finalPermissions = ['*'];
      } else {
        // ALWAYS fetch from Role Permissions (Functional Permissions)
        // Ignoring individual profile.permissions as per new requirement
        finalPermissions = await permissionService.getRolePermissions(profile.role);
      }
      
      set({ 
        user: profile, 
        permissions: finalPermissions, 
        modularSettings: settingsMap,
        isLoading: false 
      });

    } catch (error) {
      console.error('Auth store fetch error:', error);
      set({ isLoading: false });
    }
  },

  hasPermission: (permission: string) => {
    const { permissions, user, modularSettings } = get();
    if (!user) return false;

    // 0. Admin Bypass
    if (user.role.toLowerCase() === 'admin') return true;

    // 1. Identify Module for this permission
    let moduleId = '';
    if (permission.includes('money')) moduleId = 'money';
    else if (permission.includes('dashboard')) moduleId = 'dashboard';
    else if (permission.includes('settings') || permission.includes('manage_permissions')) moduleId = 'settings';
    
    // 2. Check Modular Logic (Only if configured in 3-tier matrix)
    // If no 3-tier setting exists, it falls through to Standard RBAC
    if (moduleId && modularSettings[moduleId]) {
      const setting = modularSettings[moduleId];
      const isExcepted = setting.exceptions?.includes(user.id);

      // PRIORITY 1: EXCEPTION
      if (isExcepted) return true;

      // PRIORITY 2: MASTER SWITCH
      // If module is OFF, deny unless exception
      if (setting.is_enabled === false) return false;
      
      // PRIORITY 3: 3-Tier Matrix Policies (ALLOW/DENY/PIN/APPROVAL)
      // Check if there is a specific policy for this action
      // Currently, `permission_settings` table stores `actions` map
      if (setting.actions && setting.actions[permission]) {
        const actionPolicy = setting.actions[permission];
        
        // Check User Specific Policy
        if (actionPolicy.user_policies && actionPolicy.user_policies[user.id]) {
           const userPol = actionPolicy.user_policies[user.id];
           if (userPol === 'DENY') return false;
           if (userPol === 'ALLOW') return true;
           // For PIN/APPROVAL, we might treat as ALLOW here (and UI asks for PIN), or handle specifically.
           // For simple `hasPermission` check (visibility), PIN/APPROVAL usually means VISIBLE (true).
           // The actual action execution will re-verify.
           return true; 
        }

        // Check Role Policy
        if (actionPolicy.role_policies && actionPolicy.role_policies[user.role]) {
           const rolePol = actionPolicy.role_policies[user.role];
           if (rolePol === 'DENY') return false;
           // ALLOW/PIN/APPROVAL -> Visible
           return true;
        }

        // Check Default/Global Policy
        if (actionPolicy.default === 'DENY' || actionPolicy.global_policy === 'DENY') return false;
      }
    }

    // 3. Standard RBAC (Functional Permissions)
    // This is the fallback if 3-tier doesn't explicitly block it
    if (permissions.includes('*')) return true;
    return permissions.includes(permission);
  }
}));
