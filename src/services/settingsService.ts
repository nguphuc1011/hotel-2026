
import { supabase } from '@/lib/supabase';

export interface SurchargeRule {
  type: 'Early' | 'Late';
  from_minute: number;
  to_minute: number;
  percentage: number;
}

export interface Settings {
  key: string;
  check_in_time: string;
  check_out_time: string;
  overnight_start_time: string;
  overnight_end_time: string;
  overnight_checkout_time: string;
  
  // Mốc tự động tính thêm ngày
  full_day_early_before: string;
  full_day_late_after: string;
  
  // Nút gạt tổng
  auto_surcharge_enabled: boolean;
  extra_person_enabled: boolean;
  extra_person_method: 'fixed' | 'percent';
  
  // Ân hạn
  grace_in_enabled: boolean;
  grace_out_enabled: boolean;
  grace_minutes: number;
  
  // Thuế & Phí
  vat_enabled: boolean;
  service_fee_enabled: boolean;
  vat_percent: number;
  service_fee_percent: number;
  
  // Các cấu hình khác
  hourly_unit: number;
  base_hourly_limit: number;
  hourly_ceiling_enabled: boolean;
  hourly_ceiling_percent: number;
  surcharge_rules: SurchargeRule[];
  auto_deduct_inventory: boolean;
  allow_manual_price_override: boolean;
  enable_print_bill: boolean;
  
  updated_at?: string;
}

export interface RoomCategory {
  id: string;
  name: string;
  max_adults: number;
  max_children: number;
  extra_person_enabled: boolean;
  extra_person_method: 'fixed' | 'percent';
  
  // 5 loại giá chính
  price_daily: number;
  price_hourly: number;
  price_next_hour: number;
  price_overnight: number;
  overnight_enabled: boolean;
  price_overnight_late_hour: number;
  
  // Phụ thu người thêm
  price_extra_adult: number;
  price_extra_child: number;

  // Cấu hình Block & Phụ thu mới
  base_hourly_limit: number; // Block đầu (giờ)
  hourly_unit: number;       // Block tiếp theo (phút)
  surcharge_mode: 'percent' | 'amount'; // Cách tính phụ thu
  hourly_surcharge_amount: number;      // Đơn giá phụ thu mỗi giờ
  surcharge_rules?: SurchargeRule[];     // Quy tắc phụ thu theo %
  auto_surcharge_enabled?: boolean;      // Tự động tính phụ thu
  
  updated_at: string;
}

export const settingsService = {
  async getSettings(): Promise<Settings | null> {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('key', 'config')
        .single();

      if (error) {
        // Fallback or just return defaults
        console.warn('Config not found, trying system_settings or defaults');
      }

      const val = data || {};
      
      // Map Flat DB columns to Settings interface
      return {
        key: 'config',
        check_in_time: val.check_in_time || '14:00:00',
        check_out_time: val.check_out_time || '12:00:00',
        overnight_start_time: val.overnight_start_time || '22:00:00',
        overnight_end_time: val.overnight_end_time || '06:00:00',
        overnight_checkout_time: val.overnight_checkout_time || '10:00:00',
        
        full_day_early_before: val.full_day_early_before || '06:00:00',
        full_day_late_after: val.full_day_late_after || '18:00:00',
        
        auto_surcharge_enabled: val.auto_surcharge_enabled ?? false,
        extra_person_enabled: val.extra_person_enabled ?? false,
        extra_person_method: val.extra_person_method || 'percent',
        
        grace_in_enabled: val.grace_in_enabled ?? true,
        grace_out_enabled: val.grace_out_enabled ?? true,
        grace_minutes: val.grace_minutes || 0,
        
        vat_enabled: val.vat_enabled ?? false,
        service_fee_enabled: val.service_fee_enabled ?? false,
        vat_percent: val.vat_percent || 0,
        service_fee_percent: val.service_fee_percent || 0,
        
        hourly_unit: val.hourly_unit || 60,
        base_hourly_limit: val.base_hourly_limit || 1,
        hourly_ceiling_enabled: val.hourly_ceiling_enabled ?? false,
        hourly_ceiling_percent: val.hourly_ceiling_percent || 100,
        surcharge_rules: val.surcharge_rules || [],
        auto_deduct_inventory: val.auto_deduct_inventory ?? true,
        allow_manual_price_override: true,
        enable_print_bill: val.enable_print_bill ?? true,
        
        updated_at: val.updated_at
      } as Settings;
    } catch (err: any) {
      console.error('Error fetching settings:', err);
      return null;
    }
  },

  async updateSettings(settings: Partial<Settings>): Promise<Settings | null> {
    try {
      // Direct update since we use flat columns now
      const updatePayload = {
        check_in_time: settings.check_in_time,
        check_out_time: settings.check_out_time,
        overnight_start_time: settings.overnight_start_time,
        overnight_end_time: settings.overnight_end_time,
        overnight_checkout_time: settings.overnight_checkout_time,
        
        full_day_early_before: settings.full_day_early_before,
        full_day_late_after: settings.full_day_late_after,
        
        auto_surcharge_enabled: settings.auto_surcharge_enabled,
        extra_person_enabled: settings.extra_person_enabled,
        extra_person_method: settings.extra_person_method,
        
        grace_in_enabled: settings.grace_in_enabled,
        grace_out_enabled: settings.grace_out_enabled,
        grace_minutes: settings.grace_minutes,
        
        vat_enabled: settings.vat_enabled,
        service_fee_enabled: settings.service_fee_enabled,
        vat_percent: settings.vat_percent,
        service_fee_percent: settings.service_fee_percent,
        
        hourly_unit: settings.hourly_unit,
        base_hourly_limit: settings.base_hourly_limit,
        hourly_ceiling_enabled: settings.hourly_ceiling_enabled,
        hourly_ceiling_percent: settings.hourly_ceiling_percent,
        surcharge_rules: settings.surcharge_rules,
        auto_deduct_inventory: settings.auto_deduct_inventory,
        enable_print_bill: settings.enable_print_bill
      };

      // Remove undefined keys
      Object.keys(updatePayload).forEach(key => 
        (updatePayload as any)[key] === undefined && delete (updatePayload as any)[key]
      );

      const { data, error } = await supabase
        .from('settings')
        .update(updatePayload)
        .eq('key', 'config')
        .select()
        .single();

      if (error) throw error;
      
      // Map back to interface
      const val = data;
      return {
        ...settings,
        key: 'config',
        updated_at: val.updated_at
      } as Settings;
    } catch (err: any) {
      console.error('Error updating settings:', err);
      return null;
    }
  },

  async getRoomCategories(): Promise<RoomCategory[]> {
    try {
      const { data, error } = await supabase
        .from('room_categories')
        .select('*')
        .order('name');
      
      if (error) throw error;
      
    // Map Flat structure (already flat in DB now)
      return (data || []).map((item: any) => ({
        ...item,
        // Ensure defaults for numbers
        price_daily: item.price_daily || 0,
        price_hourly: item.price_hourly || 0,
        price_next_hour: item.price_next_hour || 0,
        price_overnight: item.price_overnight || 0,
        overnight_enabled: item.overnight_enabled ?? true,
        price_overnight_late_hour: item.price_overnight_late_hour || 12,
        price_extra_adult: item.price_extra_adult || 0,
        price_extra_child: item.price_extra_child || 0,
        
        // Ensure defaults for others
        max_adults: item.max_adults || 1,
        max_children: item.max_children || 0,
        extra_person_enabled: item.extra_person_enabled ?? false,
        extra_person_method: item.extra_person_method || 'fixed',
        base_hourly_limit: item.base_hourly_limit || 1,
        hourly_unit: item.hourly_unit || 60,
        surcharge_mode: item.surcharge_mode || 'amount',
        hourly_surcharge_amount: item.hourly_surcharge_amount || 0,
        auto_surcharge_enabled: item.auto_surcharge_enabled ?? false,
        surcharge_rules: item.surcharge_rules || []
      })) as RoomCategory[];
    } catch (err: any) {
      console.error('Error fetching room categories:', err);
      return [];
    }
  },

  async updateRoomCategory(id: string, category: Partial<RoomCategory>): Promise<RoomCategory | null> {
    try {
      // Direct update for flat columns
      const { id: _, updated_at, ...updateData } = category as any;
      
      const { data, error } = await supabase
        .from('room_categories')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      // Return mapped data (reuse same logic or just return as is since it's flat)
      const item = data;
      return {
        ...item,
        price_daily: item.price_daily || 0,
        price_hourly: item.price_hourly || 0,
        price_next_hour: item.price_next_hour || 0,
        price_overnight: item.price_overnight || 0,
        overnight_enabled: item.overnight_enabled ?? true,
        price_overnight_late_hour: item.price_overnight_late_hour || 12,
        price_extra_adult: item.price_extra_adult || 0,
        price_extra_child: item.price_extra_child || 0
      } as RoomCategory;
    } catch (err: any) {
      console.error('Error updating room category:', err);
      return null;
    }
  },

  async createRoomCategory(category: Partial<RoomCategory>): Promise<RoomCategory | null> {
    try {
      const { id, updated_at, ...payload } = category as any;
      
      if (payload.overnight_enabled === undefined) {
        payload.overnight_enabled = true;
      }

      const { data, error } = await supabase
        .from('room_categories')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      
      const item = data;
      return {
        ...item,
        price_daily: item.price_daily || 0,
        price_hourly: item.price_hourly || 0,
        price_next_hour: item.price_next_hour || 0,
        price_overnight: item.price_overnight || 0,
        overnight_enabled: item.overnight_enabled ?? true,
        price_overnight_late_hour: item.price_overnight_late_hour || 12,
        price_extra_adult: item.price_extra_adult || 0,
        price_extra_child: item.price_extra_child || 0
      } as RoomCategory;
    } catch (err: any) {
      console.error('Error creating room category:', err);
      return null;
    }
  },

  async deleteRoomCategory(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('room_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (err: any) {
      console.error('Error deleting room category:', err);
      return false;
    }
  }
};
