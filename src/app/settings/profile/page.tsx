'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useNotification } from '@/context/NotificationContext';
import { Profile } from '@/types';
import { motion } from 'framer-motion';
import { 
  User, 
  Mail, 
  Phone, 
  Shield, 
  LogOut, 
  Camera, 
  ChevronRight, 
  Key, 
  Bell, 
  Globe,
  CheckCircle2,
  ChevronLeft,
  Save
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const { showNotification } = useNotification();
  const router = useRouter();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error: any) {
      console.error('Error fetching profile:', error);
      showNotification('Không thể tải thông tin cá nhân', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      showNotification('Mật khẩu phải từ 6 ký tự trở lên', 'warning');
      return;
    }

    try {
      setIsUpdating(true);
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;
      
      showNotification('Đã đổi mật khẩu thành công!', 'success');
      setNewPassword('');
    } catch (error: any) {
      showNotification(error.message || 'Lỗi khi đổi mật khẩu', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      showNotification('Đã đăng xuất thành công', 'info');
      router.push('/login');
      router.refresh();
    } catch (error: any) {
      showNotification('Lỗi khi đăng xuất', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-bold animate-pulse">Đang tải hồ sơ...</p>
      </div>
    );
  }

  const roleInfo = {
    admin: { label: 'Quản trị viên', color: 'bg-rose-500', icon: Shield },
    manager: { label: 'Quản lý', color: 'bg-amber-500', icon: Shield },
    staff: { label: 'Lễ tân', color: 'bg-blue-500', icon: User },
  };

  const currentRole = profile?.role ? roleInfo[profile.role] : roleInfo.staff;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-24 rounded-b-[3rem] shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-600/5 to-transparent pointer-events-none" />
        
        <div className="flex items-center justify-between relative z-10 mb-8">
          <Link href="/settings" className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
            <ChevronLeft className="w-6 h-6 text-slate-600" />
          </Link>
          <h1 className="text-xl font-black text-slate-800">Hồ sơ cá nhân</h1>
          <button 
            onClick={handleLogout}
            className="p-2 bg-rose-50 text-rose-600 rounded-full hover:bg-rose-100 transition-colors"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col items-center relative z-10">
          <div className="relative">
            <div className="w-24 h-24 bg-slate-200 rounded-[2rem] flex items-center justify-center overflow-hidden border-4 border-white shadow-xl">
              <User className="w-12 h-12 text-slate-400" />
            </div>
            <button className="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-xl shadow-lg border-2 border-white">
              <Camera className="w-4 h-4" />
            </button>
          </div>
          
          <h2 className="mt-4 text-2xl font-black text-slate-800">{profile?.full_name}</h2>
          <div className={cn(
            "mt-2 px-4 py-1 rounded-full text-white text-xs font-bold flex items-center gap-1.5",
            currentRole.color
          )}>
            <currentRole.icon className="w-3 h-3" />
            {currentRole.label}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 -mt-12 space-y-6 relative z-20">
        {/* Account Info */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 space-y-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider ml-1">Thông tin cơ bản</h3>
          
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                <Mail className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Email / Username</p>
                <p className="font-bold text-slate-700">{profile?.username}</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>

            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                <Phone className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Số điện thoại</p>
                <p className="font-bold text-slate-700">{profile?.phone || 'Chưa cập nhật'}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300" />
            </div>
          </div>
        </div>

        {/* Security & Settings */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 space-y-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider ml-1">Đổi mật khẩu</h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Mật khẩu mới</label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nhập ít nhất 6 ký tự"
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800"
                />
              </div>
            </div>

            <button 
              onClick={handleUpdatePassword}
              disabled={isUpdating}
              className={cn(
                "w-full py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95",
                isUpdating && "opacity-50"
              )}
            >
              {isUpdating ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Cập nhật mật khẩu
                </>
              )}
            </button>
          </div>
        </div>

        {/* Other Settings */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 space-y-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider ml-1">Thông báo & Ngôn ngữ</h3>
          
          <div className="space-y-2">
            <button className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl transition-colors text-left group">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center group-hover:bg-white transition-colors">
                <Bell className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-slate-700">Thông báo</p>
                <p className="text-xs text-slate-400">Quản lý kênh nhận tin</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300" />
            </button>

            <button className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl transition-colors text-left group">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center group-hover:bg-white transition-colors">
                <Globe className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-slate-700">Ngôn ngữ</p>
                <p className="text-xs text-slate-400">Tiếng Việt (Mặc định)</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <button 
          onClick={handleLogout}
          className="w-full p-6 bg-rose-50 text-rose-600 rounded-[2rem] font-bold flex items-center justify-center gap-3 hover:bg-rose-100 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Đăng xuất khỏi hệ thống
        </button>
      </div>
    </div>
  );
}
