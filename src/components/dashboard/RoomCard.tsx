'use client';

import { Room, Setting } from '@/types';
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
  Clock,
  DollarSign,
  AlertTriangle,
  StickyNote,
  Check
} from 'lucide-react';
import { differenceInHours, differenceInMinutes, differenceInCalendarDays } from 'date-fns';
import { useMemo, useEffect, useState, useCallback } from 'react';
import { calculateRoomPrice } from '@/lib/pricing';

interface RoomCardProps {
  room: Room;
  settings: Setting[];
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
    icon: Clock,
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

export function RoomCard({ room, settings, onClick }: RoomCardProps) {
  const config = statusConfig[room.status] || statusConfig.available;
  const BgIcon = config.icon;
  const [duration, setDuration] = useState('');
  const [amountToCollect, setAmountToCollect] = useState(0);

  const isOccupied = ['hourly', 'daily', 'overnight'].includes(room.status);

  // Calculate pricing and duration
  const updateInfo = useCallback(() => {
    if (!isOccupied || !room.current_booking?.check_in_at) return;

    const start = new Date(room.current_booking.check_in_at);
    const now = new Date();

    // 1. Calculate Duration
    if (room.status === 'hourly') {
      const totalMinutes = differenceInMinutes(now, start);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      setDuration(`${hours}h ${minutes}p`);
    } else {
      // daily or overnight
      const days = differenceInCalendarDays(now, start);
      setDuration(`${Math.max(1, days)} ngày`);
    }

    // 2. Calculate Amount to Collect
    const serviceTotal = room.current_booking.services_used?.reduce((sum, s) => sum + (s.total || 0), 0) || 0;
    const breakdown = calculateRoomPrice(
      room.current_booking.check_in_at,
      now,
      settings,
      room,
      room.current_booking.rental_type,
      serviceTotal
    );

    const deposit = room.current_booking.deposit_amount || 0;
    setAmountToCollect(breakdown.total_amount - deposit);
  }, [room, settings, isOccupied]);

  useEffect(() => {
    updateInfo();
    
    // Update interval: 3 mins for hourly, 1 hour for others
    const intervalMs = room.status === 'hourly' ? 180000 : 3600000;
    const interval = setInterval(updateInfo, intervalMs);
    
    return () => clearInterval(interval);
  }, [updateInfo, room.status]);

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
          size={160} 
          className="opacity-20" 
          strokeWidth={1}
        />
      </div>

      {/* Header: Room Number & Badge */}
      <div className="z-10 flex w-full flex-col items-start gap-0">
        <div className="flex w-full items-start justify-between">
          <span className="text-4xl font-black tracking-tighter">
            {room.room_number}
          </span>
          <div className="flex gap-1">
            {isOccupied ? (
              (room.current_booking?.notes || room.current_booking?.customer?.notes) ? (
                <div className="rounded-full p-1.5 bg-black/10 backdrop-blur-md">
                  <StickyNote size={14} className={config.textColor} />
                </div>
              ) : (
                <div className="rounded-full p-1.5 bg-black/10 backdrop-blur-md">
                  <Check size={14} className={config.textColor} />
                </div>
              )
            ) : (
              <span className={cn(
                "rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider backdrop-blur-md",
                "bg-black/10"
              )}>
                Sẵn sàng
              </span>
            )}
          </div>
        </div>
        
        {isOccupied && (
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider backdrop-blur-md mt-[-4px]",
            "bg-black/10"
          )}>
            {room.current_booking?.customer?.full_name || 'Khách vãng lai'}
          </span>
        )}
      </div>

      {/* Footer: Data Display */}
      <div className="z-10 mt-auto">
        {isOccupied ? (
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-black/10 p-2 backdrop-blur-md">
              <BgIcon size={20} className={cn(config.textColor === 'text-black' ? 'text-black' : 'text-white')} />
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className={cn("text-xs font-bold opacity-80 mb-0.5", config.textColor)}>
                Đã {duration}
              </span>
              <span className={cn("text-[18px] font-black tracking-tight", config.textColor)}>
                {formatCurrency(amountToCollect)}đ
              </span>
            </div>
          </div>
        ) : room.status === 'available' ? (
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-black/10 p-2 backdrop-blur-md">
              <Sun size={20} className="text-white" />
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="text-xs font-bold opacity-80 mb-0.5 text-white">Giá ngày</span>
              <span className="text-[18px] font-black tracking-tight text-white">
                {formatCurrency(room.prices?.daily || 0)}đ
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
