import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO, isValid } from "date-fns";
import { vi } from "date-fns/locale";

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
