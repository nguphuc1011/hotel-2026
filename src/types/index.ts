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
  voice_alias?: string;
  current_booking_id?: string;
  last_status_change?: string;
  current_booking?: Booking & { customer?: Customer };
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  id_card: string;
  address?: string;
  total_spent: number;
  visit_count: number;
  notes?: string;
  ocr_data?: any;
}

export interface Service {
  id: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  icon?: string;
  tax_type: 'service' | 'accommodation' | 'goods';
  keywords?: string[];
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_id: string;
  old_value: any;
  new_value: any;
  reason?: string;
  ip_address?: string;
  suspicion_score: number;
  created_at: string;
}

export interface MergedBooking {
  booking_id: string;
  room_number: string;
  amount: number;
  details: PricingBreakdown;
  merged_at: string;
}

export interface CashflowCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
  is_system?: boolean;
}

export interface CashflowTransaction {
  id: string;
  type: 'income' | 'expense';
  category_id: string;
  category_name: string;
  content: string;
  amount: number;
  payment_method: 'cash' | 'transfer';
  created_by: string;
  created_at: string;
  notes?: string;
}

export interface CashflowSummary {
  total_income: number;
  total_expense: number;
  net_profit: number;
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
  merged_bookings?: MergedBooking[];
  prepayments: number;
  logs: Array<{
    time: string;
    action: string;
    detail: string;
  }>;
  room_charge_locked: number;
  system_created_at: string;
  room_charge_suggested: number;
  room_charge_actual: number;
  audit_note?: string;
  custom_surcharge: number;
  status: BookingStatus;
  notes?: string;
  rooms?: {
    room_number: string;
  };
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

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'staff' | 'manager';
  phone?: string;
  permissions?: string[];
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
  tax_code?: string;
  tax_config?: {
    vat: number;
    service_fee: number;
    [key: string]: any;
  };
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
  full_day_early_before?: string;
  full_day_late_after?: string;
  hourly_grace_period_minutes?: number;
  daily_grace_period_hours?: number;
}

export interface PricingBreakdown {
  total_amount: number;
  suggested_total: number;
  room_charge: number;
  service_charge: number;
  surcharge: number;
  tax_details: {
    room_tax: number;
    service_tax: number;
  };
  summary: {
    days?: number;
    hours?: number;
    minutes?: number;
    rental_type: string;
    is_overnight: boolean;
    duration_text: string;
    base_price: number;
    next_hour_price?: number;
    extra_hours?: number;
    extra_hours_charge?: number;
    early_checkin_surcharge?: number;
    late_checkout_surcharge?: number;
  };
}

export interface CheckInData {
  room_id: string;
  customer: {
    name: string;
    phone: string;
    idCard: string;
    address: string;
  };
  rentalType: string;
  price: number;
  deposit: number;
  services: Array<{
    service_id: string;
    quantity: number;
    price: number;
  }>;
  notes: string;
}
