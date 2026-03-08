export interface Room {
  id: string;
  name: string;
  room_category_id: string;
  floor: number;
  status: 'available' | 'occupied' | 'maintenance' | 'cleaning';
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface RoomCategory {
  id: string;
  name: string;
  description?: string;
  price_hourly: number;
  price_next_hour: number;
  price_daily: number;
  price_overnight: number;
  max_occupancy: number;
  extra_adult_fee: number;
  extra_child_fee: number;
  overnight_enabled: boolean;
  hourly_unit: number;
  base_hourly_limit: number;
  created_at: Date;
  updated_at: Date;
}

export interface RoomWithCategory extends Room {
  room_category: RoomCategory;
}

export interface RoomStatus {
  id: string;
  name: string;
  status: string;
  floor: number;
  category_name: string;
  current_booking?: {
    id: string;
    customer_name: string;
    check_in: Date;
    check_out: Date;
  };
}