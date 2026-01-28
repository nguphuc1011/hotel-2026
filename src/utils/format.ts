
export const formatMoney = (amount: number | string | undefined | null) => {
  if (amount === undefined || amount === null) return '0 ₫';
  const num = Number(amount);
  if (isNaN(num)) return '0 ₫';
  
  // Use 'vi-VN' locale and ensure no fraction digits
  return new Intl.NumberFormat('vi-VN', { 
    style: 'currency', 
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num);
};
