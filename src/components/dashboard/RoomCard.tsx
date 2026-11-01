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
import { format, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
import LiveTimer from './LiveTimer';

import { formatMoney } from '@/utils/format';
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

  const [liveDuration, setLiveDuration] = useState<string | null>(null);

  useEffect(() => {
    if (room.status !== 'occupied' || !room.current_booking) {
      setLiveAmount(null);
      setLiveDuration(null);
      setIsLiveCeilingHit(false);
      return;
    }

    const updateLiveAmount = () => {
      const { current_booking: booking } = room;
      if (!booking?.check_in_at) return;

      const now = new Date();
      const nowTime = now.getTime();
      
      // MẶC ĐỊNH: Lấy số tiền cuối cùng từ Backend (Khớp 100% Folio)
      let totalAmount = booking.total_amount || 0;
      let durationText = booking.duration_text || null;
      let usingLadder = false;
      let ceilingHit = false;

      // 1. CẬP NHẬT THEO THANG GIÁ (Nếu có mốc mới trong tương lai/quá khứ gần)
      if (booking.pricing_ladder && Array.isArray(booking.pricing_ladder) && booking.pricing_ladder.length > 0) {
        const ladder = booking.pricing_ladder;
        const lastPointTime = new Date(ladder[ladder.length - 1].time).getTime();

        if (nowTime <= lastPointTime) {
          const currentPoint = ladder
            .filter(p => new Date(p.time).getTime() <= nowTime)
            .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];

          if (currentPoint) {
            totalAmount = currentPoint.amount;
            durationText = currentPoint.reason || booking.duration_text || null;
            usingLadder = true;
          }
        }
      } 

      // 2. FALLBACK: Nếu thang giá hết hạn (như phòng 204 ở lâu ngày), dùng logic tính toán dự phòng
      if (!usingLadder) {
        // Nếu Backend đã tính sẵn total_amount (Snapshot/Live), dùng luôn con số đó
        // Chỉ khi không có mới dùng calculateLiveRoomCharge
        if (booking.total_amount && booking.total_amount > 0) {
           totalAmount = booking.total_amount;
        } else {
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
        }

        // Cập nhật text hiển thị thời gian khi dùng fallback
        if (!durationText) {
           const hours = Math.max(1, differenceInHours(now, new Date(booking.check_in_at)));
           if (hours >= 24) {
              const days = Math.floor(hours / 24);
              const rem = hours % 24;
              durationText = `${days} ngày${rem > 0 ? ` ${rem} giờ` : ''}`;
           } else {
              const diffMin = differenceInMinutes(now, new Date(booking.check_in_at));
              const h = Math.floor(diffMin / 60);
              const m = diffMin % 60;
              durationText = h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
           }
        }
      }

      // 3. Kết hợp với Thu trước và Nợ cũ (Static)
      // Chú ý: totalAmount ở đây là tiền phòng + dịch vụ từ BE trả về
      const finalToPay = totalAmount 
        - (booking.deposit_amount || 0) 
        + (booking.customer_balance && booking.customer_balance < 0 ? Math.abs(booking.customer_balance) : 0);
        
      // 4. ĐỊNH DẠNG LẠI HIỂN THỊ THỜI GIAN
      if (durationText && durationText.includes('giờ')) {
        const hoursMatch = durationText.match(/\d+/);
        if (hoursMatch) {
          const hours = parseInt(hoursMatch[0]);
          if (hours >= 24) {
            const days = Math.floor(hours / 24);
            const remainingHours = hours % 24;
            durationText = `${days} ngày${remainingHours > 0 ? ` ${remainingHours} giờ` : ''}`;
          }
        }
      }

      setLiveAmount(finalToPay);
      setLiveDuration(durationText);
      setIsLiveCeilingHit(ceilingHit);
    };

    updateLiveAmount();
    
    // TỐI ƯU HÓA: Thay vì setInterval 10s, ta tìm mốc thời gian nhảy tiền tiếp theo trong ladder
    // Nếu thang giá hết hạn hoặc không có, ta dùng Interval chậm hơn để bù đắp.
    let timeoutId: NodeJS.Timeout;
    let fallbackInterval: NodeJS.Timeout;

    const scheduleNextUpdate = () => {
      const ladder = room.current_booking?.pricing_ladder;
      const nowMs = new Date().getTime();
      
      if (ladder && Array.isArray(ladder) && ladder.length > 0) {
        const lastPointTime = new Date(ladder[ladder.length - 1].time).getTime();
        
        // Nếu ladder vẫn còn hiệu lực trong tương lai
        if (nowMs < lastPointTime) {
          const nextPoint = ladder.find(p => new Date(p.time).getTime() > nowMs);
          if (nextPoint) {
            const delay = new Date(nextPoint.time).getTime() - nowMs + 1000;
            timeoutId = setTimeout(() => {
              updateLiveAmount();
              scheduleNextUpdate();
            }, delay);
            return;
          }
        }
      }

      // FALLBACK: Nếu không có ladder hoặc ladder hết hạn, cập nhật mỗi 30s để giữ tính "Live"
      fallbackInterval = setInterval(() => {
        updateLiveAmount();
      }, 30000);
    };

    scheduleNextUpdate();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
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
      const { booking_type, check_in_at } = room.current_booking;
      const duration_text = liveDuration || room.current_booking.duration_text;
      
      // Nhận diện nhảy giá trần (Live hoặc từ DB)
      const isAutoSwitched = (booking_type === 'hourly' && duration_text && (duration_text.includes('ngày') || duration_text.includes('đêm'))) || (booking_type === 'hourly' && isLiveCeilingHit);
      
      subText = room.current_booking.customer_name || 'Khách vãng lai';
      
      const checkIn = check_in_at ? new Date(check_in_at) : null;
      const isValidDate = checkIn && !isNaN(checkIn.getTime());

      // Ưu tiên hiển thị duration_text từ DB (liveDuration) nếu có, hoặc nếu đã nhảy giá trần ở FE
      if (isLiveCeilingHit || (duration_text && (duration_text.includes('ngày') || duration_text.includes('đêm')))) {
          bgColor = 'bg-[#1e40af]';
          textColor = 'text-white';
          
          // Xác định text hiển thị thời gian
          let displayDuration = duration_text;
          if (isLiveCeilingHit && (!displayDuration || (!displayDuration.includes('ngày') && !displayDuration.includes('đêm')))) {
             displayDuration = "1 ngày"; // Fallback FE
          }

          Icon = (displayDuration && displayDuration.includes('đêm')) ? Moon : Sun;
          statusText = (
            <div className="flex items-center gap-1.5">
              <Calendar size={13} className="shrink-0 md:w-4 md:h-4" />
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
                      <Clock size={13} className="shrink-0 md:w-4 md:h-4 animate-pulse" />
                      {duration_text && (duration_text.includes('ngày') || duration_text.includes('đêm')) ? (
                        <span>{duration_text}</span>
                      ) : (
                        <LiveTimer checkInAt={check_in_at} mode="hourly" />
                      )}
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
                    <Calendar size={13} className="shrink-0 md:w-4 md:h-4" />
                    {duration_text ? (
                      <span>{duration_text}</span>
                    ) : (
                      <LiveTimer checkInAt={check_in_at} mode={booking_type} />
                    )}
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
  }, [room.status, room.current_booking, room.notes, room.last_cleaned_at, room.is_dirty_overdue, isLiveCeilingHit, liveDuration]);

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
        "h-[152px] sm:h-[180px] md:h-[256px] rounded-2xl md:rounded-[2rem] shadow-sm md:shadow-lg hover:shadow-md md:hover:shadow-2xl",
        "hover:scale-[1.02]", // Prompt requirement
        bgColor,
        textColor,
        isFlashing && "animate-flash-red"
      )}
    >
      {/* Content Container */}
      <div className="relative z-10 p-3 sm:p-4 md:p-6 flex flex-col h-full justify-between">
        
        {/* Top Row: Room Number & Rental Type */}
        <div className="flex justify-between items-end">
          <div className="flex items-center gap-2">
            {room.group_color && (room.is_group_master || room.current_booking?.is_group_member) && (
              <span
                className="h-3 w-3 rounded-full ring-2 ring-white/40 shrink-0"
                style={{ backgroundColor: room.group_color }}
                title={room.is_group_master ? `Nhóm ${room.name}` : `Nhóm ${room.current_booking?.master_room_name || '?'}`}
              />
            )}
            <span className={cn(
              "text-2xl sm:text-3xl md:text-4xl font-black tracking-tight md:tracking-tighter block leading-none",
              "transition-colors duration-300 group-hover:brightness-110"
            )}>
              {room.name}
            </span>
          </div>

          {room.status === 'occupied' && room.current_booking && (
            <div className="ml-auto">
              {badgeText ? (
                typeof badgeText === 'string' ? (
                  <div className="px-1.5 py-0.5 md:px-2 md:py-1 rounded-md md:rounded-lg bg-black/10 backdrop-blur-md">
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
        <div className="mt-0.5 md:mt-2 flex flex-col items-start gap-0.5 md:gap-1">
              
              {/* Group Indicator - Neutral pill + color dot */}
              {room.group_color && (room.is_group_master || room.current_booking?.is_group_member) && (
                <div className="px-2 py-1 rounded-lg bg-black/10 backdrop-blur-md border border-white/10 flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: room.group_color }}
                  />
                  {room.is_group_master ? (
                    <>
                      <Crown size={10} />
                      <span className="text-[9px] font-black uppercase tracking-wider block whitespace-nowrap">
                        CHỦ NHÓM
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
        <div className="my-auto py-0.5 md:py-1">
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
            <span className="text-[11px] md:text-[13px] font-bold opacity-85 mb-0.5 truncate">
              {statusText}
            </span>
            
            {/* Amount */}
            {room.status === 'occupied' || room.status === 'available' ? (
               <span className={cn(
                 "font-bold tracking-normal leading-none",
                 "text-[17px] sm:text-[19px] md:text-[22px]"
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
    prevProps.room.is_dirty_overdue === nextProps.room.is_dirty_overdue &&
    JSON.stringify(prevProps.settings) === JSON.stringify(nextProps.settings)
  );
});
