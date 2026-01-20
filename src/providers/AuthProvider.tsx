'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface User {
  id: string;
  username: string;
  full_name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, pin: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => false,
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check local storage for session
    const storedUser = localStorage.getItem('1hotel_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('1hotel_user');
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Auth Guard
    if (!loading) {
      if (!user && pathname !== '/login') {
        router.push('/login');
      } else if (user && pathname === '/login') {
        router.push('/');
      }
    }
  }, [user, loading, pathname, router]);

  const login = async (username: string, pin: string) => {
    try {
      const { data, error } = await supabase.rpc('fn_staff_login', {
        p_username: username,
        p_pin: pin
      });

      if (error) throw error;

      if (data && data.success) {
        const userData = data.data;
        setUser(userData);
        localStorage.setItem('1hotel_user', JSON.stringify(userData));
        toast.success(`Xin chào, ${userData.full_name}`);
        router.push('/');
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
    setUser(null);
    localStorage.removeItem('1hotel_user');
    toast.info('Đã đăng xuất');
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
