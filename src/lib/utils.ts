import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, isValid } from "date-fns";
import { vi } from "date-fns/locale";
import { TimeRules } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN').format(amount);
}

export function formatDateTime(date: string | Date | undefined, formatStr: string = 'HH:mm dd/MM/yyyy') {
  if (!date) return '...';
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(d)) return '...';
    return format(d, formatStr, { locale: vi });
  } catch (e) {
    return '...';
  }
}

export function formatDuration(minutes: number): string {
  if (minutes < 0) return '0 phút';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} phút`;
  return `${hours}h ${mins}p`;
}

export function parseCurrency(value: string): number {
  return Number(value.replace(/\./g, ''));
}

export function formatInputCurrency(value: string): string {
  const numericValue = value.replace(/\D/g, '');
  if (!numericValue) return '';
  return new Intl.NumberFormat('vi-VN').format(Number(numericValue));
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
