'use client';

import React, { useMemo } from 'react';
import { 
  Sun, 
  Moon, 
  Clock, 
  Brush, 
  Wrench, 
  AlertTriangle, 
  StickyNote,
  LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardRoom, BookingType } from '@/types/dashboard';
import { format } from 'date-fns';

interface RoomCardProps {
  room: DashboardRoom;
  onClick: (room: DashboardRoom) => void;
}

const RoomCard: React.FC<RoomCardProps> = ({ room, onClick }) => {
  // Determine display properties based on status and booking
  const display = useMemo(() => {
    let bgColor = 'bg-[#155e75]'; // Default: Available (Xanh Teal)
    let textColor = 'text-white';
    let Icon: LucideIcon = Sun;
    let statusText = 'Sẵn sàng';
    let subText = 'Trống';
    let isFlashing = false;

    if (room.status === 'repair') {
      bgColor = 'bg-[#1e293b]'; // Repair (Xám Đen)
      Icon = Wrench;
      statusText = 'Bảo trì';
      subText = 'Đang sửa chữa';
    } else if (room.status === 'dirty') {
      bgColor = 'bg-[#f97316]'; // Dirty (Cam Cháy)
      Icon = Brush;
      statusText = 'Chờ dọn';
      subText = room.last_cleaned_at 
        ? `Từ ${format(new Date(room.last_cleaned_at), 'HH:mm')}`
        : 'Cần dọn ngay';
      if (room.is_dirty_overdue) {
        isFlashing = true;
      }
    } else if (room.status === 'occupied' && room.current_booking) {
      const { booking_type } = room.current_booking;
      subText = room.current_booking.customer_name || 'Khách vãng lai';
      
      switch (booking_type) {
        case 'hourly':
          bgColor = 'bg-[#f59e0b]'; // Hourly (Vàng Hổ Phách)
          textColor = 'text-black';
          Icon = Clock;
          statusText = 'Khách giờ';
          break;
        case 'daily':
          bgColor = 'bg-[#1e40af]'; // Daily (Xanh Dương)
          Icon = Sun;
          statusText = 'Khách ngày';
          break;
        case 'overnight':
          bgColor = 'bg-[#1e40af]'; // Overnight (Xanh Dương)
          Icon = Moon;
          statusText = 'Qua đêm';
          break;
      }
    }

    return { bgColor, textColor, Icon, statusText, subText, isFlashing };
  }, [room]);

  const { bgColor, textColor, Icon, statusText, subText, isFlashing } = display;

  // Formatting currency
  const formattedAmount = useMemo(() => {
    if (room.current_booking?.total_amount) {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(room.current_booking.total_amount);
    }
    return null;
  }, [room.current_booking]);

  return (
    <div 
      onClick={() => onClick(room)}
      className={cn(
        "relative overflow-hidden group cursor-pointer transition-all duration-300",
        "h-[200px] md:h-[256px] rounded-[2rem] shadow-lg hover:shadow-2xl",
        "hover:scale-[1.02]", // Prompt requirement
        bgColor,
        textColor,
        isFlashing && "animate-flash-red"
      )}
    >
      {/* Background Watermark Icon */}
      <Icon 
        className="absolute -bottom-4 -right-4 w-[120px] h-[120px] opacity-10 rotate-12 transform transition-transform duration-500 group-hover:rotate-0" 
        strokeWidth={1}
      />

      {/* Content Container */}
      <div className="relative z-10 p-6 flex flex-col h-full justify-between">
        
        {/* Top Row: Room Number & Status Icon */}
        <div className="flex justify-between items-start">
          <div>
            <span className={cn(
              "text-4xl font-black tracking-tighter block", // Prompt requirement
              // "Number color change" effect - slightly distinct from main text if needed, 
              // but prompt says "Text color" is defined by status. 
              // Let's add a slight brightness boost on hover.
              "transition-colors duration-300 group-hover:brightness-110"
            )}>
              {room.name}
            </span>
            {/* Category Badge */}
            <div className="mt-2 inline-block px-2 py-1 rounded-lg bg-black/10 backdrop-blur-md">
              <span className="text-[9px] font-black uppercase tracking-wider block">
                {room.category_name || 'STANDARD'}
              </span>
            </div>
          </div>

          {/* Icon Running In Effect */}
          <div className="transform translate-x-2 opacity-80 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-500">
             <Icon size={32} strokeWidth={2.5} />
          </div>
        </div>

        {/* Middle: Customer Name (if occupied) */}
        <div className="mt-auto mb-2">
          {room.status === 'occupied' && (
            <div className="animate-fade-in">
              <p className="text-[11px] font-bold uppercase tracking-wide opacity-90 truncate">
                {subText}
              </p>
            </div>
          )}
        </div>

        {/* Bottom: Financials & Alerts */}
        <div className="flex items-end justify-between">
          <div className="flex flex-col">
            {/* Duration / Status Text */}
            <span className="text-[13px] font-bold opacity-80 mb-0.5">
              {statusText}
            </span>
            
            {/* Amount */}
            {room.status === 'occupied' ? (
               <span className="text-[22px] font-black tracking-tighter leading-none">
                 {formattedAmount || '0 ₫'}
               </span>
            ) : (
              <span className="text-[14px] font-medium opacity-60">
                 {subText}
              </span>
            )}
          </div>

          {/* Indicators Row */}
          <div className="flex gap-2">
            {room.notes && (
              <StickyNote size={18} className="opacity-80 hover:opacity-100 transition-opacity" />
            )}
            
            {/* Debt Warning Logic (Mocked for now as logic wasn't fully specified) */}
            {/* In a real scenario, check if total_amount > prepayment + threshold */}
            {room.current_booking && (room.current_booking.total_amount || 0) > 1000000 && (
               <div className="w-8 h-8 rounded-full bg-rose-600 flex items-center justify-center animate-pulse shadow-lg shadow-rose-600/40">
                 <AlertTriangle size={16} className="text-white" />
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomCard;
