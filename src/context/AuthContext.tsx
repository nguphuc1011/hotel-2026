'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { Profile } from '@/types';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isStaff: false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check active sessions and sets the user
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await fetchProfile(session.user.id);
      }
      setLoading(false);
    };

    getSession();

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        await fetchProfile(currentUser.id);
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

  const fetchProfile = async (userId: string) => {
    try {
      // 1. Kiểm tra xem profile đã tồn tại chưa
      const { data: existingProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (fetchError) {
        console.error('Lỗi khi truy vấn hồ sơ:', fetchError.message);
        return;
      }

      if (existingProfile) {
        setProfile(existingProfile);
        return;
      }

      // 2. Nếu chưa có, tiến hành tạo mới một lần duy nhất
      console.log('Chưa có hồ sơ, đang khởi tạo hồ sơ Admin mặc định...');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user && user.id === userId) {
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .upsert([
            { 
              id: userId, 
              username: user.email || userId, 
              full_name: 'Quản trị viên', 
              role: 'admin',
              permissions: ['MANAGE_STAFF', 'VIEW_REPORTS', 'MANAGE_ROOMS', 'MANAGE_SERVICES', 'CHECKIN_OUT']
            }
          ], { onConflict: 'id' })
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
            console.error('Không thể tạo hồ sơ:', createError.message);
          }
        } else if (newProfile) {
          setProfile(newProfile);
        }
      }
    } catch (error) {
      console.error('Lỗi hệ thống trong AuthContext:', error);
    }
  };

  const isAdmin = profile?.role === 'admin';
  const isStaff = profile?.role === 'staff' || profile?.role === 'manager' || profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isStaff }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
