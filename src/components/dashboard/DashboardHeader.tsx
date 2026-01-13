'use client';

import React from 'react';
import { 
  User, 
  Sun,
  Clock,
  CalendarDays,
  Brush,
  Wrench
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ 
  counts, 
  filters, 
  onToggle
}) => {
  
  const filterItems = [
    { 
      key: 'available' as keyof FilterState, 
      icon: Sun, 
      count: counts.available, 
      activeClass: 'bg-[#155e75] text-white shadow-[#155e75]/50', 
    },
    { 
      key: 'hourly' as keyof FilterState, 
      icon: Clock, 
      count: counts.hourly, 
      activeClass: 'bg-[#f59e0b] text-black shadow-[#f59e0b]/50', 
    },
    { 
      key: 'daily' as keyof FilterState, 
      icon: CalendarDays, 
      count: counts.daily, 
      activeClass: 'bg-[#1e40af] text-white shadow-[#1e40af]/50', 
    },
    { 
      key: 'dirty' as keyof FilterState, 
      icon: Brush, 
      count: counts.dirty, 
      activeClass: 'bg-[#f97316] text-white shadow-[#f97316]/50', 
    },
    { 
      key: 'repair' as keyof FilterState, 
      icon: Wrench, 
      count: counts.repair, 
      activeClass: 'bg-[#1e293b] text-white shadow-[#1e293b]/50', 
    },
  ];

  return (
    <div className="flex flex-col gap-4 mb-6 animate-fade-in">
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

        {/* User Profile */}
        <div className="flex items-center gap-3 pl-4">
          <div className="text-right hidden md:block">
            <p className="text-xs font-bold text-slate-800">Admin</p>
            <p className="text-[10px] font-medium text-slate-400 uppercase">Quản lý</p>
          </div>
          <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-slate-200 shadow-sm active:scale-95 transition-transform">
            <User size={20} className="text-slate-600" />
          </button>
        </div>
      </div>

      {/* Filter Bar - Single Row, No Scroll, Icons Only */}
      <div className="w-full">
         <div className="flex items-center justify-between gap-2 md:gap-3">
            {filterItems.map((f) => (
              <button
                key={f.key}
                onClick={() => onToggle(f.key)}
                className={cn(
                  "flex-1 h-8 md:h-10 rounded-xl transition-all duration-300 flex items-center justify-center relative border shadow-sm",
                  filters[f.key]
                    ? cn("border-transparent shadow-md transform -translate-y-0.5", f.activeClass)
                    : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                )}
              >
                <f.icon size={16} strokeWidth={2.5} />
                
                {/* Badge Count - Prominent & Big */}
                <span className={cn(
                  "absolute -top-2.5 -right-2 md:-top-3 md:-right-3 w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center text-xs md:text-sm font-black border-2 border-[#F8F9FB] shadow-sm z-10",
                  filters[f.key] 
                    ? (f.key === 'hourly' ? "bg-black text-white" : "bg-white text-slate-900") 
                    : "bg-slate-200 text-slate-500"
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
