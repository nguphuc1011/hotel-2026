'use client';

import React from 'react';
import { 
  User, 
  LayoutGrid
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
  
  const filterItems: { key: keyof FilterState; label: string; count: number; activeClass: string }[] = [
    { key: 'available', label: 'Trống', count: counts.available, activeClass: 'bg-emerald-500 text-white shadow-emerald-200' },
    { key: 'hourly', label: 'Giờ', count: counts.hourly, activeClass: 'bg-blue-500 text-white shadow-blue-200' },
    { key: 'daily', label: 'Ngày', count: counts.daily, activeClass: 'bg-indigo-500 text-white shadow-indigo-200' },
    { key: 'dirty', label: 'Dọn', count: counts.dirty, activeClass: 'bg-orange-500 text-white shadow-orange-200' },
    { key: 'repair', label: 'Bảo trì', count: counts.repair, activeClass: 'bg-slate-500 text-white shadow-slate-200' },
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

      {/* Filter Bar - Single Row, Scrollable on Mobile */}
      <div className="w-full overflow-x-auto no-scrollbar pb-2">
         <div className="flex items-center gap-3 min-w-max">
            {filterItems.map((f) => (
              <button
                key={f.key}
                onClick={() => onToggle(f.key)}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 border",
                  filters[f.key]
                    ? cn("border-transparent shadow-lg transform -translate-y-0.5", f.activeClass)
                    : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                )}
              >
                {f.label}
                <span className={cn(
                  "px-1.5 py-0.5 rounded-md text-[9px] min-w-[18px] text-center",
                  filters[f.key] ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"
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
