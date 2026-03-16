import { differenceInMinutes, differenceInHours } from 'date-fns';

export interface LiveCalculationParams {
  checkInAt: string;
  rentalType: 'hourly' | 'daily' | 'overnight';
  prices: {
    hourly: number;
    price_next_hour: number; // THÊM TRƯỜNG NÀY
    daily: number;
    overnight: number;
    base_hourly_limit: number;
    hourly_unit: number;
  };
  settings?: {
    grace_minutes: number;
    grace_out_enabled: boolean;
    hourly_ceiling_enabled?: boolean;
    hourly_ceiling_percent?: number;
  };
}

/**
 * FE Approximation of room charge for live dashboard display.
 * NOTE: DB remains the source of truth for final checkout.
 */
export function calculateLiveRoomCharge(params: LiveCalculationParams): { amount: number; isCeilingHit: boolean } {
  const { checkInAt, rentalType, prices, settings } = params;
  const checkIn = new Date(checkInAt);
  const now = new Date();
  
  if (isNaN(checkIn.getTime())) return { amount: 0, isCeilingHit: false };
  
  const elapsedMin = Math.max(0, differenceInMinutes(now, checkIn));
  const graceMin = settings?.grace_out_enabled ? (settings.grace_minutes || 0) : 0;
  const isGraceOutEnabled = settings?.grace_out_enabled ?? false;

  if (rentalType === 'hourly') {
    const hourlyUnit = prices.hourly_unit || 60;
    const baseHourlyLimit = prices.base_hourly_limit || 1;
    const firstBlockMin = baseHourlyLimit * hourlyUnit;
    
    let currentAmount = 0;

    // 1. Block đầu
    if (elapsedMin <= firstBlockMin) {
      currentAmount = prices.hourly;
    } else {
      // 2. Kiểm tra ân hạn cho block đầu
      const extraAfterFirstBlock = elapsedMin - firstBlockMin;
      if (isGraceOutEnabled && extraAfterFirstBlock <= graceMin) {
        currentAmount = prices.hourly;
      } else {
        // 3. Tính các block tiếp theo
        let nextBlocks = Math.floor(extraAfterFirstBlock / hourlyUnit);
        const remainderMin = extraAfterFirstBlock % hourlyUnit;
        
        if (remainderMin > 0) {
          if (!isGraceOutEnabled || remainderMin > graceMin) {
            nextBlocks += 1;
          }
        }

        const unitPrice = prices.price_next_hour > 0 ? prices.price_next_hour : (prices.hourly / baseHourlyLimit);
        currentAmount = prices.hourly + (nextBlocks * unitPrice);
      }
    }

    // 4. Ceiling logic (Giá trần)
    if (settings?.hourly_ceiling_enabled) {
      const ceilingPercent = settings.hourly_ceiling_percent || 100;
      const ceilingAmountPerDay = prices.daily * (ceilingPercent / 100);
      
      // Nếu tiền giờ vượt quá giá trần của 1 ngày
      if (currentAmount > ceilingAmountPerDay) {
        // Tính số ngày lưu trú
        const elapsedDays = Math.max(1, Math.ceil(differenceInHours(now, checkIn) / 24));
        return { amount: elapsedDays * prices.daily, isCeilingHit: true };
      }
    }

    return { amount: currentAmount, isCeilingHit: false };
  } 
  
  if (rentalType === 'daily' || rentalType === 'overnight') {
    const elapsedHours = differenceInHours(now, checkIn);
    // Tính số ngày/đêm bằng cách làm tròn lên mỗi 24 giờ, tối thiểu 1
    const units = Math.max(1, Math.ceil(elapsedHours / 24));
    const unitPrice = rentalType === 'daily' ? prices.daily : prices.overnight;
    return { amount: units * unitPrice, isCeilingHit: false };
  }

  return { amount: 0, isCeilingHit: false };
}
