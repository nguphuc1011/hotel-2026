import { useState } from 'react';

export interface CustomerBalanceInfo {
  balance: number;
  isDebt: boolean;
  isCredit: boolean;
  label: string;
  colorClass: string;
  formattedBalance: string;
  absFormattedBalance: string;
}

/**
 * Hook dùng chung để xử lý logic hiển thị số dư khách hàng theo quy ước mới:
 * balance < 0: Nợ (Âm tiền) -> Màu đỏ
 * balance > 0: Dư (Dương tiền) -> Màu xanh
 */
export function useCustomerBalance(balance: number = 0): CustomerBalanceInfo {
  const isDebt = balance < 0;
  const isCredit = balance > 0;
  
  // Định dạng tiền tệ
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);
  };

  return {
    balance,
    isDebt,
    isCredit,
    label: isDebt ? 'Nợ' : (isCredit ? 'Dư' : 'Cân bằng'),
    colorClass: isDebt ? 'text-rose-600' : (isCredit ? 'text-emerald-600' : 'text-slate-600'),
    formattedBalance: formatCurrency(balance),
    absFormattedBalance: formatCurrency(Math.abs(balance)),
  };
}
