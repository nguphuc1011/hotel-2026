import { supabase } from '@/lib/supabase';

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
  base_price: number;
  early_surcharge: number;
  late_surcharge: number;
  extra_people_surcharge?: number;
  custom_surcharge: number;
  service_charges: any[];
  service_total: number;
  
  // Subtotal
  subtotal: number;
  
  // Taxes
  service_fee_percent: number;
  service_fee_amount: number;
  vat_percent: number;
  vat_amount: number;
  
  // Finals
  total_amount: number; // Before discount
  discount_amount: number;
  final_amount: number; // After discount
  
  // Payments
  deposit_amount: number;
  amount_to_pay: number;
  
  // Debt
  customer_balance: number;
  total_receivable: number;
}

export const bookingService = {
  async calculateBill(bookingId: string): Promise<BookingBill | null> {
    try {
      // Use the merged V2 Billing Engine (Rule 4 compliant)
      const { data, error } = await supabase
        .rpc('calculate_booking_bill_v2', { p_booking_id: bookingId });

      if (error) {
        console.error('RPC Error details:', JSON.stringify(error, null, 2));
        throw error;
      }

      if (!data || !data.success) {
        console.error('Error or no data returned from calculate_booking_bill_v2:', data?.message);
        return null;
      }
      
      // Map the response structure to BookingBill interface
      // Note: calculate_booking_bill_v2 returns all necessary fields with aliases for compatibility
      return {
          success: true,
          booking_id: data.booking_id,
          room_number: data.room_number,
          customer_name: data.customer_name,
          rental_type: data.rental_type,
          
          check_in_at: data.check_in_at,
          check_out_at: data.check_out_at,
          duration_text: data.duration_text,
          duration_min: data.duration_minutes || 0,
          
          room_charge: data.room_charge,
          base_price: data.room_charge, // Base price is the room charge
          
          early_surcharge: data.early_surcharge || 0,
          late_surcharge: data.late_surcharge || 0,
          extra_people_surcharge: data.extra_people_surcharge || 0,
          custom_surcharge: data.custom_surcharge || 0,
          
          service_total: data.service_total || 0,
          service_charges: data.service_charges || [],
          
          subtotal: data.total_amount, // Subtotal before discount
          service_fee_percent: 0, 
          service_fee_amount: 0,
          vat_percent: 0, 
          vat_amount: 0,
          
          total_amount: data.total_amount,
          discount_amount: data.discount_amount,
          final_amount: data.total_final, 
          
          deposit_amount: data.deposit_amount,
          amount_to_pay: data.amount_to_pay,
          
          customer_id: data.customer_id,
          customer_balance: data.customer_balance,
          total_receivable: data.total_receivable
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
  }): Promise<{ success: boolean; message: string; bill?: any }> {
    try {
      const { data, error } = await supabase.rpc('process_checkout_v2', {
        p_booking_id: params.bill.booking_id,
        p_payment_method: params.paymentMethod,
        p_amount_paid: params.amountPaid,
        p_discount: params.discount,
        p_surcharge: params.surcharge, // Only pass the custom surcharge part
        p_notes: params.notes
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
      });

      if (error) throw error;
      return result;
    } catch (err) {
      console.error('Check-in error:', err);
      throw err;
    }
  },

  async cancelBooking(bookingId: string) {
    try {
      // 1. Get booking info to know the room
      const { data: booking, error: getError } = await supabase
        .from('bookings')
        .select('room_id')
        .eq('id', bookingId)
        .single();
      
      if (getError) throw getError;

      // 2. Update booking status
      const { error: updateBookingError } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId);

      if (updateBookingError) throw updateBookingError;

      // 3. Reset room status
      if (booking?.room_id) {
        const { error: updateRoomError } = await supabase
          .from('rooms')
          .update({ 
            status: 'available',
            current_booking_id: null,
            last_status_change: new Date().toISOString()
          })
          .eq('id', booking.room_id);
        
        if (updateRoomError) throw updateRoomError;
      }

      return { success: true };
    } catch (err) {
      console.error('Cancel booking error:', err);
      throw err;
    }
  }
};
