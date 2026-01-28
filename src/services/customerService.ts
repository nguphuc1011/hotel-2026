
import { supabase } from '@/lib/supabase';

export interface Customer {
  id: string;
  full_name: string;
  phone: string | null;
  id_card: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_banned: boolean;
  balance: number;
  created_at: string;
  updated_at?: string;
}

export interface CustomerTransaction {
  id: string;
  customer_id: string;
  type: 'payment' | 'charge' | 'adjustment' | 'refund';
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  booking_id: string | null;
  created_at: string;
  created_by?: string;
}

export interface CustomerFilter {
  search?: string;
  is_banned?: boolean;
  page?: number;
  limit?: number;
}

export const customerService = {
  async getCustomers(filter: CustomerFilter = {}) {
    try {
      let query = supabase
        .from('customers')
        .select('*', { count: 'exact' });

      if (filter.search) {
        query = query.or(`full_name.ilike.%${filter.search}%,phone.ilike.%${filter.search}%,id_card.ilike.%${filter.search}%`);
      }

      if (filter.is_banned !== undefined) {
        query = query.eq('is_banned', filter.is_banned);
      }

      const page = filter.page || 1;
      const limit = filter.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query
        .order('updated_at', { ascending: false }) // Recent updated first
        .range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data as Customer[],
        total: count || 0,
        page,
        limit
      };
    } catch (err) {
      console.error('Error fetching customers:', err);
      return { data: [], total: 0, page: 1, limit: 20 };
    }
  },

  async getCustomerById(id: string): Promise<Customer | null> {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Customer;
    } catch (err) {
      console.error('Error fetching customer:', err);
      return null;
    }
  },

  async createCustomer(customer: Partial<Customer>): Promise<Customer | null> {
    try {
      // Clean undefined and empty strings
      const payload: any = { ...customer };
      if (!payload.balance) payload.balance = 0;
      
      // Convert empty strings to null for fields that might have UNIQUE constraints
      if (payload.id_card === '') payload.id_card = null;
      if (payload.phone === '') payload.phone = null;
      if (payload.email === '') payload.email = null;

      const { data, error } = await supabase
        .from('customers')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('Supabase error creating customer:', error);
        throw error;
      }
      return data as Customer;
    } catch (err: any) {
      console.error('Error creating customer:', {
        message: err.message,
        details: err.details,
        hint: err.hint,
        code: err.code,
        payload: customer
      });
      return null;
    }
  },

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer | null> {
    try {
      const payload: any = { ...updates, updated_at: new Date().toISOString() };
      
      // Convert empty strings to null for fields that might have UNIQUE constraints
      if (payload.id_card === '') payload.id_card = null;
      if (payload.phone === '') payload.phone = null;
      if (payload.email === '') payload.email = null;

      const { data, error } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Customer;
    } catch (err) {
      console.error('Error updating customer:', err);
      return null;
    }
  },

  async getTransactions(customerId: string): Promise<CustomerTransaction[]> {
    try {
      const { data, error } = await supabase
        .from('customer_transactions')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CustomerTransaction[];
    } catch (err) {
      console.error('Error fetching transactions:', err);
      return [];
    }
  },

  async getCustomerBookings(customerId: string) {
    try {
      if (!customerId || customerId === 'undefined') return [];
      
      // Basic UUID validation to prevent Postgres errors
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(customerId)) {
        console.warn('Invalid customerId for bookings fetch:', customerId);
        return [];
      }
      
      // 1. Fetch bookings
      const { data: bookings, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('customer_id', customerId)
        .order('check_in_actual', { ascending: false });

      if (error) throw error;
      if (!bookings || bookings.length === 0) return [];

      // 2. Fetch room details manually to avoid join issues
      const roomIds = Array.from(new Set(bookings.map(b => b.room_id).filter(Boolean)));
      if (roomIds.length > 0) {
        const { data: rooms, error: roomError } = await supabase
          .from('rooms')
          .select('id, room_number')
          .in('id', roomIds);
        
        if (!roomError && rooms) {
          // 3. Merge data
          return bookings.map(b => ({
            ...b,
            room: rooms.find(r => r.id === b.room_id)
          }));
        }
      }

      return bookings;
    } catch (err: any) {
      console.error('Error fetching customer bookings:', {
        message: err.message,
        details: err.details,
        hint: err.hint,
        code: err.code
      });
      return [];
    }
  },

  async deleteCustomer(id: string): Promise<{ success: boolean; message: string }> {
    try {
      // Check if customer has transactions or bookings to prevent accidental data loss or FK error
      // Actually let the DB enforce FK, but we can catch it.
      // Or we can check first for better UX
      
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) {
        if (error.code === '23503') { // Foreign key violation
          return { success: false, message: 'Không thể xóa khách hàng đã có giao dịch hoặc lịch sử thuê phòng. Hãy dùng chức năng "Cấm" thay thế.' };
        }
        throw error;
      }
      return { success: true, message: 'Xóa khách hàng thành công' };
    } catch (err) {
      console.error('Error deleting customer:', err);
      return { success: false, message: 'Lỗi khi xóa khách hàng' };
    }
  },

  async adjustBalance(
    customerId: string, 
    amount: number, 
    type: 'payment' | 'charge' | 'adjustment' | 'refund', 
    description: string,
    verifiedStaff?: { id: string, name: string },
    paymentMethod: string = 'cash'
  ) {
    try {
      const { data, error } = await supabase.rpc('adjust_customer_balance', {
        p_customer_id: customerId,
        p_amount: amount,
        p_type: type,
        p_description: description,
        p_verified_by_staff_id: verifiedStaff?.id || null,
        p_verified_by_staff_name: verifiedStaff?.name || null,
        p_payment_method: paymentMethod
      });

      if (error) throw error;
      return data; // { success, new_balance, message }
    } catch (err: any) {
      console.error('Error adjusting balance:', err.message || err);
      return { success: false, message: err.message || 'Lỗi hệ thống' };
    }
  },

  async getOrCreateWalkInCustomer(): Promise<Customer | null> {
    try {
      const WALK_IN_NAME = 'Khách vãng lai';
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('full_name', WALK_IN_NAME)
        .limit(1);
      
      if (error) throw error;
      
      const existing = Array.isArray(data) ? data[0] : null;
      if (existing) return existing as Customer;
      
      const created = await this.createCustomer({ full_name: WALK_IN_NAME, balance: 0 });
      return created;
    } catch (err) {
      console.error('Error getting/creating walk-in customer:', err);
      return null;
    }
  }
};
