import { differenceInMinutes, parse, isAfter, addDays, startOfDay, differenceInHours } from 'date-fns';
import { TimeRules, Room, Setting } from '@/types';

export interface PricingBreakdown {
  total_amount: number;      // Tổng phải thu
  room_charge: number;       // Tiền phòng gốc (bao gồm cả phụ thu)
  service_charge: number;    // Tiền dịch vụ (mặc định 0 trong hàm này)
  surcharge: number;         // Tiền phụ thu trễ giờ/sớm
  tax_details: {
    room_tax: number;        // (Tiền phòng + phụ thu) * % Thuế Lưu trú
    service_tax: number;     // Tiền dịch vụ * % Thuế Dịch vụ
  };
  summary: {
    days?: number;
    hours?: number;
    rental_type: string;
    is_overnight: boolean;
  };
}

/**
 * BỘ NÃO TÍNH GIÁ HOTEL 2026
 * Xử lý logic Hourly, Daily, Overnight và Thuế AI 2026
 */
export function calculateRoomPrice(
  checkInTime: Date,
  checkOutTime: Date,
  settings: Setting[],
  roomPrices: Room['prices'],
  rentalType: 'hourly' | 'daily' | 'overnight'
): PricingBreakdown {
  
  // 1. Lấy cấu hình hệ thống
  const systemSetting = settings.find(s => s.key === 'system_settings');
  const timeRules: TimeRules & { full_day_late_after?: string } = systemSetting?.value || {
    check_in: '14:00',
    check_out: '12:00',
    overnight: { start: '22:00', end: '08:00' },
    early_rules: [],
    late_rules: [],
    full_day_late_after: '18:00'
  };

  const taxConfig = systemSetting?.tax_config || { stay_tax: 5, service_tax: 1.5 };
  
  let room_charge = 0;
  let surcharge = 0;
  let summary = {
    rental_type: rentalType,
    is_overnight: false,
    days: 0,
    hours: 0
  };

  const diffMinutes = differenceInMinutes(checkOutTime, checkInTime);
  const minutes = Math.max(0, diffMinutes);

  // 2. Xử lý theo từng loại hình thuê
  if (rentalType === 'hourly') {
    // Logic: Giá giờ đầu + (Tổng giờ - 1) * Giá giờ tiếp. Làm tròn lên (61p = 2h)
    const totalHours = Math.max(1, Math.ceil(minutes / 60));
    room_charge = roomPrices.hourly + (totalHours - 1) * roomPrices.next_hour;
    summary.hours = totalHours;
  } 
  else if (rentalType === 'overnight') {
    // Logic: Giá phẳng cho khung giờ đêm
    room_charge = roomPrices.overnight;
    summary.is_overnight = true;
  } 
  else if (rentalType === 'daily') {
    // Logic Thuê Ngày (Phức tạp nhất)
    const diffDays = Math.max(1, Math.ceil(minutes / (24 * 60)));
    room_charge = diffDays * roomPrices.daily;
    summary.days = diffDays;

    // Tính phụ thu trễ giờ (Late Surcharge) cho ngày cuối cùng
    const [coH, coM] = timeRules.check_out.split(':').map(Number);
    const [lateH, lateM] = (timeRules.full_day_late_after || '18:00').split(':').map(Number);

    // Mốc trả phòng chuẩn của ngày cuối
    const standardCheckOut = new Date(checkOutTime);
    standardCheckOut.setHours(coH, coM, 0, 0);

    // Mốc "Ăn gian" (Late Threshold)
    const lateThreshold = new Date(checkOutTime);
    lateThreshold.setHours(lateH, lateM, 0, 0);

    if (isAfter(checkOutTime, lateThreshold)) {
      // Trường hợp 1: Trả sau Late Threshold -> Tính thêm 1 ngày
      surcharge = roomPrices.daily;
      summary.days! += 1;
    } 
    else if (isAfter(checkOutTime, standardCheckOut)) {
      // Trường hợp 2: Trả sau 12:00 nhưng trước Late Threshold -> Tính % theo late_rules
      const checkOutStr = `${checkOutTime.getHours().toString().padStart(2, '0')}:${checkOutTime.getMinutes().toString().padStart(2, '0')}`;
      
      // Tìm rule phù hợp nhất (lấy mốc % cao nhất thỏa mãn)
      const applicableRule = [...(timeRules.late_rules || [])]
        .sort((a, b) => b.percent - a.percent)
        .find(rule => checkOutStr >= rule.from && checkOutStr <= rule.to);

      if (applicableRule) {
        surcharge = (roomPrices.daily * applicableRule.percent) / 100;
      }
    }
  }

  // 3. Logic Tách Thuế 2026
  const room_tax = ((room_charge + surcharge) * taxConfig.stay_tax) / 100;
  const service_charge = 0; // Sẽ tính thêm ở FolioModal nếu có
  const service_tax = (service_charge * taxConfig.service_tax) / 100;

  const total_amount = room_charge + surcharge + service_charge + room_tax + service_tax;

  return {
    total_amount: Math.round(total_amount),
    room_charge: room_charge,
    service_charge: service_charge,
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
