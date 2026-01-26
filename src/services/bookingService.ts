import { supabase } from '@/lib/supabase';

// Helper function to format duration
function formatDuration(hours: number | undefined | null, minutes: number | undefined | null): string {
  const h = hours || 0;
  const m = minutes || 0;
  if (h > 0) {
    return `${h} giờ ${m} phút`;
  }
  return `${m} phút`;
}

export interface BookingBill {
  success: boolean;
  booking_id: string;
  customer_id?: string;
  room_number: string;
  customer_name: string;
  rental_type: 'hourly' | 'daily' | 'overnight';
  
  // Time
  check_in_at: string;
  check_out_at: string;
  duration_text: string;
  duration_min: number;
  
  // Price Breakdown
  room_charge: number;
  surcharge_total: number; // Tổng phụ thu (sớm, muộn, người thêm)
  custom_surcharge: number;
  service_charges: any[];
  service_total: number;
  
  // Totals
  subtotal: number; // Tổng trước thuế/phí
  service_fee_amount: number;
  vat_amount: number;
  total_amount: number; // Tổng sau thuế/phí, trước giảm giá
  discount_amount: number;
  final_amount: number; // Tổng cuối cùng khách phải trả cho booking này
  
  // Payments
  deposit_amount: number;
  amount_to_pay: number; // Số tiền còn lại cần thanh toán (final_amount - deposit)
  
  // Customer Balance
  customer_balance: number;
  explanation?: string[];
}

export const bookingService = {
  async calculateBill(bookingId: string, nowOverride?: string): Promise<BookingBill | null> {
    try {
      // Use the standardized Billing Engine
      const { data, error } = await supabase
        .rpc('calculate_booking_bill', { 
          p_booking_id: bookingId,
          p_now_override: nowOverride || null
        });

      if (error) {
        console.error('RPC Error details:', JSON.stringify(error, null, 2));
        throw error;
      }

      if (!data || !data.success) {
        console.error('Error or no data returned from calculate_booking_bill:', data?.message);
        return null;
      }
      
      // Map the response structure to BookingBill interface
      return {
          success: true,
          booking_id: data.booking_id,
          room_number: data.room_name,
          customer_name: data.customer_name,
          rental_type: data.rental_type,
          
          check_in_at: data.check_in_at,
          check_out_at: data.check_out_at,
          duration_text: formatDuration(data.duration_hours, data.duration_minutes),
          duration_min: data.duration_minutes || 0,
          
          room_charge: data.room_charge,
          surcharge_total: (data.surcharge_amount || 0) + (data.extra_person_charge || 0),
          custom_surcharge: data.custom_surcharge || 0,
          
          service_total: data.service_total || 0,
          service_charges: data.service_items || [],
          
          subtotal: data.sub_total,
          service_fee_amount: data.service_fee_amount || 0,
          vat_amount: data.vat_amount || 0,
          
          total_amount: data.total_amount,
          discount_amount: data.discount_amount,
          final_amount: data.total_amount,
          
          deposit_amount: data.deposit_amount,
          amount_to_pay: data.amount_to_pay,
          
          customer_id: data.customer_id,
          customer_balance: data.customer_balance,
          explanation: data.explanation || []
      };
    } catch (err: any) {
      console.error('Error calculating bill:', err.message || err);
      return null;
    }
  },

  async processCheckout(params: {
    bill: BookingBill;
    paymentMethod: string;
    amountPaid: number;
    discount: number;
    surcharge: number;
    notes: string;
    verifiedStaff?: { id: string, name: string };
  }): Promise<{ success: boolean; message: string; bill?: any }> {
    try {
      const { data, error } = await supabase.rpc('process_checkout', {
        p_booking_id: params.bill.booking_id,
        p_payment_method: params.paymentMethod,
        p_amount_paid: params.amountPaid,
        p_discount: params.discount,
        p_surcharge: params.surcharge,
        p_notes: params.notes,
        p_staff_id: params.verifiedStaff?.id || null
      });

      if (error) {
        console.error('Checkout RPC Error:', JSON.stringify(error, null, 2));
        throw error;
      }

      return data;
    } catch (err: any) {
      console.error('Error processing checkout:', err.message || err);
      return { success: false, message: err.message || 'Lỗi hệ thống khi thanh toán' };
    }
  },

  async checkIn(data: {
    room_id: string;
    rental_type: 'hourly' | 'daily' | 'overnight';
    customer_id?: string;
    deposit?: number;
    services?: { id: string; quantity: number; price: number }[];
    customer_name?: string;
    extra_adults?: number;
    extra_children?: number;
    notes?: string;
    custom_price?: number;
    custom_price_reason?: string;
    source?: string;
    verifiedStaff?: { id: string, name: string };
  }) {
    try {
      const servicesPayload = (data.services || []).map((s) => ({
        id: s.id,
        quantity: s.quantity,
        price: s.price,
      }));

      const { data: result, error } = await supabase.rpc('check_in_customer', {
        p_room_id: data.room_id,
        p_rental_type: data.rental_type,
        p_customer_id: data.customer_id || null,
        p_deposit: data.deposit || 0,
        p_services: servicesPayload,
        p_customer_name: data.customer_name || null,
        p_extra_adults: data.extra_adults || 0,
        p_extra_children: data.extra_children || 0,
        p_notes: data.notes || null,
        p_custom_price: data.custom_price ?? null,
        p_custom_price_reason: data.custom_price_reason ?? null,
        p_source: data.source || 'direct',
        p_verified_by_staff_id: data.verifiedStaff?.id || null,
        p_verified_by_staff_name: data.verifiedStaff?.name || null
      });

      if (error) throw error;
      return result;
    } catch (err) {
      console.error('Check-in error:', err);
      throw err;
    }
  },

  async cancelBooking(bookingId: string, verifiedStaff?: { id: string, name: string }, reason?: string) {
    try {
      const { data, error } = await supabase.rpc('cancel_booking', {
        p_booking_id: bookingId,
        p_verified_by_staff_id: verifiedStaff?.id || null,
        p_verified_by_staff_name: verifiedStaff?.name || null
      });

      if (error) throw error;
      return { success: true, message: 'Hủy phòng thành công' };
    } catch (err: any) {
      console.error('Cancel booking error:', err);
      throw err;
    }
  }
};
