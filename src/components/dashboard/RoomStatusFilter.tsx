'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { 
  CheckCircle, 
  User, 
  Sun, 
  Brush, 
  Wrench,
  Clock
} from 'lucide-react';
import { RoomStatus } from '@/types';

interface StatusFilter {
  id: string;
  label: string;
  statuses: RoomStatus[];
  color: string;
  icon: any;
}

const statusFilters: StatusFilter[] = [
  {
    id: 'available',
    label: 'Trống',
    statuses: ['available'],
    color: 'bg-slate-900',
    icon: CheckCircle
  },
  {
    id: 'hourly',
    label: 'Giờ',
    statuses: ['hourly'],
    color: 'bg-slate-900',
    icon: Clock
  },
  {
    id: 'daily',
    label: 'Ngày',
    statuses: ['daily', 'overnight'],
    color: 'bg-slate-900',
    icon: Sun
  },
  {
    id: 'dirty',
    label: 'Dơ',
    statuses: ['dirty'],
    color: 'bg-slate-900',
    icon: Brush
  },
  {
    id: 'repair',
    label: 'Sửa',
    statuses: ['repair'],
    color: 'bg-slate-900',
    icon: Wrench
  }
];

interface RoomStatusFilterProps {
  activeFilterIds: string[];
  onToggleFilter: (id: string) => void;
  roomCounts: Record<string, number>;
}

export function RoomStatusFilter({ activeFilterIds, onToggleFilter, roomCounts }: RoomStatusFilterProps) {
  return (
    <div className="flex items-center justify-around bg-white/90 backdrop-blur-xl rounded-[2.5rem] py-3 px-2 shadow-[0_15px_40px_rgba(0,0,0,0.04)] border border-white/50">
      {statusFilters.map((filter) => {
        const isActive = activeFilterIds.includes(filter.id);
        const count = filter.id === 'daily' 
          ? (roomCounts['daily'] || 0) + (roomCounts['overnight'] || 0)
          : roomCounts[filter.id] || 0;

        return (
          <motion.button
            key={filter.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => onToggleFilter(filter.id)}
            className="relative flex flex-col items-center gap-1.5 px-1 min-w-[64px]"
          >
            {/* Icon Container */}
            <div className={cn(
              "relative p-2.5 rounded-[1.25rem] transition-all duration-500",
              isActive 
                ? "bg-slate-100 text-slate-600 scale-105" 
                : "text-slate-300 hover:text-slate-400"
            )}>
              <filter.icon 
                size={22} 
                strokeWidth={isActive ? 2 : 1.5} 
                className="transition-transform duration-500"
              />
              
              {/* Badge - High-end Apple Style */}
              {count > 0 && (
                <div className={cn(
                  "absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white px-1 text-[9px] font-bold shadow-sm transition-all duration-500",
                  isActive 
                    ? "bg-slate-500 text-white translate-y-[-1px] translate-x-[1px]" 
                    : "bg-slate-100 text-slate-400"
                )}>
                  {count}
                </div>
              )}
            </div>

            {/* Label */}
            <span className={cn(
              "text-[10px] font-bold tracking-tight transition-colors duration-300 uppercase",
              isActive ? "text-slate-600" : "text-slate-300"
            )}>
              {filter.label}
            </span>

            {/* Active Indicator Dot */}
            {isActive && (
              <motion.div 
                layoutId="activeDot"
                className="absolute -bottom-1 h-1 w-1 rounded-full bg-slate-400"
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
