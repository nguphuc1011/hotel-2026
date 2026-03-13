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

  if (rentalType === 'hourly') {
    const baseMin = (prices.base_hourly_limit || 1) * 60;
    
    // Within base period (+ grace)
    if (elapsedMin <= baseMin + graceMin) {
      return prices.hourly;
    }
    
    // Extra units
    const extraMin = elapsedMin - baseMin;
    const units = Math.ceil(extraMin / (prices.hourly_unit || 60));
    // Sử dụng price_next_hour nếu có, nếu không thì dùng giá trung bình (fallback)
    const unitPrice = prices.price_next_hour > 0 ? prices.price_next_hour : (prices.hourly / (prices.base_hourly_limit || 1));
    return prices.hourly + (units * unitPrice);
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
