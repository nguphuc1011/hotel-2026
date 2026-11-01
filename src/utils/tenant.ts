/**
 * Lấy hotel_id hiện tại của người dùng đang đăng nhập.
 * Đảm bảo mọi truy vấn Service luôn được phân vùng cách ly chặt chẽ theo từng khách sạn (Multi-tenant Isolation).
 */
export function getActiveHotelId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const userStr = localStorage.getItem('1hotel_user');
    if (!userStr) return null;
    const user = JSON.parse(userStr);
    return user?.hotel_id || null;
  } catch {
    return null;
  }
}
