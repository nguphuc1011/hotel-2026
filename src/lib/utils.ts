import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN').format(amount);
}

export function parseCurrency(value: string): number {
  return Number(value.replace(/\./g, ''));
}

export function formatInputCurrency(value: string): string {
  const numericValue = value.replace(/\D/g, '');
  if (!numericValue) return '';
  return new Intl.NumberFormat('vi-VN').format(Number(numericValue));
}
