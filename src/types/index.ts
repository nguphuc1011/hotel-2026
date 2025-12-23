export type RoomStatus = 'available' | 'hourly' | 'daily' | 'overnight' | 'dirty' | 'repair';
export type RentalType = 'hourly' | 'daily' | 'overnight';
export type BookingStatus = 'active' | 'completed' | 'cancelled';

export interface Room {
  id: string;
  room_number: string;
  room_type: string;
  area: string;
  status: RoomStatus;
  prices: {
    hourly: number;
    next_hour: number;
    overnight: number;
    daily: number;
  };
  enable_overnight: boolean;
  current_booking_id?: string;
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  id_card: string;
  plate_number?: string;
  total_spent: number;
  visit_count: number;
}

export interface Service {
  id: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  icon?: string;
}

export interface Booking {
  id: string;
  room_id: string;
  customer_id?: string;
  check_in_at: string;
  check_out_at?: string;
  rental_type: RentalType;
  initial_price: number;
  deposit_amount: number;
  services_used: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    total: number;
  }>;
  prepayments: number;
  logs: Array<{
    time: string;
    action: string;
    detail: string;
  }>;
  room_charge_locked: number;
  status: BookingStatus;
}

export interface Invoice {
  id: string;
  booking_id: string;
  room_name: string;
  customer_name: string;
  total_amount: number;
  final_collection: number;
  created_at?: string;
}

export interface Expense {
  id: string;
  amount: number;
  description: string;
  category: string;
  created_at: string;
}

export interface Setting {
  id: string;
  key: string;
  value: any;
}

export interface TimeRules {
  check_in: string;
  check_out: string;
  overnight: {
    start: string;
    end: string;
  };
  early_rules: Array<{ from: string; to: string; percent: number }>;
  late_rules: Array<{ from: string; to: string; percent: number }>;
}
