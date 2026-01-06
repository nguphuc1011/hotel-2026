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
import { useCustomerBalance } from '@/hooks/useCustomerBalance';
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
    hex: '#155e75',
    icon: Sun,
    textColor: 'text-white'
  },
  hourly: {
    label: 'Khách giờ',
    color: 'bg-[#f59e0b]', // Amber 500
    hex: '#f59e0b',
    icon: Clock,
    textColor: 'text-black'
  },
  daily: {
    label: 'Khách ngày',
    color: 'bg-[#1e40af]', // Blue 800
    hex: '#1e40af',
    icon: Sun,
    textColor: 'text-white'
  },
  overnight: {
    label: 'Qua đêm',
    color: 'bg-[#1e40af]', // Blue 800 (Shared with daily)
    hex: '#1e40af',
    icon: Moon,
    textColor: 'text-white'
  },
  dirty: {
    label: 'Chờ dọn',
    color: 'bg-[#f97316]', // Orange 500
    hex: '#f97316',
    icon: Brush,
    textColor: 'text-white'
  },
  repair: {
    label: 'Đang sửa',
    color: 'bg-[#1e293b]', // Slate 800
    hex: '#1e293b',
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
  
  // Lấy thông tin số dư khách hàng qua hook dùng chung
  const { isDebt, absFormattedBalance } = useCustomerBalance(room.current_booking?.customer?.balance || 0);

  // Calculate pricing and duration
  const updateInfo = useCallback(() => {
    const now = new Date();

    // 1. Handle Dirty State Timer
    if (room.status === 'dirty' && room.last_status_change) {
      const start = new Date(room.last_status_change);
      const totalMinutes = differenceInMinutes(now, start);
      
      if (totalMinutes === 0) {
        setDuration('vừa xong');
      } else if (totalMinutes < 60) {
        setDuration(`${totalMinutes}p`);
      } else {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        setDuration(`${hours}h ${minutes}p`);
      }
      return;
    }

    if (!isOccupied || !room.current_booking?.check_in_at) {
      setDuration('');
      return;
    }

    const start = new Date(room.current_booking.check_in_at);

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
    const balance = room.current_booking.customer?.balance || 0;
    
    // total = (current room + current services) - deposit - balance (debt is negative, so it adds up)
    setAmountToCollect(breakdown.total_amount - deposit - balance);
  }, [room, settings, isOccupied]);

  useEffect(() => {
    updateInfo();
    
    // Update interval: 1 min for dirty/hourly, 1 hour for others
    const intervalMs = (room.status === 'hourly' || room.status === 'dirty') ? 60000 : 3600000;
    const interval = setInterval(updateInfo, intervalMs);
    
    return () => clearInterval(interval);
  }, [updateInfo, room.status]);

  const dirtyStats = useMemo(() => {
    if (room.status !== 'dirty' || !room.last_status_change) return null;
    
    // We use duration as a trigger to re-calculate, though we calculate from room.last_status_change
    const minutes = differenceInMinutes(new Date(), new Date(room.last_status_change));
    return {
      minutes,
      isWarning: minutes >= 30 && minutes < 60,
      isCritical: minutes >= 60
    };
  }, [room.status, room.last_status_change, duration]);

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick?.(room)}
      animate={dirtyStats?.isCritical ? {
        backgroundColor: ['#f97316', '#ef4444', '#f97316'],
        transition: { duration: 2, repeat: Infinity }
      } : {
        backgroundColor: dirtyStats?.isWarning ? '#ea580c' : config.hex,
        transition: { duration: 0.3 }
      }}
      className={cn(
        "group relative flex w-full flex-col justify-between overflow-hidden p-6 shadow-lg hover:shadow-2xl",
        "h-[200px] sm:h-[256px]",
        "rounded-[2rem]",
        config.color, // Fallback background color from config
        config.textColor
      )}
    >
      {/* Header: Room Number & Badge */}
      <div className="z-10 flex w-full flex-col items-start gap-0">
        <div className="flex w-full items-start justify-between">
          <span className="text-4xl font-black tracking-tighter">
            {room.room_number}
          </span>
          <div className="flex gap-1 items-center">
            {isOccupied && isDebt && (
              <motion.div 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center justify-center w-6 h-6 bg-rose-600 text-white rounded-full shadow-lg border border-rose-400/50"
              >
                <AlertTriangle size={12} className="animate-pulse" />
              </motion.div>
            )}
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
                {config.label}
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
      <div className="z-10 mt-auto w-full">
        {isOccupied ? (
          <div className="flex items-center gap-3">
            <div className="w-[3px] h-10 bg-current opacity-20 rounded-full" />
            <div className="flex flex-col items-start leading-tight">
              <span className={cn("text-[13px] font-bold opacity-80", config.textColor)}>
                Đã ở: {duration}
              </span>
              <span className={cn("text-[22px] font-black tracking-tighter", config.textColor)}>
                {formatCurrency(amountToCollect)}đ
              </span>
            </div>
          </div>
        ) : room.status === 'dirty' ? (
          <div className="flex items-center gap-3">
            <div className="w-[3px] h-10 bg-current opacity-20 rounded-full" />
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[13px] font-bold opacity-80 flex items-center gap-1">
                <Clock size={12} /> {duration || 'vừa xong'}
              </span>
              <span className="text-[22px] font-black tracking-tighter uppercase">
                {config.label}
              </span>
            </div>
          </div>
        ) : room.status === 'available' ? (
          <div className="flex items-center gap-3">
            <div className="w-[3px] h-10 bg-current opacity-20 rounded-full" />
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[13px] font-bold opacity-80 text-white">Giá ngày</span>
              <span className="text-[22px] font-black tracking-tighter text-white">
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
