export type RoomStatus = 'available' | 'occupied' | 'dirty' | 'repair';
export type BookingType = 'hourly' | 'daily' | 'overnight';

export interface Room {
  id: string;
  name: string; // Room number (e.g., "101")
  category_id: string;
  category_name?: string; // e.g., "VIP", "Standard"
  price_hourly?: number;
  price_next_hour?: number; // THÊM TRƯỜNG NÀY
  price_daily?: number;
  price_overnight?: number;
  base_hourly_limit?: number; // SaaS Dynamic
  hourly_unit?: number;       // SaaS Dynamic
  status: RoomStatus;
  clean_status?: 'clean' | 'dirty'; // Sometimes separate from main status
  last_cleaned_at?: string;
  updated_at?: string;
  notes?: string;
}

export interface PricingLadderPoint {
  time: string;
  amount: number;
  reason?: string;
}

export interface Booking {
  id: string;
  room_id: string;
  customer_id?: string;
  customer_name?: string;
  customer_balance?: number; // New: To track debt
  check_in_at: string;
  check_in_actual?: string; // New: Actual check-in time from DB
  check_out_at?: string;
  booking_type: BookingType;
  total_amount?: number; // Calculated amount
  amount_to_pay?: number; // Calculated amount (total - deposit)
  prepayment?: number;
  deposit_amount?: number; // Actual deposit from DB
  custom_price?: number; // New: Manual price override
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
  notes?: string;
  duration_text?: string;
  parent_booking_id?: string;
  is_group_member?: boolean;
  master_room_name?: string; // e.g. "101" if this booking belongs to master room 101
  pricing_ladder?: PricingLadderPoint[];
  service_total?: number;
  surcharge_amount?: number;
  extra_person_charge?: number;
  discount_amount?: number;
  custom_surcharge?: number;
  explanation?: string[];
}

export interface DashboardRoom extends Room {
  current_booking?: Booking;
  is_dirty_overdue?: boolean;
  is_group_master?: boolean;
  group_count?: number;
  group_color?: string; // Màu sắc để phân biệt nhóm
}
