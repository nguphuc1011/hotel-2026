'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { Profile } from '@/types';
import { useRouter, usePathname } from 'next/navigation';
import { requestForToken } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isStaff: false,
  authError: null,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const fetchProfile = async (currentUser: User) => {
    const userId = currentUser.id;
    try {
      // 1. Kiểm tra xem profile đã tồn tại chưa
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('id, username, full_name, role, permissions')
        .eq('id', userId)
        .maybeSingle();

      if (fetchError) {
        // eslint-disable-next-line no-console
        console.error('Lỗi khi truy vấn hồ sơ:', fetchError.message);
        return;
      }

      if (existingProfile) {
        // ĐẢM BẢO TÀI KHOẢN 'admin' HOẶC EMAIL CÓ CHỮ 'admin' LUÔN CÓ QUYỀN ADMIN
        const isActuallyAdmin =
          existingProfile.username === 'admin' ||
          existingProfile.username?.startsWith('admin@') ||
          currentUser.email === 'admin@gmail.com' || // Hardcoded fallback for safety
          currentUser.email?.startsWith('admin@');

        if (isActuallyAdmin && existingProfile.role !== 'admin') {
          const { data: updatedProfile } = await supabase
            .from('profiles')
            .update({ role: 'admin' })
            .eq('id', userId)
            .select()
            .single();
          if (updatedProfile) {
            setProfile(updatedProfile);
            return;
          }
        }
        setProfile(existingProfile);
        return;
      }

      // 2. Nếu chưa có, tiến hành tạo mới một lần duy nhất
      // eslint-disable-next-line no-console
      console.log('Chưa có hồ sơ, đang khởi tạo hồ sơ Admin mặc định...');
      // currentUser đã được truyền vào, không cần gọi getUser lại

      if (currentUser && currentUser.id === userId) {
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .upsert(
            [
              {
                id: userId,
                username: currentUser.email || userId,
                full_name: 'Quản trị viên',
                role: 'admin',
                permissions: [
                  'MANAGE_STAFF',
                  'VIEW_REPORTS',
                  'MANAGE_ROOMS',
                  'MANAGE_SERVICES',
                  'CHECKIN_OUT',
                ],
              },
            ],
            { onConflict: 'id' }
          )
          .select()
          .maybeSingle();

        if (createError) {
          // Nếu vẫn lỗi trùng (do race condition), thử fetch lại lần cuối
          if (createError.code === '23505') {
            const { data: retryProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .single();
            if (retryProfile) setProfile(retryProfile);
          } else {
            // eslint-disable-next-line no-console
            console.error('Không thể tạo hồ sơ:', createError.message);
          }
        } else if (newProfile) {
          setProfile(newProfile);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Lỗi hệ thống trong AuthContext:', error);
    }
  };

  const _handleAuthFailure = async (reason: string) => {
    // eslint-disable-next-line no-console
    console.error(`[Auth] Authentication failed/timed out: ${reason}`);
    setAuthError(reason);
    try {
      // 1. Clear session from Supabase
      await supabase.auth.signOut();

      // 2. Clear local storage for auth tokens
      if (typeof window !== 'undefined') {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('sb-') || key.includes('auth-token'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
      }

      // 3. Reset states
      setUser(null);
      setProfile(null);
      setLoading(false);

      // 4. Redirect if not already on login page
      if (pathname !== '/login') {
        router.push('/login');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Auth] Error during cleanup:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check active sessions and sets the user
    const getSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          // Bắt đầu fetch profile nhưng không block render chính quá lâu
          fetchProfile(currentUser).finally(() => {
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error('[Auth] Error fetching session:', error);
        setLoading(false);
      }
    };

    getSession();

    // Listen for changes on auth state (logged in, signed out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await fetchProfile(currentUser);
        // TỰ ĐỘNG LẤY VÀ LƯU PUSH TOKEN KHI ĐĂNG NHẬP
        requestForToken();
      } else {
        setProfile(null);
        if (pathname !== '/login') {
          router.push('/login');
        }
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  const isAdmin = profile?.role === 'admin';
  const isStaff =
    profile?.role === 'staff' || profile?.role === 'manager' || profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isStaff, authError }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
