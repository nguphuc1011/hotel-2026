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
  voice_alias?: string; // MỚI: Tên gọi giọng nói cho AI
  current_booking_id?: string;
  current_booking?: Booking & { customer?: Customer };
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  id_card: string;
  plate_number?: string;
  total_spent: number;
  visit_count: number;
  ocr_data?: any; // MỚI: Dữ liệu OCR từ CCCD
}

export interface Service {
  id: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  icon?: string;
  tax_type: 'service' | 'accommodation' | 'goods'; // MỚI: Phân loại thuế
  keywords?: string[]; // MỚI: Từ khóa nhận diện giọng nói
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
  suspicion_score: number; // MỚI: Điểm nghi vấn AI (0-1)
  created_at: string;
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
  tax_code?: string; // MỚI: Mã số thuế
  tax_config?: {     // MỚI: Cấu hình thuế suất
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
}
