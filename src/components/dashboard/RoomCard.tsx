'use client';

import { Room } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';
import { motion } from 'framer-motion';
import { 
  CheckCircle, 
  User, 
  Sun, 
  Moon, 
  Brush, 
  Wrench, 
  Coins, 
  Clock 
} from 'lucide-react';
import { differenceInHours, differenceInMinutes } from 'date-fns';
import { useMemo, useEffect, useState } from 'react';

interface RoomCardProps {
  room: Room;
  onClick?: (room: Room) => void;
}

const statusConfig = {
  available: {
    label: 'Sẵn sàng',
    color: 'bg-[#155e75]', // Cyan 800
    icon: CheckCircle,
    textColor: 'text-white'
  },
  hourly: {
    label: 'Khách giờ',
    color: 'bg-[#f59e0b]', // Amber 500
    icon: User,
    textColor: 'text-black'
  },
  daily: {
    label: 'Khách ngày',
    color: 'bg-[#1e40af]', // Blue 800
    icon: Sun,
    textColor: 'text-white'
  },
  overnight: {
    label: 'Qua đêm',
    color: 'bg-[#1e40af]', // Blue 800 (Shared with daily)
    icon: Moon,
    textColor: 'text-white'
  },
  dirty: {
    label: 'Chờ dọn',
    color: 'bg-[#f97316]', // Orange 500
    icon: Brush,
    textColor: 'text-white'
  },
  repair: {
    label: 'Đang sửa',
    color: 'bg-[#1e293b]', // Slate 800
    icon: Wrench,
    textColor: 'text-white'
  },
};

export function RoomCard({ room, onClick }: RoomCardProps) {
  const config = statusConfig[room.status] || statusConfig.available;
  const BgIcon = config.icon;
  const [duration, setDuration] = useState('');

  // Calculate duration for occupied rooms
  useEffect(() => {
    if (room.status === 'available' || !room.current_booking?.check_in_at) return;

    const updateDuration = () => {
      const start = new Date(room.current_booking!.check_in_at);
      const now = new Date();
      const hours = differenceInHours(now, start);
      const minutes = differenceInMinutes(now, start) % 60;
      setDuration(`${hours}h ${minutes}p`);
    };

    updateDuration();
    const interval = setInterval(updateDuration, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [room.status, room.current_booking]);

  const isOccupied = ['hourly', 'daily', 'overnight'].includes(room.status);

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick?.(room)}
      className={cn(
        "group relative flex w-full flex-col justify-between overflow-hidden p-6 transition-all shadow-lg hover:shadow-2xl",
        "h-[200px] sm:h-[256px]", // Height: Mobile 200px, Desktop 256px
        "rounded-[2rem]", // Super large radius
        config.color,
        config.textColor
      )}
    >
      {/* Background Icon */}
      <div className="absolute -bottom-8 -right-8 transition-transform duration-500 group-hover:scale-110">
        <BgIcon 
          size={160} // text-[10rem] approx 160px
          className="opacity-10" 
          strokeWidth={1}
        />
      </div>

      {/* Header: Room Number & Badge */}
      <div className="z-10 flex w-full items-start justify-between">
        <span className="text-5xl font-black tracking-tighter">
          {room.room_number}
        </span>
        <span className={cn(
          "rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider backdrop-blur-md",
          "bg-black/10"
        )}>
          {room.room_type}
        </span>
      </div>

      {/* Footer: Data Display */}
      <div className="z-10 mt-auto">
        {isOccupied ? (
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm font-bold italic uppercase opacity-60">
              {room.current_booking?.customer?.full_name || 'Khách vãng lai'}
            </span>
            <div className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-1.5 backdrop-blur-sm">
              <Clock className="animate-pulse" size={16} />
              <span className="font-mono text-lg font-bold">{duration}</span>
            </div>
          </div>
        ) : room.status === 'available' ? (
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-white/20 p-2 backdrop-blur-sm">
              <Coins size={20} className="text-white" />
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="text-xs opacity-80">Giá giờ đầu</span>
              <span className="text-lg font-bold">
                {formatCurrency(room.prices?.hourly || 0)}
              </span>
            </div>
          </div>
        ) : (
          // Dirty/Repair state
          <div className="flex items-center gap-2 opacity-80">
            <span className="text-sm font-medium uppercase tracking-widest">
              {config.label}
            </span>
          </div>
        )}
      </div>
    </motion.button>
  );
}
