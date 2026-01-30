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
  ArrowRightLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ApprovalNotification from './ApprovalNotification';

export interface FilterState {
  available: boolean;
  daily: boolean;
  hourly: boolean;
  dirty: boolean;
  repair: boolean;
}

interface DashboardHeaderProps {
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
  onHandoverClick: () => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ 
  counts, 
  filters, 
  onToggle,
  onHandoverClick
}) => {
  const [showMobileFilters, setShowMobileFilters] = useState(false);

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
    <div className="flex flex-col gap-4 mb-6 animate-fade-in relative z-20">
      {/* Mobile/Desktop Header with User Account */}
      <div className="flex justify-between items-center">
        {/* Brand/Title */}
        <div>
          <h1 className="text-xl font-black tracking-tighter uppercase text-slate-900">
            Sơ Đồ Phòng
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:block">
            Quản lý trực quan
          </p>
        </div>

        {/* Right Actions: Mobile Filter + Sell Service + User */}
        <div className="flex items-center gap-2 md:gap-4">
          
          <button
            onClick={onHandoverClick}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-200"
          >
            <ArrowRightLeft size={18} />
            <span className="text-sm font-bold hidden md:inline">Giao ca</span>
          </button>

          {/* Mobile Filter Toggle */}
          <button 
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className={cn(
              "md:hidden w-10 h-10 rounded-2xl flex items-center justify-center border shadow-sm transition-all",
              showMobileFilters 
                ? "bg-slate-900 text-white border-slate-900" 
                : "bg-white text-slate-600 border-slate-200"
            )}
          >
            <Filter size={18} />
          </button>

          {/* Sell Service Button */}
          <button 
            onClick={() => toast.info('Tính năng đang phát triển')}
            className="h-10 px-3 md:px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
          >
            <Store size={18} />
            <span className="hidden md:inline font-bold text-sm">Bán DV tại quầy</span>
          </button>

          {/* User Profile */}
          <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
            <div className="text-right hidden md:block">
              <p className="text-xs font-bold text-slate-800">Admin</p>
              <p className="text-[10px] font-medium text-slate-400 uppercase">Quản lý</p>
            </div>
            <button className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center border border-slate-200 shadow-sm active:scale-95 transition-transform">
              <User size={20} className="text-slate-600" />
            </button>
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
    </div>
  );
};

export default DashboardHeader;
