import { differenceInMinutes, parse, isAfter, addDays, startOfDay, differenceInHours, differenceInCalendarDays, addHours, parseISO } from 'date-fns';
import { TimeRules, Room, Setting, PricingBreakdown } from '@/types';

/**
 * BỘ NÃO TÍNH GIÁ HOTEL 2026 - PHIÊN BẢN LOGIC MỚI
 * Xử lý logic Hourly, Daily, Overnight và Thuế theo nghiệp vụ chuẩn
 */
export function calculateRoomPrice(
  checkInTime: Date | string,
  checkOutTime: Date | string,
  settings: Setting[],
  room: Room,
  rentalType: 'hourly' | 'daily' | 'overnight',
  serviceTotal: number = 0
): PricingBreakdown {
  const parseDate = (d: Date | string) => {
    if (d instanceof Date) return d;
    if (!d) return new Date(NaN);
    try {
      const parsed = parseISO(d);
      if (!isNaN(parsed.getTime())) return parsed;
      const fallback = new Date(d);
      if (!isNaN(fallback.getTime())) return fallback;
    } catch (e) {}
    return new Date(NaN);
  };

  const parsePrice = (p: any): number => {
    if (p === null || p === undefined) return 0;
    if (typeof p === 'number') return p;
    if (typeof p === 'string') {
      const sanitized = p.replace(/[^\d]/g, '');
      const num = parseInt(sanitized, 10);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  const checkIn = parseDate(checkInTime);
  const checkOut = parseDate(checkOutTime);

  let roomPrices = room.prices;
  if (typeof roomPrices === 'string') {
    try {
      roomPrices = JSON.parse(roomPrices);
    } catch (e) {
      roomPrices = { hourly: 0, next_hour: 0, overnight: 0, daily: 0 };
    }
  }
  
  const prices = {
    hourly: parsePrice(roomPrices?.hourly),
    next_hour: parsePrice(roomPrices?.next_hour),
    overnight: parsePrice(roomPrices?.overnight),
    daily: parsePrice(roomPrices?.daily)
  };

  const roomChargeLocked = room.current_booking?.room_charge_locked || 0;

  const systemSetting = settings.find(s => s.key === 'system_settings');
  const value = systemSetting?.value || {};

  const timeRules: Required<TimeRules> = {
    check_in: value.check_in || '14:00',
    check_out: value.check_out || '12:00',
    overnight: value.overnight || { start: '22:00', end: '08:00' },
    early_rules: value.early_rules || [],
    late_rules: value.late_rules || [],
    full_day_early_before: value.full_day_early_before || '05:00',
    full_day_late_after: value.full_day_late_after || '18:00',
    hourly_grace_period_minutes: value.hourly_grace_period_minutes ?? 15,
    daily_grace_period_hours: value.daily_grace_period_hours ?? 2,
  };

  const enableAutoSurcharge = value.enableAutoSurcharge ?? true;
  const taxConfig = systemSetting?.tax_config || { stay_tax: 0, service_tax: 0 }; // Mặc định 0% thuế nếu chưa cài

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    console.error("INVALID DATES DETECTED");
    return {
      total_amount: 0,
      suggested_total: 0,
      room_charge: 0,
      service_charge: serviceTotal,
      surcharge: 0,
      tax_details: { room_tax: 0, service_tax: 0 },
      summary: { rental_type: rentalType, is_overnight: false, duration_text: 'Chưa có giờ vào', days: 0, hours: 0 }
    };
  }

  const minutes = Math.max(0, differenceInMinutes(checkOut, checkIn));

  // Debug log nếu vẫn ra 0đ
  if (prices.hourly === 0 && prices.daily === 0) {
    console.warn(`Cảnh báo: Phòng ${room.room_number} đang bị trống giá trong object room!`, room);
  }

  // --- LOGIC ÂN HẠN (GRACE PERIOD) ---
  const isWithinGracePeriod = minutes > 0 && minutes <= timeRules.hourly_grace_period_minutes;

  let base_charge = 0;
  let surcharge = 0;
  let duration_text = '';
  let summary = {
    rental_type: rentalType,
    is_overnight: false,
    days: 0,
    hours: 0,
    duration_text: ''
  };

  const totalHours = differenceInHours(checkOut, checkIn);
  const remainingMinutes = minutes % 60;

  const getPercentageSurcharge = (time: Date, rules: Array<{ from: string; to: string; percent: number }>, basePrice: number) => {
    if (!rules.length) return 0;
    const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
    const applicableRule = [...rules]
      .sort((a, b) => b.percent - a.percent)
      .find(rule => timeStr >= rule.from && timeStr <= rule.to);
    return applicableRule ? (basePrice * applicableRule.percent) / 100 : 0;
  };

  // 2. Xử lý theo từng loại hình thuê
  if (rentalType === 'hourly') {
    const extraHours = Math.max(0, Math.ceil((minutes - 60) / 60));
    base_charge = prices.hourly + (extraHours * prices.next_hour);
  } 
  else if (rentalType === 'overnight') {
    if (!room.enable_overnight) {
      let effectiveHours = totalHours;
      if (remainingMinutes > timeRules.hourly_grace_period_minutes) effectiveHours += 1;
      effectiveHours = Math.max(1, effectiveHours);
      base_charge = prices.hourly + (effectiveHours - 1) * prices.next_hour;
      summary.hours = effectiveHours;
      summary.rental_type = 'hourly';
      duration_text = `${totalHours}h ${remainingMinutes}p`;
    } else {
      base_charge = prices.overnight;
      summary.is_overnight = true;
      duration_text = `Qua đêm (${totalHours}h ${remainingMinutes}p)`;
      if (enableAutoSurcharge) {
        surcharge += getPercentageSurcharge(checkIn, timeRules.early_rules, prices.overnight);
        surcharge += getPercentageSurcharge(checkOut, timeRules.late_rules, prices.overnight);
      }
    }
  } 
  else if (rentalType === 'daily') {
    const nightsStayed = differenceInCalendarDays(checkOut, checkIn);
    const baseDays = Math.max(1, nightsStayed);
    base_charge = baseDays * prices.daily;
    summary.days = baseDays;
    duration_text = `${baseDays} ngày`;

    if (enableAutoSurcharge) {
      let addedDayForEarly = false;
      let addedDayForLate = false;

      const [checkInH, checkInM] = timeRules.check_in.split(':').map(Number);
      const standardCheckIn = new Date(checkIn);
      standardCheckIn.setHours(checkInH, checkInM, 0, 0);

      if (isAfter(standardCheckIn, checkIn)) {
        const [h, m] = timeRules.full_day_early_before.split(':').map(Number);
        const threshold = new Date(checkIn);
        threshold.setHours(h, m, 0, 0);
        if (isAfter(threshold, checkIn)) {
          surcharge += prices.daily;
          addedDayForEarly = true;
        }
        if (!addedDayForEarly) {
          surcharge += getPercentageSurcharge(checkIn, timeRules.early_rules, prices.daily);
        }
      }

      const [checkOutH, checkOutM] = timeRules.check_out.split(':').map(Number);
      const standardCheckOut = new Date(checkOut);
      standardCheckOut.setHours(checkOutH, checkOutM, 0, 0);
      const gracePeriodEnd = addHours(standardCheckOut, timeRules.daily_grace_period_hours);

      if (isAfter(checkOut, gracePeriodEnd)) {
        const [h, m] = timeRules.full_day_late_after.split(':').map(Number);
        const threshold = new Date(checkOut);
        threshold.setHours(h, m, 0, 0);
        if (isAfter(checkOut, threshold)) {
          surcharge += prices.daily;
          addedDayForLate = true;
        }
        if (!addedDayForLate) {
          surcharge += getPercentageSurcharge(checkOut, timeRules.late_rules, prices.daily);
        }
      }
    }
  }

  summary.duration_text = duration_text;

  const final_base_charge = roomChargeLocked > 0 ? roomChargeLocked : base_charge;
  const room_tax = ((final_base_charge + surcharge) * taxConfig.stay_tax) / 100;
  const service_tax = (serviceTotal * taxConfig.service_tax) / 100;
  const total_amount = final_base_charge + surcharge + serviceTotal + room_tax + service_tax;

  return {
    total_amount: Math.round(total_amount),
    suggested_total: Math.round(total_amount),
    room_charge: final_base_charge,
    service_charge: serviceTotal,
    surcharge: Math.round(surcharge),
    tax_details: {
      room_tax: Math.round(room_tax),
      service_tax: Math.round(service_tax)
    },
    summary
  };
}

/**
 * Gợi ý loại hình thuê dựa trên thời điểm check-in
 */
export function suggestRentalType(checkIn: Date, timeRules: TimeRules): 'hourly' | 'daily' | 'overnight' {
  if (!timeRules?.overnight) return 'hourly';
  
  const [startH, startM] = timeRules.overnight.start.split(':').map(Number);
  const [endH, endM] = timeRules.overnight.end.split(':').map(Number);
  
  const currentH = checkIn.getHours();
  const currentM = checkIn.getMinutes();
  const currentMins = currentH * 60 + currentM;
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;

  // Nếu trong khung giờ đêm
  const isNight = startMins > endMins 
    ? (currentMins >= startMins || currentMins <= endMins)
    : (currentMins >= startMins && currentMins <= endMins);

  if (isNight) return 'overnight';
  
  // Mặc định là theo giờ, người dùng có thể đổi sang ngày
  return 'hourly';
}
