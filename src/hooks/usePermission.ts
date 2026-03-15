import { useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function usePermission(permissionCode?: string) {
  const { user, permissions, modularSettings, isLoading, fetchUser, hasPermission } = useAuthStore();

  useEffect(() => {
    // Luôn fetch nếu chưa có user để tránh trường hợp bị "treo" quyền hạn sau khi login
    if (!user) {
      fetchUser();
    }
  }, [user, fetchUser]);

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
