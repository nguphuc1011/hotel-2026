'use client';

import { Room } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Clock, Moon, Sun, User, Sparkles, Wrench, CheckCircle2 } from 'lucide-react';

interface RoomCardProps {
  room: Room;
  onClick?: (room: Room) => void;
}

const statusConfig = {
  available: {
    label: 'Trống',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100/50',
    border: 'border-emerald-200',
    shadow: 'shadow-emerald-500/10',
  },
  hourly: {
    label: 'Theo giờ',
    icon: Clock,
    color: 'text-blue-600',
    bg: 'bg-blue-100/50',
    border: 'border-blue-200',
    shadow: 'shadow-blue-500/10',
  },
  daily: {
    label: 'Theo ngày',
    icon: Sun,
    color: 'text-indigo-600',
    bg: 'bg-indigo-100/50',
    border: 'border-indigo-200',
    shadow: 'shadow-indigo-500/10',
  },
  overnight: {
    label: 'Qua đêm',
    icon: Moon,
    color: 'text-purple-600',
    bg: 'bg-purple-100/50',
    border: 'border-purple-200',
    shadow: 'shadow-purple-500/10',
  },
  dirty: {
    label: 'Chờ dọn',
    icon: Sparkles,
    color: 'text-amber-600',
    bg: 'bg-amber-100/50',
    border: 'border-amber-200',
    shadow: 'shadow-amber-500/10',
  },
  repair: {
    label: 'Sửa chữa',
    icon: Wrench,
    color: 'text-rose-600',
    bg: 'bg-rose-100/50',
    border: 'border-rose-200',
    shadow: 'shadow-rose-500/10',
  },
};

export function RoomCard({ room, onClick }: RoomCardProps) {
  const config = statusConfig[room.status] || statusConfig.available;
  const Icon = config.icon;

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick?.(room)}
      className={cn(
        "relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[24px] border p-6 text-left transition-all duration-300",
        "bg-white dark:bg-zinc-900",
        config.border,
        config.shadow,
        "shadow-lg hover:shadow-xl"
      )}
    >
      {/* Background Gradient Splash */}
      <div className={cn("absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-3xl", config.bg.replace('/50', ''))} />

      <div className="z-10 flex w-full items-start justify-between">
        <div className="flex flex-col">
          <span className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
            {room.room_number}
          </span>
          <span className="text-sm font-medium text-zinc-400">
            {room.room_type} • {room.area}
          </span>
        </div>
        <div className={cn("rounded-full p-2.5 backdrop-blur-md", config.bg, config.color)}>
          <Icon size={24} strokeWidth={2.5} />
        </div>
      </div>

      <div className="z-10 mt-6 space-y-1">
        <div className="flex items-center justify-between">
          <span className={cn("text-xs font-bold uppercase tracking-wider", config.color)}>
            {config.label}
          </span>
        </div>
        
        {/* Dynamic Price Display */}
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {formatCurrency(room.prices?.hourly || 0)}
          </span>
          <span className="text-xs text-zinc-400">/ giờ đầu</span>
        </div>
      </div>
    </motion.button>
  );
}
