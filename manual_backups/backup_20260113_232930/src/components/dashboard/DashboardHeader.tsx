'use client';

import React, { useState } from 'react';
import { 
  Filter, 
  ChevronDown, 
  User, 
  Search,
  LayoutGrid
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RoomStatus } from '@/types/dashboard';

interface DashboardHeaderProps {
  counts: {
    total: number;
    available: number;
    occupied: number;
    dirty: number;
    repair: number;
  };
  currentFilter: RoomStatus | 'all';
  onFilterChange: (filter: RoomStatus | 'all') => void;
  onSearch: (query: string) => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ 
  counts, 
  currentFilter, 
  onFilterChange,
  onSearch 
}) => {
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filters: { key: RoomStatus | 'all'; label: string; count: number; color: string }[] = [
    { key: 'all', label: 'Tất cả', count: counts.total, color: 'bg-gray-100 text-gray-600' },
    { key: 'available', label: 'Sẵn sàng', count: counts.available, color: 'bg-cyan-100 text-cyan-700' },
    { key: 'occupied', label: 'Đang ở', count: counts.occupied, color: 'bg-blue-100 text-blue-700' },
    { key: 'dirty', label: 'Chờ dọn', count: counts.dirty, color: 'bg-orange-100 text-orange-700' },
    { key: 'repair', label: 'Bảo trì', count: counts.repair, color: 'bg-slate-100 text-slate-700' },
  ];

  return (
    <div className="flex flex-col gap-6 mb-8 animate-fade-in">
      {/* Top Bar: Brand & User & Global Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        
        {/* Brand */}
        <div>
          <h1 className="text-xl font-black tracking-tighter uppercase text-slate-900">
            Hotel Management
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Sơ đồ phòng trực tuyến
          </p>
        </div>

        {/* Right Side: Search & User */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          {/* Search Bar */}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Tìm số phòng..." 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                onSearch(e.target.value);
              }}
            />
          </div>

          {/* User Profile (Mock) */}
          <div className="flex items-center gap-3 pl-4 border-l border-slate-100">
            <div className="text-right hidden md:block">
              <p className="text-xs font-bold text-slate-800">Bệ Hạ</p>
              <p className="text-[10px] font-medium text-slate-400 uppercase">Admin</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border-2 border-white shadow-sm">
              <User size={20} className="text-slate-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        
        {/* Expandable Filter Group */}
        <div className="flex items-center gap-2 p-1.5 bg-white rounded-[20px] border border-slate-100 shadow-sm overflow-x-auto max-w-full no-scrollbar">
          <button 
            onClick={() => setIsFilterExpanded(!isFilterExpanded)}
            className={cn(
              "p-2.5 rounded-2xl transition-all duration-300 flex items-center gap-2",
              isFilterExpanded ? "bg-slate-800 text-white" : "bg-white text-slate-400 hover:bg-slate-50"
            )}
          >
            <Filter size={18} />
          </button>
          
          <div className="h-6 w-px bg-slate-100 mx-1" />

          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              className={cn(
                "px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-all duration-300 flex items-center gap-2",
                currentFilter === f.key 
                  ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20 scale-105" 
                  : "bg-transparent text-slate-500 hover:bg-slate-50"
              )}
            >
              {f.label}
              <span className={cn(
                "px-1.5 py-0.5 rounded-md text-[9px] min-w-[20px] text-center",
                currentFilter === f.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              )}>
                {f.count}
              </span>
            </button>
          ))}
        </div>

        {/* View Toggle (Placeholder for future List/Grid view) */}
        <button className="hidden md:flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-800 transition-colors">
          <LayoutGrid size={16} />
          <span>Lưới</span>
        </button>
      </div>
    </div>
  );
};

export default DashboardHeader;
