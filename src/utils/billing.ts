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
  };
}

/**
 * FE Approximation of room charge for live dashboard display.
 * NOTE: DB remains the source of truth for final checkout.
 */
export function calculateLiveRoomCharge(params: LiveCalculationParams): number {
  const { checkInAt, rentalType, prices, settings } = params;
  const checkIn = new Date(checkInAt);
  const now = new Date();
  
  if (isNaN(checkIn.getTime())) return 0;
  
  const elapsedMin = Math.max(0, differenceInMinutes(now, checkIn));
  const graceMin = settings?.grace_out_enabled ? (settings.grace_minutes || 0) : 0;
  const isGraceOutEnabled = settings?.grace_out_enabled ?? false;

  if (rentalType === 'hourly') {
    const hourlyUnit = prices.hourly_unit || 60;
    const baseHourlyLimit = prices.base_hourly_limit || 1;
    const firstBlockMin = baseHourlyLimit * hourlyUnit;
    
    // 1. Block đầu
    if (elapsedMin <= firstBlockMin) {
      return prices.hourly;
    }

    // 2. Kiểm tra ân hạn cho block đầu
    const extraAfterFirstBlock = elapsedMin - firstBlockMin;
    if (isGraceOutEnabled && extraAfterFirstBlock <= graceMin) {
      return prices.hourly;
    }

    // 3. Tính các block tiếp theo (Mỗi block đều có ân hạn riêng theo logic DB)
    // Logic DB: v_next_blocks := FLOOR(v_remaining_min / v_hourly_unit);
    //           v_remainder_min := MOD(v_remaining_min, v_hourly_unit);
    //           IF v_remainder_min > grace THEN v_next_blocks += 1;
    
    let nextBlocks = Math.floor(extraAfterFirstBlock / hourlyUnit);
    const remainderMin = extraAfterFirstBlock % hourlyUnit;
    
    if (remainderMin > 0) {
      if (!isGraceOutEnabled || remainderMin > graceMin) {
        nextBlocks += 1;
      }
    }

    const unitPrice = prices.price_next_hour > 0 ? prices.price_next_hour : (prices.hourly / baseHourlyLimit);
    return prices.hourly + (nextBlocks * unitPrice);
  } 
  
  if (rentalType === 'daily') {
    const elapsedHours = Math.max(0, differenceInHours(now, checkIn));
    const days = Math.max(1, Math.ceil((elapsedHours - (graceMin / 60)) / 24));
    return days * prices.daily;
  }
  
  if (rentalType === 'overnight') {
    // Overnight is usually a fixed price until checkout or next day
    return prices.overnight;
  }

  return 0;
}
