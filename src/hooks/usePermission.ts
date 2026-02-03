import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function usePermission(permissionCode?: string) {
  const { user, permissions, isLoading, fetchUser, hasPermission } = useAuthStore();

  useEffect(() => {
    // Only fetch if not loaded yet (or implement smarter re-fetch logic)
    if (!user && isLoading) {
      fetchUser();
    }
  }, []);

  const can = (code: string) => hasPermission(code);

  return {
    user,
    role: user?.role,
    isLoading,
    can,
    isAllowed: permissionCode ? can(permissionCode) : false
  };
}
