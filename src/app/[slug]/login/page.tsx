'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { Key, User, ArrowRight, Building2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hotelInfo, setHotelInfo] = useState<{name: string, id: string} | null>(null);
  const { login } = useAuth();
  const params = useParams();
  const slug = params?.slug as string;

  useEffect(() => {
    const fetchHotelInfo = async () => {
      if (!slug) return;
      try {
        const { data, error } = await supabase
          .from('hotels')
          .select('id, name')
          .eq('slug', slug)
          .single();
        
        if (data) {
          setHotelInfo(data);
        }
      } catch (error) {
        console.error('Failed to fetch hotel info', error);
      }
    };
    fetchHotelInfo();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !pin) return;
    
    setIsSubmitting(true);
    // Khi login, ta truyền thêm hotel_id để verify đúng hotel
    await login(username, pin, hotelInfo?.id); 
    setIsSubmitting(false);
  };

  const handleForceReset = () => {
    localStorage.removeItem('1hotel_user');
    document.cookie = '1hotel_session=; path=/; max-age=0';
    document.cookie = '1hotel_role=; path=/; max-age=0';
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-[32px] shadow-xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 md:p-12">
          {/* ... existing content ... */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-black-italic tracking-tighter flex flex-col items-center justify-center gap-1 mb-2 text-accent">
              MANA PMS
              {hotelInfo?.name && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                    <Building2 size={16} />
                  </div>
                  <span className="text-sm font-bold text-slate-500 not-italic tracking-wider uppercase">
                    {hotelInfo.name}
                  </span>
                </div>
              )}
            </h1>
            <p className="text-slate-500 font-medium text-sm">Đăng nhập hệ thống</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Tên đăng nhập</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <User size={20} />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-14 pl-12 pr-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-accent rounded-2xl font-bold text-slate-800 outline-none transition-all"
                  placeholder="Username hoặc Số điện thoại..."
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Mã PIN</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Key size={20} />
                </div>
                <input
                  type="text"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full h-14 pl-12 pr-4 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-accent rounded-2xl font-bold text-slate-800 outline-none transition-all mask-disc"
                  placeholder="Nhập mã PIN..."
                  maxLength={4}
                  autoComplete="off"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !username || !pin}
              className="w-full h-14 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:hover:bg-accent text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-accent/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] mt-4"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Đăng nhập <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        </div>
        
        <div className="p-6 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400 font-medium">
            Nếu quên mã PIN, vui lòng liên hệ quản trị viên.
          </p>
        </div>
      </div>
      
      <button 
        onClick={handleForceReset}
        className="mt-8 text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-widest transition-colors"
      >
        Lỗi truy cập? Nhấp vào đây để Reset
      </button>
    </div>
  );
}
