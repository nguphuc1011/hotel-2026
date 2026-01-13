
import { supabase } from '@/lib/supabase';

export interface Service {
  id: string;
  name: string;
  price: number;
  image_url?: string | null;
  
  // Unit fields
  unit?: string;
  unit_sell?: string;      // Đơn vị bán (VD: Lon)
  unit_buy?: string;       // Đơn vị nhập (VD: Thùng)
  conversion_factor?: number; // 1 Thùng = ? Lon

  // Inventory fields
  cost_price?: number;
  stock_quantity?: number;
  min_stock_level?: number;
  track_inventory?: boolean;
  
  is_active?: boolean;
  created_at?: string;
}

export interface InventoryLog {
  id: string;
  service_id: string;
  type: string;
  quantity: number;
  balance_before: number;
  balance_after: number;
  notes?: string;
  created_at: string;
}

export interface BookingServiceItem {
  id: string;
  booking_id: string;
  service_id: string;
  quantity: number;
  price_at_time: number;
  total_price: number;
  service?: Service;
  created_at?: string;
}

export const serviceService = {
  // --- Service Management ---
  async getServices() {
    try {
      let query = supabase
        .from('services')
        .select('*')
        .order('name');

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((s: any) => ({
        ...s,
        unit: s.unit || s.unit_sell || 'cái',
        unit_sell: s.unit_sell || s.unit || 'cái',
        unit_buy: s.unit_buy || 'Thùng',
        conversion_factor: typeof s.conversion_factor === 'number' ? s.conversion_factor : 1,
        is_active: s.is_active !== false,
        stock_quantity: typeof s.stock_quantity === 'number' ? s.stock_quantity : 0,
        min_stock_level: typeof s.min_stock_level === 'number' ? s.min_stock_level : 5,
        track_inventory: !!s.track_inventory,
        cost_price: typeof s.cost_price === 'number' ? s.cost_price : 0
      })) as Service[];
    } catch (err) {
      console.error('Error fetching services:', err);
      return [];
    }
  },

  async getAllServices() { // Include inactive
    try {
        const { data, error } = await supabase
          .from('services')
          .select('*')
          .order('name');
        
        if (error) throw error;
        return (data || []).map((s: any) => ({
            ...s,
            unit: s.unit || s.unit_sell || 'cái',
            unit_sell: s.unit_sell || s.unit || 'cái',
            unit_buy: s.unit_buy || 'Thùng',
            conversion_factor: typeof s.conversion_factor === 'number' ? s.conversion_factor : 1,
            is_active: s.is_active !== false,
            stock_quantity: typeof s.stock_quantity === 'number' ? s.stock_quantity : 0,
            min_stock_level: typeof s.min_stock_level === 'number' ? s.min_stock_level : 5,
            track_inventory: !!s.track_inventory,
            cost_price: typeof s.cost_price === 'number' ? s.cost_price : 0
        })) as Service[];
      } catch (err) {
        console.error('Error fetching services:', err);
        return [];
      }
  },

  async importInventory(serviceId: string, quantity: number, costPrice?: number, notes?: string) {
    try {
        const { data, error } = await supabase.rpc('import_inventory', {
            p_service_id: serviceId,
            p_quantity: quantity,
            p_cost_price: costPrice,
            p_notes: notes
        });

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Error importing inventory:', err);
        return null;
    }
  },

  async adjustInventory(serviceId: string, newQuantity: number, notes?: string) {
    try {
        const { data, error } = await supabase.rpc('adjust_inventory', {
            p_service_id: serviceId,
            p_new_quantity: newQuantity,
            p_notes: notes
        });

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Error adjusting inventory:', err);
        return null;
    }
  },

  async getInventoryLogs(serviceId: string) {
    try {
        const { data, error } = await supabase
            .from('inventory_logs')
            .select('*')
            .eq('service_id', serviceId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as InventoryLog[];
    } catch (err) {
        console.error('Error fetching inventory logs:', err);
        return [];
    }
  },

  async createService(service: Partial<Service>) {
    try {
      const { data, error } = await supabase
        .from('services')
        .insert([service])
        .select()
        .single();
      
      if (error) throw error;
      return data as Service;
    } catch (err) {
      console.error('Error creating service:', err);
      return null;
    }
  },

  async updateService(id: string, updates: Partial<Service>) {
    try {
      const { data, error } = await supabase
        .from('services')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as Service;
    } catch (err) {
      console.error('Error updating service:', err);
      return null;
    }
  },

  async deleteService(id: string) {
    try {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error deleting service:', err);
      return false;
    }
  },

  // --- Booking Services ---
  async getBookingServices(bookingId: string) {
    try {
      // Manual join since foreign key might be missing or relationship not detected if schema mismatch
      const { data: bookingServices, error } = await supabase
        .from('booking_services')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!bookingServices || bookingServices.length === 0) return [];

      // Fetch services details manually
      const serviceIds = bookingServices.map(bs => bs.service_id);
      const { data: services, error: serviceError } = await supabase
        .from('services')
        .select('*')
        .in('id', serviceIds);

      if (serviceError) throw serviceError;

      // Map services back
      return bookingServices.map(bs => {
        const service = services?.find(s => s.id === bs.service_id);
        return {
            ...bs,
            service: service ? {
              ...service,
              unit: service.unit || service.unit_sell || 'cái',
              unit_sell: service.unit_sell || service.unit || 'cái',
              unit_buy: service.unit_buy || 'Thùng',
              conversion_factor: typeof service.conversion_factor === 'number' ? service.conversion_factor : 1,
              stock_quantity: typeof service.stock_quantity === 'number' ? service.stock_quantity : 0,
              min_stock_level: typeof service.min_stock_level === 'number' ? service.min_stock_level : 5,
              track_inventory: !!service.track_inventory
            } : { name: 'Unknown', unit: '?' }
        };
      }) as BookingServiceItem[];

    } catch (err) {
      console.error('Error fetching booking services:', err);
      return [];
    }
  },

  async addServiceToBooking(bookingId: string, serviceId: string, quantity: number, price: number) {
    // Use the new RPC for inventory tracking
    try {
        const { data, error } = await supabase.rpc('register_service_usage', {
            p_booking_id: bookingId,
            p_service_id: serviceId,
            p_quantity: quantity
        });

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Error registering service usage:', err);
        return null;
    }
  },

  async removeServiceFromBooking(id: string) {
    try {
      const { error } = await supabase
        .from('booking_services')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error removing service from booking:', err);
      return false;
    }
  }
};
