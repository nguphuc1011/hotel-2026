export interface Booking {
  id: string;
  room_id: string;
  customer_id: string;
  check_in: Date;
  check_out: Date;
  status: 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
  rental_type: 'hourly' | 'daily' | 'overnight';
  total_amount: number;
  paid_amount: number;
  created_at: Date;
  updated_at: Date;
}

export interface BookingWithRoomAndCustomer extends Booking {
  room: {
    id: string;
    name: string;
    room_category_id: string;
    status: string;
  };
  room_name?: string; // For backward compatibility
  customer: {
    id: string;
    name: string;
    phone: string;
    email?: string;
  };
  customer_name?: string; // For backward compatibility
}

export interface CreateBookingInput {
  room_id: string;
  customer_id: string;
  check_in: Date;
  check_out: Date;
  rental_type: 'hourly' | 'daily' | 'overnight';
  extra_adults?: number;
  extra_children?: number;
  notes?: string;
}

export interface UpdateBookingInput {
  check_in?: Date;
  check_out?: Date;
  rental_type?: 'hourly' | 'daily' | 'overnight';
  status?: string;
  extra_adults?: number;
  extra_children?: number;
  notes?: string;
}