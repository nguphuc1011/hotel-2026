'use client';

import React, { useState } from 'react';
import { 
  User, 
  Sun,
  Clock,
  CalendarDays,
  Brush,
  Wrench,
  Filter,
  Store,
  ArrowRightLeft,
  LogOut,
  Key,
  X,
  Banknote,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSION_KEYS } from '@/services/permissionService';
import TransactionModal from '@/components/cash-flow/TransactionModal';
import { useParams, useRouter } from 'next/navigation';
import { formatMoney } from '@/utils/format';
import { TrendingUp } from 'lucide-react';

export interface FilterState {
  available: boolean;
  daily: boolean;
  hourly: boolean;
  dirty: boolean;
  repair: boolean;
}

interface DashboardHeaderProps {
  hotelName?: string;
  counts: {
    total: number;
    available: number;
    daily: number;
    hourly: number;
    dirty: number;
    repair: number;
  };
  filters: FilterState;
  onToggle: (key: keyof FilterState) => void;
  onRefresh?: () => Promise<void>;
  loading?: boolean;
  expectedRevenue?: number;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ 
  hotelName,
  counts, 
  filters, 
  onToggle,
  onRefresh,
  loading,
  expectedRevenue = 0
}) => {
  const { user, logout } = useAuth();
  const router = useRouter();
  const params = useParams();
  const slug = params?.slug as string;
  const { can } = usePermission();
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  };
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState(false);
  const [changePinData, setChangePinData] = useState({
    oldPin: '',
    newPin: '',
    confirmPin: ''
  });

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (changePinData.newPin.length !== 4) {
      toast.error('Mã PIN mới phải có đúng 4 số');
      return;
    }
    if (changePinData.newPin !== changePinData.confirmPin) {
      toast.error('Mã PIN xác nhận không khớp');
      return;
    }

    try {
      // 1. Verify Old PIN
      const { data: isValid, error: verifyError } = await supabase.rpc('fn_verify_staff_pin', {
        p_staff_id: user.id,
        p_pin_hash: changePinData.oldPin
      });

      if (verifyError) throw verifyError;
      if (!isValid) {
        toast.error('Mã PIN cũ không chính xác');
        return;
      }

      // 2. Set New PIN
      const { data, error } = await supabase.rpc('fn_manage_staff', {
        p_action: 'SET_PIN',
        p_id: user.id,
        p_pin_hash: changePinData.newPin
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.message);

      toast.success('Đổi mã PIN thành công');
      setIsChangePinModalOpen(false);
      setChangePinData({ oldPin: '', newPin: '', confirmPin: '' });
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
    }
  };

  const filterItems = [
    { 
      key: 'available' as keyof FilterState, 
      label: 'Trống',
      icon: Sun, 
      count: counts.available, 
      activeClass: 'bg-[#155e75] text-white shadow-[#155e75]/50', 
    },
    { 
      key: 'hourly' as keyof FilterState, 
      label: 'Giờ',
      icon: Clock, 
      count: counts.hourly, 
      activeClass: 'bg-[#f59e0b] text-black shadow-[#f59e0b]/50', 
    },
    { 
      key: 'daily' as keyof FilterState, 
      label: 'Ngày',
      icon: CalendarDays, 
      count: counts.daily, 
      activeClass: 'bg-[#1e40af] text-white shadow-[#1e40af]/50', 
    },
    { 
      key: 'dirty' as keyof FilterState, 
      label: 'Dọn',
      icon: Brush, 
      count: counts.dirty, 
      activeClass: 'bg-[#f97316] text-white shadow-[#f97316]/50', 
    },
    { 
      key: 'repair' as keyof FilterState, 
      label: 'Sửa',
      icon: Wrench, 
      count: counts.repair, 
      activeClass: 'bg-[#1e293b] text-white shadow-[#1e293b]/50', 
    },
  ];

  return (
    <div className={cn(
      "w-full flex flex-col gap-1 md:gap-4 mb-1 md:mb-6 animate-fade-in relative z-20",
      "md:relative sticky top-0 bg-white md:bg-transparent px-0 py-0 md:p-0 border-b border-slate-100 md:border-none shadow-sm md:shadow-none"
    )}>
      {/* Mobile/Desktop Header with User Account */}
      <div className="flex justify-between items-center px-2 md:px-0 py-2 md:py-0">
        {/* Logo & Refresh Section */}
        <div className="flex items-center gap-2 md:gap-4">
          <div className="hidden md:flex items-center gap-2 md:gap-3">
            <div className="p-1.5 md:p-2 bg-blue-600 rounded-xl md:rounded-2xl shadow-lg shadow-blue-200">
              <Store className="text-white w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black tracking-tighter text-slate-900 uppercase">
                {hotelName || ''}
              </h1>
            </div>
          </div>

          {/* Nút Cập Nhật (Refresh) */}
          <button 
            onClick={handleRefresh}
            disabled={loading || isRefreshing}
            className={cn(
              "flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 md:px-4 py-2 bg-blue-600 md:bg-white text-white md:text-blue-600 rounded-2xl shadow-lg md:shadow-sm border border-transparent md:border-slate-100",
              "hover:bg-blue-700 md:hover:bg-slate-50 active:scale-95 transition-all duration-200",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <ArrowRightLeft className={cn((isRefreshing || loading) && "animate-spin")} size={18} />
            <span className="text-[9px] md:text-sm font-bold uppercase tracking-tight md:text-slate-700">Cập nhật</span>
          </button>

          {/* Dự thu thực tế trong ngày (Tham khảo) */}
          <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-1.5 md:py-2 bg-emerald-50 border border-emerald-100 rounded-2xl">
            <div className="p-1 md:p-1.5 bg-emerald-500 rounded-lg text-white">
              <TrendingUp size={14} className="md:w-4 md:h-4" />
            </div>
            <div>
              <p className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-emerald-600 leading-none mb-0.5 md:mb-1 whitespace-nowrap">Dự thu</p>
              <p className="text-xs md:text-sm font-black text-slate-900 leading-none">{formatMoney(expectedRevenue)}</p>
            </div>
          </div>
        </div>

        {/* Right Actions: Mobile Filter + Sell Service + User */}
        <div className="flex items-center gap-2 md:gap-4">
          
          {/* Mobile Filter Toggle */}
          <button 
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className={cn(
              "w-12 h-12 md:w-10 md:h-10 rounded-2xl flex flex-col items-center justify-center border shadow-sm transition-all gap-1",
              showMobileFilters 
                ? "bg-slate-900 text-white border-slate-900" 
                : "bg-white text-slate-600 border-slate-200"
            )}
          >
            <Filter size={18} />
            <span className="md:hidden text-[9px] font-bold uppercase tracking-tight">Lọc</span>
          </button>

          {/* Transaction Button */}
          {can(PERMISSION_KEYS.CREATE_TRANSACTION) && (
            <button 
              onClick={() => setIsTransactionModalOpen(true)}
              className="h-12 md:h-10 px-2 md:px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 shadow-lg shadow-blue-600/20 transition-all active:scale-95"
            >
              <Banknote size={18} />
              <span className="text-[9px] md:text-sm font-bold uppercase tracking-tight">Thu Chi</span>
            </button>
          )}

          {/* Sell Service Button */}
          <button 
            onClick={() => toast.info('Tính năng đang phát triển')}
            className="h-12 md:h-10 px-2 md:px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
          >
            <Store size={18} />
            <span className="text-[9px] md:text-sm font-bold uppercase tracking-tight">Bán DV</span>
          </button>

          {/* User Profile */}
          <div className="relative pl-2 border-l border-slate-200">
            <button 
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-3 hover:bg-slate-50 rounded-2xl p-1 pr-3 transition-colors"
            >
              <div className="text-right hidden md:block">
                <p className="text-xs font-bold text-slate-800">{user?.full_name || 'Staff'}</p>
                <p className="text-[10px] font-medium text-slate-400 uppercase">{user?.role || 'Nhân viên'}</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center border border-slate-200 shadow-sm">
                <User size={20} className="text-slate-600" />
              </div>
            </button>

            {/* Dropdown Menu */}
            {isUserMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setIsUserMenuOpen(false)} 
                />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-40 animate-in fade-in zoom-in-95 duration-200">
                  <div className="p-2">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        setIsChangePinModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                      <Key size={16} />
                      Đổi mã PIN
                    </button>
                    <div className="h-px bg-slate-100 my-1" />
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-50 transition-colors"
                    >
                      <LogOut size={16} />
                      Đăng xuất
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className={cn(
        "w-full transition-all duration-300 ease-in-out overflow-hidden",
        // Mobile: Show only if toggled
        showMobileFilters ? "max-h-40 opacity-100" : "max-h-0 opacity-0",
        // Desktop: Always show
        "md:max-h-none md:opacity-100"
      )}>
         <div className="flex flex-wrap items-center justify-start gap-2 pt-2 md:pt-0">
            {filterItems.map((f) => (
              <button
                key={f.key}
                onClick={() => onToggle(f.key)}
                className={cn(
                  "h-8 px-3 rounded-xl transition-all duration-300 flex items-center justify-center relative border shadow-sm gap-2",
                  // Desktop: Small & Left Aligned (w-auto)
                  // Mobile: Stretch a bit for touch target? No, user said small.
                  filters[f.key]
                    ? cn("border-transparent shadow-md transform -translate-y-0.5", f.activeClass)
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                )}
              >
                <f.icon size={14} strokeWidth={2.5} />
                
                <span className="text-xs font-bold uppercase tracking-wide">
                  {f.label}
                </span>

                {/* Badge Count - Inline or slightly offset? 
                    User said "làm cho nhỏ lại". A floating bubble is nice.
                */}
                <span className={cn(
                  "ml-1 h-5 min-w-[20px] px-1 rounded-full flex items-center justify-center text-[10px] font-black border border-white/20",
                  filters[f.key] 
                    ? "bg-white/20 text-current" 
                    : "bg-slate-200 text-slate-600"
                )}>
                  {f.count}
                </span>
              </button>
            ))}
         </div>
      </div>

      {/* Transaction Modal */}
      <TransactionModal 
        isOpen={isTransactionModalOpen}
        onClose={() => setIsTransactionModalOpen(false)}
        onSuccess={() => {
          // No need to refresh data here as dashboard doesn't show transaction list
        }}
      />

      {/* Change PIN Modal */}
      {isChangePinModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                Đổi mã PIN
              </h2>
              <button 
                onClick={() => setIsChangePinModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleChangePin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Mã PIN cũ</label>
                <input 
                  type="password"
                  maxLength={4}
                  value={changePinData.oldPin}
                  onChange={e => setChangePinData({...changePinData, oldPin: e.target.value.replace(/\D/g, '')})}
                  className="w-full p-3 bg-slate-50 rounded-xl border-2 border-transparent focus:border-emerald-500 outline-none font-black text-center text-2xl tracking-[1em]"
                  placeholder="••••"
                  autoFocus
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">PIN Mới</label>
                  <input 
                    type="password"
                    maxLength={4}
                    value={changePinData.newPin}
                    onChange={e => setChangePinData({...changePinData, newPin: e.target.value.replace(/\D/g, '')})}
                    className="w-full p-3 bg-slate-50 rounded-xl border-2 border-transparent focus:border-emerald-500 outline-none font-black text-center text-2xl tracking-[0.5em]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Xác nhận</label>
                  <input 
                    type="password"
                    maxLength={4}
                    value={changePinData.confirmPin}
                    onChange={e => setChangePinData({...changePinData, confirmPin: e.target.value.replace(/\D/g, '')})}
                    className="w-full p-3 bg-slate-50 rounded-xl border-2 border-transparent focus:border-emerald-500 outline-none font-black text-center text-2xl tracking-[0.5em]"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setIsChangePinModalOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 rounded-xl font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
                >
                  Đổi PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(DashboardHeader);
