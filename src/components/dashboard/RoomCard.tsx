'use client';

import React, { useMemo, memo, useState, useEffect } from 'react';
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
  Crown,
  RefreshCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardRoom } from '@/types/dashboard';
import { format } from 'date-fns';
import LiveTimer from './LiveTimer';

import { formatMoney, getContrastTextColor } from '@/utils/format';
import { calculateLiveRoomCharge } from '@/utils/billing';

interface RoomCardProps {
  room: DashboardRoom;
  settings?: any;
  onClick: (room: DashboardRoom) => void;
  onStatusChange?: (room: DashboardRoom) => void;
}

const RoomCard: React.FC<RoomCardProps> = ({ room, settings, onClick, onStatusChange }) => {
  // Live Amount Calculation (FE Approximation)
  const [liveAmount, setLiveAmount] = useState<number | null>(null);
  const [isLiveCeilingHit, setIsLiveCeilingHit] = useState(false);

  useEffect(() => {
    if (room.status !== 'occupied' || !room.current_booking) {
      setLiveAmount(null);
      setIsLiveCeilingHit(false);
      return;
    }

    const updateLiveAmount = () => {
      const { current_booking: booking } = room;
      if (!booking?.check_in_at) return;

      const now = new Date();
      const nowTime = now.getTime();
      let totalAmount = 0;
      let usingLadder = false;
      let ceilingHit = false;

      // 1. ƯU TIÊN SỐ 1: Sử dụng Thang giá (Pricing Ladder) từ DB - GIẢM TẢI HỆ THỐNG
      if (booking.pricing_ladder && Array.isArray(booking.pricing_ladder) && booking.pricing_ladder.length > 0) {
        // Tìm mốc giá mới nhất trong QUÁ KHỨ (hoặc hiện tại)
        const currentPoint = booking.pricing_ladder
          .filter(p => new Date(p.time).getTime() <= nowTime)
          .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];

        if (currentPoint) {
          totalAmount = currentPoint.amount;
          usingLadder = true;
          
          // Check if ladder price already reached ceiling
          if (booking.booking_type === 'hourly') {
            const ceilingPercent = settings?.hourly_ceiling_percent || 100;
            const ceilingAmount = (room.price_daily || 0) * (ceilingPercent / 100);
            if (totalAmount >= ceilingAmount && ceilingAmount > 0) {
              ceilingHit = true;
            }
          }
        }
      } 

      // 2. FALLBACK: Nếu thang giá lỗi hoặc không có điểm phù hợp, mới tính toán ở FE
      if (!usingLadder) {
        const { amount, isCeilingHit } = calculateLiveRoomCharge({
          checkInAt: booking.check_in_at,
          rentalType: booking.booking_type,
          prices: {
            hourly: room.price_hourly || 0,
            price_next_hour: room.price_next_hour || 0,
            daily: room.price_daily || 0,
            overnight: room.price_overnight || 0,
            base_hourly_limit: room.base_hourly_limit || 1,
            hourly_unit: room.hourly_unit || 60,
          },
          settings: settings
        });
        totalAmount = amount;
        ceilingHit = isCeilingHit;

        // Cộng thêm các thành phần động khác
        totalAmount = totalAmount 
          + (booking.service_total || 0) 
          + (booking.surcharge_amount || 0) 
          + (booking.extra_person_charge || 0)
          + (booking.custom_surcharge || 0)
          - (booking.discount_amount || 0);
      }

      // 3. Kết hợp với Thu trước và Nợ cũ (Static)
      const finalToPay = totalAmount 
        - (booking.deposit_amount || 0) 
        + (booking.customer_balance && booking.customer_balance < 0 ? Math.abs(booking.customer_balance) : 0);
        
      setLiveAmount(finalToPay);
      setIsLiveCeilingHit(ceilingHit);
    };

    updateLiveAmount();
    
    // Update every 10 seconds for a more "live" feel
    const interval = setInterval(updateLiveAmount, 10000);
    return () => clearInterval(interval);
  }, [room.status, room.current_booking, room.price_hourly, room.price_daily, room.price_overnight, room.base_hourly_limit, room.hourly_unit, settings]);

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
      
      // Nhận diện nhảy giá trần (Live hoặc từ DB)
      const isAutoSwitched = (booking_type === 'hourly' && duration_text && (duration_text.includes('ngày') || duration_text.includes('đêm'))) || (booking_type === 'hourly' && isLiveCeilingHit);
      
      subText = room.current_booking.customer_name || 'Khách vãng lai';
      
      const checkIn = check_in_at ? new Date(check_in_at) : null;
      const isValidDate = checkIn && !isNaN(checkIn.getTime());

      // Ưu tiên hiển thị duration_text từ DB nếu có, hoặc nếu đã nhảy giá trần ở FE
      if (isLiveCeilingHit || (duration_text && (duration_text.includes('ngày') || duration_text.includes('đêm')))) {
          bgColor = 'bg-[#1e40af]';
          textColor = 'text-white';
          
          // Xác định text hiển thị thời gian
          let displayDuration = duration_text;
          if (isLiveCeilingHit && (!duration_text || (!duration_text.includes('ngày') && !duration_text.includes('đêm')))) {
             displayDuration = "1 ngày"; // Fallback FE
          }

          Icon = (displayDuration && displayDuration.includes('đêm')) ? Moon : Sun;
          statusText = (
            <div className="flex items-center gap-1.5">
              <Calendar size={16} />
              <span>{displayDuration}</span>
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
            badgeText = (displayDuration && displayDuration.includes('đêm')) ? 'ĐÊM' : 'NGÀY';
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

    return { bgColor, textColor, Icon, statusText, subText, isFlashing, iconClassName, badgeText };
  }, [room.status, room.current_booking, room.notes, room.last_cleaned_at, room.is_dirty_overdue, isLiveCeilingHit]);

  const { bgColor, textColor, Icon, statusText, subText, isFlashing, iconClassName, badgeText } = display;

  // Formatting currency
  const formattedAmount = useMemo(() => {
    // Ưu tiên dùng số tiền tính toán trực tiếp tại FE (Live) để UI mượt mà
    if (liveAmount !== null) {
      return formatMoney(liveAmount);
    }

    const booking = room.current_booking;
    const amount = room.status === 'occupied' && booking
      ? (
          (booking.amount_to_pay || 0) + 
          (booking.customer_balance && booking.customer_balance < 0 ? Math.abs(booking.customer_balance) : 0)
        )
      : (room.status === 'available' ? room.price_daily : null);

    if (amount !== undefined && amount !== null) {
      return formatMoney(amount);
    }
    return null;
  }, [room.status, room.current_booking, room.price_daily, liveAmount]);

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
            <div className="ml-auto">
              {badgeText ? (
                typeof badgeText === 'string' ? (
                  <div className="px-2 py-1 rounded-lg bg-black/10 backdrop-blur-md">
                    <span className="text-[9px] font-black uppercase tracking-wider block">
                      {badgeText}
                    </span>
                  </div>
                ) : (
                  badgeText
                )
              ) : (
                <div className="px-2 py-1 rounded-lg bg-black/10 backdrop-blur-md">
                  <span className="text-[9px] font-black uppercase tracking-wider block">
                    {room.current_booking.booking_type === 'hourly' ? 'GIỜ' : 
                     room.current_booking.booking_type === 'overnight' ? 'ĐÊM' : 'NGÀY'}
                  </span>
                </div>
              )}
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
                 {formattedAmount !== null ? formattedAmount : '0 ₫'}
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
