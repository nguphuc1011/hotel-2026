'use client';

import { useState } from 'react';
import { RoomStatusFilter } from './RoomStatusFilter';
import { 
  UserCircle, 
  LogOut, 
  Settings, 
  ChevronDown, 
  Filter,
  User,
  Key
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator 
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useNotification } from '@/context/NotificationContext';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardHeaderProps {
  activeFilterIds: string[];
  onToggleFilter: (id: string) => void;
  roomCounts: Record<string, number>;
  hotelName?: string;
}

export function DashboardHeader({
  activeFilterIds,
  onToggleFilter,
  roomCounts,
  hotelName = "Hotel Management"
}: DashboardHeaderProps) {
  const { profile } = useAuth();
  const router = useRouter();
  const { showNotification } = useNotification();
  const [showFilters, setShowFilters] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      showNotification('Đã đăng xuất thành công', 'info');
      router.push('/login');
      router.refresh();
    } catch (err: any) {
      showNotification('Lỗi khi đăng xuất', 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Row: Brand & User Actions */}
      <div className="flex items-center justify-between px-2 py-2">
        <div className="flex flex-col">
          <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-none">
            {hotelName}
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            Sơ đồ phòng trực tuyến
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle Filter Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "p-3 rounded-2xl transition-all active:scale-95 flex items-center gap-2",
              showFilters 
                ? "bg-blue-600 text-white shadow-lg shadow-blue-100" 
                : "bg-white text-slate-400 border border-slate-100 shadow-sm"
            )}
          >
            <Filter size={20} className={cn("transition-transform duration-300", showFilters && "rotate-180")} />
            <span className="text-xs font-black uppercase tracking-widest hidden sm:block">Lọc</span>
          </button>

          {/* User Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 p-1.5 pr-3 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-95"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white">
                  <User size={20} />
                </div>
                <div className="flex flex-col items-start hidden sm:flex">
                  <span className="text-[10px] font-black text-slate-900 uppercase leading-tight">
                    {profile?.full_name || 'Nhân viên'}
                  </span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                    {profile?.role === 'admin' ? 'Bệ Hạ' : profile?.role === 'manager' ? 'Quản lý' : 'Lễ tân'}
                  </span>
                </div>
                <ChevronDown size={14} className={cn("text-slate-400 transition-transform", isOpen && "rotate-180")} />
              </button>
            </DropdownMenuTrigger>
            
            <AnimatePresence>
              {isOpen && (
                <DropdownMenuContent className="w-56 mt-2 rounded-[1.5rem] border-slate-100 shadow-2xl p-2 bg-white/95 backdrop-blur-xl animate-in fade-in zoom-in duration-200 origin-top-right">
                  <DropdownMenuLabel className="px-3 py-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tài khoản</p>
                  </DropdownMenuLabel>
                  
                  <DropdownMenuItem 
                    onClick={() => {
                      setIsOpen(false);
                      router.push('/settings/profile');
                    }}
                    className="rounded-xl gap-3 p-3"
                  >
                    <UserCircle size={18} className="text-blue-500" />
                    <span className="font-bold text-sm">Hồ sơ cá nhân</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem 
                    onClick={() => {
                      setIsOpen(false);
                      router.push('/settings/profile?tab=password');
                    }}
                    className="rounded-xl gap-3 p-3"
                  >
                    <Key size={18} className="text-amber-500" />
                    <span className="font-bold text-sm">Đổi mật khẩu</span>
                  </DropdownMenuItem>

                  {(profile?.role === 'admin' || profile?.role === 'manager') && (
                    <DropdownMenuItem 
                      onClick={() => {
                        setIsOpen(false);
                        router.push('/settings');
                      }}
                      className="rounded-xl gap-3 p-3"
                    >
                      <Settings size={18} className="text-slate-500" />
                      <span className="font-bold text-sm">Cài đặt hệ thống</span>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator className="my-2 bg-slate-50" />
                  
                  <DropdownMenuItem 
                    onClick={() => {
                      setIsOpen(false);
                      handleLogout();
                    }}
                    className="rounded-xl gap-3 p-3 text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut size={18} />
                    <span className="font-black uppercase tracking-widest text-xs">Đăng xuất</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              )}
            </AnimatePresence>
          </DropdownMenu>
        </div>
      </div>

      {/* Expandable Filter Row */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: -10 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "circOut" }}
            className="overflow-hidden px-1"
          >
            <RoomStatusFilter 
              activeFilterIds={activeFilterIds}
              onToggleFilter={onToggleFilter}
              roomCounts={roomCounts}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
