import { useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function usePermission(permissionCode?: string) {
  const { user, permissions, modularSettings, isLoading, fetchUser, hasPermission } = useAuthStore();

  useEffect(() => {
    // Only fetch if not loaded yet (or implement smarter re-fetch logic)
    if (!user && isLoading) {
      fetchUser();
    }
  }, []);

  // Stabilize 'can' function to prevent infinite loops in useEffect dependencies
  const can = useCallback((code: string) => hasPermission(code), [hasPermission, user, permissions, modularSettings]);

  return {
    user,
    role: user?.role,
    isLoading,
    can,
    isAllowed: permissionCode ? can(permissionCode) : false
  };
}
