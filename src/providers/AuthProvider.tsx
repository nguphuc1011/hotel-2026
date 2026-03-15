'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';

interface User {
  id: string;
  username: string;
  full_name: string;
  role: string;
  hotel_id: string;
  hotel_slug?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, pin: string, hotelId?: string) => Promise<boolean>;
  logout: () => void;
  updatePin: (oldPin: string, newPin: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => false,
  logout: () => {},
  updatePin: async () => false,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const currentSlug = params?.slug as string;

  const { fetchUser } = useAuthStore();

  useEffect(() => {
    setMounted(true);
    const storedUser = localStorage.getItem('1hotel_user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        const role = (parsedUser.role || '').toLowerCase();
        const hotelId = parsedUser.hotel_id || '';
        document.cookie = `1hotel_session=1; path=/; max-age=${60 * 60 * 24 * 7}`;
        document.cookie = `1hotel_role=${encodeURIComponent(role)}; path=/; max-age=${60 * 60 * 24 * 7}`;
        document.cookie = `1hotel_id=${encodeURIComponent(hotelId)}; path=/; max-age=${60 * 60 * 24 * 7}`;
      } catch (e) {
        localStorage.removeItem('1hotel_user');
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Auth Guard
    if (mounted && !loading) {
      const checkAuth = () => {
        if (pathname.startsWith('/saas-admin')) return;

        const isLoginPage = pathname.endsWith('/login');
        
        // Slug mismatch check: if logged in but on wrong tenant URL
        const isSlugMismatch = user && currentSlug && currentSlug !== 'undefined' && user.hotel_slug && user.hotel_slug.toLowerCase() !== currentSlug.toLowerCase();

        if (!user && !isLoginPage) {
          if (currentSlug && currentSlug !== 'undefined') {
            router.replace(`/${currentSlug}/login`);
          } else {
            router.replace('/login');
          }
        } else if (isSlugMismatch) {
          if (user?.hotel_slug) {
            router.replace(`/${user.hotel_slug}`);
          }
        } else if (user && isLoginPage) {
          const targetSlug = (currentSlug && currentSlug !== 'undefined') ? currentSlug : (user.hotel_slug || 'default');
          router.replace(`/${targetSlug}`);
        }
      };

      const timeoutId = setTimeout(checkAuth, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [user, loading, pathname, router, mounted, currentSlug]);

  const login = async (username: string, pin: string, hotelId?: string) => {
    try {
      const { data, error } = await supabase.rpc('fn_staff_login', {
        p_username: username,
        p_pin: pin,
        p_hotel_id: hotelId || null
      });

      if (error) throw error;

      if (data && data.success) {
        const userData = data.data;
        
        // No need for extra check if we passed p_hotel_id to RPC, but keep it for safety
        if (hotelId && userData.hotel_id !== hotelId) {
          toast.error('Tài khoản không thuộc khách sạn này');
          return false;
        }

        // Fetch slug if not provided
        if (!userData.hotel_slug) {
          const { data: hotel } = await supabase
            .from('hotels')
            .select('slug')
            .eq('id', userData.hotel_id)
            .single();
          if (hotel) userData.hotel_slug = hotel.slug;
        }

        setUser(userData);
        localStorage.setItem('1hotel_user', JSON.stringify(userData));
        const role = (userData.role || '').toLowerCase();
        const hId = userData.hotel_id || '';
        document.cookie = `1hotel_session=1; path=/; max-age=${60 * 60 * 24 * 7}`;
        document.cookie = `1hotel_role=${encodeURIComponent(role)}; path=/; max-age=${60 * 60 * 24 * 7}`;
        document.cookie = `1hotel_id=${encodeURIComponent(hId)}; path=/; max-age=${60 * 60 * 24 * 7}`;
        
        // Cập nhật authStore ngay lập tức để đồng bộ quyền hạn
        await fetchUser();
        
        toast.success(`Xin chào, ${userData.full_name}`);
        const targetSlug = userData.hotel_slug || 'default';
        router.push(`/${targetSlug}`);
        return true;
      } else {
        toast.error(data?.message || 'Đăng nhập thất bại');
        return false;
      }
    } catch (error: any) {
      console.error('Login error:', error);
      const msg = error?.message || error?.error_description || 'Lỗi kết nối Server';
      toast.error(msg);
      return false;
    }
  };

  const logout = () => {
    const slug = user?.hotel_slug || currentSlug;
    setUser(null);
    localStorage.removeItem('1hotel_user');
    document.cookie = '1hotel_session=; path=/; max-age=0';
    document.cookie = '1hotel_role=; path=/; max-age=0';
    document.cookie = '1hotel_id=; path=/; max-age=0';
    toast.info('Đã đăng xuất');
    router.push(slug ? `/${slug}/login` : '/login');
  };

  const updatePin = async (oldPin: string, newPin: string) => {
    if (!user) return false;
    
    try {
        // Verify old PIN
        const { data: isValid, error: verifyError } = await supabase.rpc('fn_verify_staff_pin', {
          p_staff_id: user.id,
          p_pin_hash: oldPin
        });

        if (verifyError) throw verifyError;
        if (!isValid) {
          toast.error('Mã PIN cũ không chính xác');
          return false;
        }

        // Set new PIN
        const { data, error } = await supabase.rpc('fn_manage_staff', {
            p_action: 'SET_PIN',
            p_id: user.id,
            p_pin_hash: newPin
        });

        if (error) throw error;
        if (data && !data.success) throw new Error(data.message);
        
        toast.success('Đổi mã PIN thành công');
        return true;
    } catch (error: any) {
        toast.error('Lỗi: ' + error.message);
        return false;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updatePin }}>
      {children}
    </AuthContext.Provider>
  );
}
