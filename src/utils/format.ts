
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

// Hàm tiện ích để xác định màu chữ tương phản
export const getContrastTextColor = (hexColor: string): string => {
  if (!hexColor) return 'black'; // Mặc định nếu không có màu

  // Chuyển đổi hex sang RGB
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  // Tính toán độ sáng (Luminance) theo công thức ITU-R BT.709
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  // Sử dụng ngưỡng 0.5 để quyết định màu chữ
  return luminance > 0.5 ? 'black' : 'white';
};
