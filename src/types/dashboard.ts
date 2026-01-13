export type RoomStatus = 'available' | 'occupied' | 'dirty' | 'repair';
export type BookingType = 'hourly' | 'daily' | 'overnight';

export interface Room {
  id: string;
  name: string; // Room number (e.g., "101")
  category_id: string;
  category_name?: string; // e.g., "VIP", "Standard"
  price_hourly?: number;
  price_daily?: number;
  price_overnight?: number;
  status: RoomStatus;
  clean_status?: 'clean' | 'dirty'; // Sometimes separate from main status
  last_cleaned_at?: string;
  notes?: string;
}

export interface Booking {
  id: string;
  room_id: string;
  customer_id?: string;
  customer_name?: string;
  check_in_at: string;
  check_out_at?: string;
  booking_type: BookingType;
  total_amount?: number; // Calculated amount
  prepayment?: number;
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
}

export interface DashboardRoom extends Room {
  current_booking?: Booking;
  is_dirty_overdue?: boolean; // For "Clean Eye" feature
}
