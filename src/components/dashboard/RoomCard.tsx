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
import { useMemo, useEffect, useState, useCallback, memo } from 'react';
import { useCustomerBalance } from '@/hooks/useCustomerBalance';
import { HotelService } from '@/services/hotel';

interface RoomCardProps {
  room: Room;
  settings: Setting[];
  onClick?: (room: Room) => void;
}

const statusConfig = {
  available: {
    label: 'Sẵn sàng',
    color: 'bg-[#155e75]',
    hex: '#155e75',
    icon: Sun,
    textColor: 'text-white'
  },
  hourly: {
    label: 'Khách giờ',
    color: 'bg-[#f59e0b]',
    hex: '#f59e0b',
    icon: Clock,
    textColor: 'text-black'
  },
  daily: {
    label: 'Khách ngày',
    color: 'bg-[#1e40af]',
    hex: '#1e40af',
    icon: Sun,
    textColor: 'text-white'
  },
  overnight: {
    label: 'Qua đêm',
    color: 'bg-[#1e40af]',
    hex: '#1e40af',
    icon: Moon,
    textColor: 'text-white'
  },
  dirty: {
    label: 'Chờ dọn',
    color: 'bg-[#f97316]',
    hex: '#f97316',
    icon: Brush,
    textColor: 'text-white'
  },
  repair: {
    label: 'Đang sửa',
    color: 'bg-[#1e293b]',
    hex: '#1e293b',
    icon: Wrench,
    textColor: 'text-white'
  },
};

export const RoomCard = memo(function RoomCard({ room, onClick }: RoomCardProps) {
  const config = statusConfig[room.status] || statusConfig.available;
  const [isMounted, setIsMounted] = useState(false);
  const [duration, setDuration] = useState('');
  const [amountToCollect, setAmountToCollect] = useState(0);

  useEffect(() => {
    setIsMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOccupied = ['hourly', 'daily', 'overnight'].includes(room.status);
  
  const { isDebt } = useCustomerBalance(room.current_booking?.customer?.balance || 0);

  const updateInfo = useCallback(() => {
    if (!isMounted) return;
    const now = new Date();

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

    const checkInAt = room.current_booking.check_in_at;
    const start = new Date(checkInAt);
    
    if (isNaN(start.getTime())) {
      setDuration('...');
      return;
    }

    if (room.status === 'hourly') {
      const totalMinutes = differenceInMinutes(now, start);
      if (isNaN(totalMinutes)) {
        setDuration('...');
      } else {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        setDuration(`${hours}h ${minutes}p`);
      }
    } else {
      const days = differenceInCalendarDays(now, start);
      if (isNaN(days)) {
        setDuration('...');
      } else {
        setDuration(`${Math.max(1, days)} ngày`);
      }
    }

    // Gọi RPC tính giá từ Database (Single Source of Truth)
    const fetchBill = async () => {
      if (!room.current_booking?.id) return;
      const bill = await HotelService.calculateBill(room.current_booking.id);
      if (bill && bill.success) {
        // total_final là con số cuối cùng sau khi đã tính toán mọi thứ ở DB
        setAmountToCollect(bill.total_final || 0);
      }
    };
    
    fetchBill();
  }, [room.status, room.last_status_change, room.current_booking, isOccupied, isMounted]);

  useEffect(() => {
    if (!isMounted) return;
    updateInfo();
    
    const intervalMs = (room.status === 'hourly' || room.status === 'dirty') ? 60000 : 3600000;
    const interval = setInterval(updateInfo, intervalMs);
    
    return () => clearInterval(interval);
  }, [updateInfo, room.status, isMounted]);

  const dirtyStats = useMemo(() => {
    if (room.status !== 'dirty' || !room.last_status_change || !isMounted) return null;
    
    const minutes = differenceInMinutes(new Date(), new Date(room.last_status_change));
    return {
      minutes,
      isWarning: minutes >= 30 && minutes < 60,
      isCritical: minutes >= 60
    };
  }, [room.status, room.last_status_change, isMounted]);

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
        config.color,
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
            {isMounted && isOccupied && isDebt && (
              <motion.div 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center justify-center w-6 h-6 bg-rose-600 text-white rounded-full shadow-lg border border-rose-400/50"
              >
                <AlertTriangle size={12} className="animate-pulse" />
              </motion.div>
            )}
            {room.category?.name && (
              <span className={cn(
                "rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wider backdrop-blur-md mr-1",
                isOccupied ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"
              )}>
                {room.category.name}
              </span>
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
        {isMounted && isOccupied ? (
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
        ) : isMounted && room.status === 'dirty' ? (
          <div className="flex items-center gap-3">
            <div className="w-[3px] h-10 bg-current opacity-20 rounded-full" />
            <div className="flex flex-col items-start leading-tight">
              <span className={cn("text-[13px] font-bold opacity-80", config.textColor)}>
                Thời gian chờ dọn:
              </span>
              <span className={cn("text-[22px] font-black tracking-tighter", config.textColor)}>
                {duration}
              </span>
            </div>
          </div>
        ) : isMounted && room.status === 'available' ? (
          <div className="flex items-center gap-3">
            <div className="w-[3px] h-10 bg-current opacity-20 rounded-full" />
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[13px] font-bold opacity-80 text-white">Giá ngày</span>
              <span className="text-[22px] font-black tracking-tighter text-white">
                {formatCurrency((room.category?.prices?.daily || room.prices?.daily) || 0)}
              </span>
            </div>
          </div>
        ) : isMounted ? (
          <div className="flex items-center gap-2 opacity-80">
            <span className="text-sm font-medium uppercase tracking-widest">
              {config.label}
            </span>
          </div>
        ) : null}
      </div>
      
      <div className="absolute -bottom-6 -right-6 opacity-10 rotate-12 transition-transform group-hover:scale-110 group-hover:rotate-0">
        <config.icon size={120} />
      </div>
    </motion.button>
  );
});
