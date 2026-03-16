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
import ReceivableDetailModal from '@/components/cash-flow/ReceivableDetailModal';

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
  const [isReceivableModalOpen, setIsReceivableModalOpen] = useState(false);
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
              "flex items-center justify-center transition-all duration-300 active:scale-95 disabled:opacity-50",
              "w-10 h-10 md:w-auto md:h-11 md:px-5 rounded-2xl",
              "bg-slate-100 md:bg-white text-slate-600 border border-slate-200/60 md:shadow-sm md:hover:bg-slate-50 md:hover:border-slate-300"
            )}
          >
            <ArrowRightLeft className={cn((isRefreshing || loading) && "animate-spin")} size={18} strokeWidth={2.5} />
            <span className="hidden md:block ml-2 text-sm font-bold tracking-tight">Cập nhật</span>
          </button>

          {/* Dự thu thực tế trong ngày (Tham khảo) */}
          <div 
            onClick={() => setIsReceivableModalOpen(true)}
            className={cn(
              "flex flex-col md:flex-row items-center justify-center cursor-pointer transition-all duration-500 group",
              "px-3 md:px-6 py-1 md:py-2.5 rounded-2xl md:rounded-3xl",
              "bg-white md:bg-white/80 border border-emerald-100 md:border-slate-200/60 md:backdrop-blur-xl",
              "md:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.05)] md:hover:shadow-[0_8px_20px_-2px_rgba(0,0,0,0.08)] md:hover:-translate-y-0.5"
            )}
          >
            <div className="hidden md:flex p-2 bg-emerald-50 text-emerald-600 rounded-2xl mr-3 group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-300">
              <TrendingUp size={18} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col md:block items-center">
              <p className="text-[8px] md:text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 md:text-slate-500 leading-none mb-0.5 md:mb-1 whitespace-nowrap">Dự thu</p>
              <p className="text-sm md:text-lg font-black text-slate-900 leading-none tracking-tight">{formatMoney(expectedRevenue)}</p>
            </div>
          </div>
        </div>

        {/* Right Actions: Mobile Filter + Sell Service + User */}
        <div className="flex items-center gap-2 md:gap-3">
          
          {/* Mobile Filter Toggle */}
          <button 
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className={cn(
              "w-10 h-10 md:w-11 md:h-11 rounded-2xl flex items-center justify-center transition-all duration-300 border",
              showMobileFilters 
                ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/20" 
                : "bg-slate-100 md:bg-white text-slate-600 border-slate-200/60 md:shadow-sm md:hover:bg-slate-50"
            )}
          >
            <Filter size={18} strokeWidth={2.5} />
            <span className="hidden md:block ml-2 text-sm font-bold tracking-tight">Lọc</span>
          </button>

          {/* Transaction Button */}
          {can(PERMISSION_KEYS.CREATE_TRANSACTION) && (
            <button 
              onClick={() => setIsTransactionModalOpen(true)}
              className="h-10 md:h-11 px-3 md:px-5 bg-blue-600 text-white rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 md:shadow-blue-600/10 hover:bg-blue-700 transition-all active:scale-95"
            >
              <Banknote className="hidden md:block" size={18} strokeWidth={2.5} />
              <span className="text-[10px] md:text-sm font-bold tracking-tight">Thu Chi</span>
            </button>
          )}

          {/* Sell Service Button */}
          <button 
            onClick={() => toast.info('Tính năng đang phát triển')}
            className="h-10 md:h-11 px-3 md:px-5 bg-slate-900 text-white rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-slate-900/10 hover:bg-slate-800 transition-all active:scale-95"
          >
            <Store className="hidden md:block" size={18} strokeWidth={2.5} />
            <span className="text-[10px] md:text-sm font-bold tracking-tight">Bán DV</span>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsChangePinModalOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 md:p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-900">ĐỔI MÃ PIN</h2>
                <button onClick={() => setIsChangePinModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handleChangePin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Mã PIN cũ</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={changePinData.oldPin}
                    onChange={(e) => setChangePinData({ ...changePinData, oldPin: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="****"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Mã PIN mới</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={changePinData.newPin}
                    onChange={(e) => setChangePinData({ ...changePinData, newPin: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="****"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Xác nhận PIN mới</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={changePinData.confirmPin}
                    onChange={(e) => setChangePinData({ ...changePinData, confirmPin: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="****"
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200 mt-4"
                >
                  XÁC NHẬN ĐỔI PIN
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {isReceivableModalOpen && (
        <ReceivableDetailModal
          isOpen={isReceivableModalOpen}
          onClose={() => setIsReceivableModalOpen(false)}
        />
      )}
    </div>
  );
};

export default React.memo(DashboardHeader);
