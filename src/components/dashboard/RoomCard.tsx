'use client';

import React, { useMemo, memo } from 'react';
import { 
  Sun, 
  Moon, 
  Clock, 
  Brush, 
  Wrench, 
  AlertTriangle, 
  StickyNote,
  LucideIcon,
  Calendar,
  ShieldCheck,
  DoorOpen,
  User,
  Users,
  Link,
  Crown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardRoom } from '@/types/dashboard';
import { format } from 'date-fns';
import LiveTimer from './LiveTimer';

import { formatMoney, getContrastTextColor } from '@/utils/format';

interface RoomCardProps {
  room: DashboardRoom;
  onClick: (room: DashboardRoom) => void;
}

const RoomCard: React.FC<RoomCardProps> = ({ room, onClick }) => {
  // Determine display properties based on status and booking
  const display = useMemo(() => {
    let bgColor = 'bg-[#155e75]'; // Default: Available (Xanh Teal)
    let textColor = 'text-white';
    let Icon: LucideIcon = DoorOpen;
    let statusText: React.ReactNode = 'Sẵn sàng';
    let subText = 'Trống';
    let isFlashing = false;
    let iconClassName = '';
    let badgeText: React.ReactNode = null;

    if (room.status === 'repair') {
      bgColor = 'bg-[#1e293b]'; // Repair (Xám Đen)
      Icon = Wrench;
      statusText = 'Bảo trì';
      subText = room.notes || 'Đang sửa chữa';
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
      const { booking_type, check_in_at, duration_text } = room.current_booking;
      const isAutoSwitched = booking_type === 'hourly' && duration_text && (duration_text.includes('ngày') || duration_text.includes('đêm'));
      
      subText = room.current_booking.customer_name || 'Khách vãng lai';
      
      const checkIn = check_in_at ? new Date(check_in_at) : null;
      const isValidDate = checkIn && !isNaN(checkIn.getTime());

      // Ưu tiên hiển thị duration_text từ DB nếu có (Dành cho trường hợp nhảy giá trần hoặc phạt muộn)
      if (duration_text && (duration_text.includes('ngày') || duration_text.includes('đêm'))) {
          bgColor = 'bg-[#1e40af]';
          textColor = 'text-white';
          Icon = duration_text.includes('ngày') ? Sun : Moon;
          statusText = (
            <div className="flex items-center gap-1.5">
              <Calendar size={16} />
              <span>{duration_text}</span>
            </div>
          );
          
          // Hiển thị tag GIỜ --> NGÀY màu vàng ở góc phải cho phòng nhảy giá trần
          if (isAutoSwitched) {
            badgeText = (
              <span className="bg-yellow-400 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm animate-pulse border border-yellow-500">
                GIỜ → NGÀY
              </span>
            );
          } else {
            badgeText = duration_text.includes('ngày') ? 'NGÀY' : 'ĐÊM';
          }
      } else {
          switch (booking_type) {
            case 'hourly':
              bgColor = 'bg-[#f59e0b]';
              textColor = 'text-black';
              Icon = Clock;
              badgeText = 'GIỜ';
              
              if (isValidDate && check_in_at) {
                 statusText = (
                    <div className="flex items-center gap-1.5">
                      <Clock size={16} className="animate-pulse" />
                      <LiveTimer checkInAt={check_in_at} mode="hourly" />
                    </div>
                  );
              } else {
                statusText = '--:--';
              }
              break;
            case 'daily':
            case 'overnight':
              bgColor = 'bg-[#1e40af]';
              Icon = booking_type === 'daily' ? Sun : Moon;
              badgeText = booking_type === 'daily' ? 'NGÀY' : 'ĐÊM';
              
              if (isValidDate && check_in_at) {
                statusText = (
                  <div className="flex items-center gap-1.5">
                    <Calendar size={16} />
                    <LiveTimer checkInAt={check_in_at} mode={booking_type} />
                  </div>
                );
              } else {
                statusText = '--- ngày';
              }
              break;
          }
      }
    }

    return { bgColor, textColor, Icon, statusText, subText, isFlashing, iconClassName };
  }, [room.status, room.current_booking, room.notes, room.last_cleaned_at, room.is_dirty_overdue]);

  const { bgColor, textColor, Icon, statusText, subText, isFlashing, iconClassName } = display;

  // Formatting currency
  const formattedAmount = useMemo(() => {
    const booking = room.current_booking;
    const amount = room.status === 'occupied' && booking
      ? ((booking.amount_to_pay || 0) + (booking.customer_balance && booking.customer_balance < 0 ? Math.abs(booking.customer_balance) : 0))
      : (room.status === 'available' ? room.price_daily : null);

    if (amount !== undefined && amount !== null) {
      return formatMoney(amount);
    }
    return null;
  }, [room.status, room.current_booking, room.price_daily]);

  return (
    <div 
      onClick={() => onClick(room)}
      className={cn(
        "relative overflow-hidden group cursor-pointer transition-all duration-300",
        "h-[230px] md:h-[256px] rounded-[2rem] shadow-lg hover:shadow-2xl",
        "hover:scale-[1.02]", // Prompt requirement
        bgColor,
        textColor,
        isFlashing && "animate-flash-red"
      )}
    >
      {/* Content Container */}
      <div className="relative z-10 p-6 flex flex-col h-full justify-between">
        
        {/* Top Row: Room Number & Rental Type */}
        <div className="flex justify-between items-end">
          <span className={cn(
            "text-4xl font-black tracking-tighter block",
            "transition-colors duration-300 group-hover:brightness-110"
          )}>
            {room.name}
          </span>

          {room.status === 'occupied' && room.current_booking && (
            <div className="px-2 py-1 rounded-lg bg-black/10 backdrop-blur-md ml-auto">
              <span className="text-[9px] font-black uppercase tracking-wider block">
                {room.current_booking.booking_type === 'hourly' ? 'GIỜ' : 
                 room.current_booking.booking_type === 'overnight' ? 'ĐÊM' : 'NGÀY'}
              </span>
            </div>
          )}
        </div>

        {/* Category Badge & Group Indicator */}
        <div className="mt-2 flex flex-col items-start gap-1">
              
              {/* Group Indicator - Color Box */}
              {room.group_color && (room.is_group_master || room.current_booking?.is_group_member) && (
                <div 
                  className="px-2 py-1 rounded-lg backdrop-blur-md flex items-center gap-1" 
                  style={{ backgroundColor: room.group_color, color: getContrastTextColor(room.group_color) }} // Áp dụng màu chữ tương phản
                >
                  {room.is_group_master ? (
                    <>
                      <Crown size={10} />
                      <span className="text-[9px] font-black uppercase tracking-wider block whitespace-nowrap">
                        CHỦ NHÓM {room.name}
                      </span>
                    </>
                  ) : (
                    <>
                      <Link size={10} />
                      <span className="text-[9px] font-black uppercase tracking-wider block whitespace-nowrap">
                        NHÓM {room.current_booking?.master_room_name || '?'}
                      </span>
                    </>
                  )}
                </div>
              )}
              
              {room.status === 'available' && room.category_name && (
                <div className="px-2 py-1 rounded-lg bg-black/10 backdrop-blur-md">
                  <span className="text-[9px] font-black uppercase tracking-wider block">
                    {room.category_name}
                  </span>
                </div>
              )}
            </div>

        {/* Middle: Customer Name & Booking Details (if occupied) */}
        <div className="mt-auto mb-2 pt-3">
          {room.status === 'occupied' && room.current_booking && (
            <div className="animate-fade-in flex flex-col gap-1">
              <div className="flex items-center gap-1.5 opacity-90">
                <User size={12} strokeWidth={2.5} />
                <p className="text-[12px] md:text-[11px] font-bold uppercase tracking-wide truncate">
                  {subText}
                </p>
              </div>
              
              {/* Separator */}
              <div className={cn(
                "h-px w-full my-0.5",
                textColor === 'text-black' ? "bg-black/20" : "bg-white/20"
              )} />

              <div className="flex flex-col gap-0.5">
              </div>
            </div>
          )}
        </div>

        {/* Bottom: Financials & Alerts */}
        <div className="flex items-end justify-between">
          <div className="flex flex-col">
            {/* Duration / Status Text */}
            <span className="text-[14px] md:text-[13px] font-bold opacity-80 mb-0.5">
              {statusText}
            </span>
            
            {/* Amount */}
            {room.status === 'occupied' || room.status === 'available' ? (
               <span className={cn(
                 "font-bold tracking-normal leading-none",
                 "text-[24px] md:text-[22px]"
               )}>
                 {formattedAmount || '0 ₫'}
               </span>
            ) : (
              <span className="text-[14px] font-medium opacity-60">
                 {subText}
              </span>
            )}
          </div>

          <div className="flex gap-2 items-center">
            {/* Debt Warning Logic */}
            {room.current_booking && (room.current_booking.customer_balance || 0) < 0 && (
               <AlertTriangle size={16} className="text-rose-600 animate-bounce" />
            )}
            
            {room.notes && (
              <StickyNote size={18} className="opacity-80 hover:opacity-100 transition-opacity" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(RoomCard, (prevProps, nextProps) => {
  // Chỉ re-render nếu các dữ liệu quan trọng thay đổi
  return (
    prevProps.room.id === nextProps.room.id &&
    prevProps.room.status === nextProps.room.status &&
    prevProps.room.updated_at === nextProps.room.updated_at &&
    JSON.stringify(prevProps.room.current_booking) === JSON.stringify(nextProps.room.current_booking) &&
    prevProps.room.group_color === nextProps.room.group_color &&
    prevProps.room.is_dirty_overdue === nextProps.room.is_dirty_overdue
  );
});
