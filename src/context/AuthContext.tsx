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
          }
        } else if (newProfile) {
          setProfile(newProfile);
        }
      }
    } catch (error) {
      // Catch silently for production
    } finally {
      setLoading(false); // QUÂN LỆNH: Luôn luôn hạ cờ loading dù thành công hay thất bại
    }
  };

  const _handleAuthFailure = async (reason: string) => {
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
      setLoading(false);
    }
  };

  useEffect(() => {
    // QUÂN LỆNH: BỘ ĐẾM TỬ THẦN 5 GIÂY - KHAI THÔNG CỔNG THÀNH
    const gateTimeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
      }
    }, 5000);

    // Check active sessions and sets the user
    const getSession = async () => {
      let retryCount = 0;
      const maxRetries = 2; // Giảm số lần thử để nhanh hơn

      while (retryCount < maxRetries) {
        // 5s safety timeout for session fetch
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Session fetch timeout')), 5000)
        );

        try {
          const sessionPromise = supabase.auth.getSession();
          const sessionResult = await Promise.race([sessionPromise, timeoutPromise]);
          
          if (!sessionResult) {
            throw new Error('Session fetch timeout');
          }

          const {
            data: { session },
          } = sessionResult as any;

          const currentUser = session?.user ?? null;
          setUser(currentUser);

          if (currentUser) {
            await fetchProfile(currentUser);
          }
          // Success -> Exit loop
          break;
        } catch (error: any) {
          retryCount++;

          if (retryCount >= maxRetries) {
            if (error.message === 'Session fetch timeout') {
              _handleAuthFailure('Hết thời gian kết nối');
            }
          } else {
            // Wait 500ms before retry
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }
      setLoading(false);
    };

    getSession();

    // Listen for changes on auth state
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await fetchProfile(currentUser);
        requestForToken();
      } else {
        setProfile(null);
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          router.push('/login');
        }
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(gateTimeout);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]); // THANH TRỪNG VÒNG LẶP: Loại bỏ pathname khỏi dependencies

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
