import { supabase } from '@/lib/supabase';
import { useWalletNotificationStore } from '@/stores/walletNotificationStore';

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
  duration_hours: number;
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
  
  // Group Billing
  is_group_bill?: boolean;
  master_booking_id?: string;
  group_total?: number;
  group_members?: any[];
  
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

      // Manual Fetch Group Members if RPC doesn't return them (Safety Fallback)
      let groupMembers = data.group_members || [];
      let groupTotal = data.group_total || 0;
      let isGroupBill = data.is_group_bill || false;

      // Improved Group Detection:
      // Check if this booking IS a master OR HAS a parent
      const { data: bookingInfo } = await supabase
        .from('bookings')
        .select('id, parent_booking_id')
        .eq('id', bookingId)
        .single();

      const masterId = bookingInfo?.parent_booking_id || bookingId;
      
      // Find all members of this group (including master)
      const { data: allMembers } = await supabase
        .from('bookings')
        .select('id, parent_booking_id')
        .or(`id.eq.${masterId},parent_booking_id.eq.${masterId}`)
        .in('status', ['checked_in', 'confirmed', 'occupied']);

      if (allMembers && allMembers.length > 1) {
        isGroupBill = true;
      }

      if (isGroupBill && !groupMembers.length && bookingInfo?.id === masterId) {
        // If I am the master, calculate total for all children
        const memberIds = (allMembers || []).filter(m => m.id !== masterId);
        
        if (memberIds.length > 0) {
           try {
             const memberBills = await Promise.all(
                memberIds.map(m => bookingService.calculateBill(m.id, nowOverride))
             );
             
             const validBills = memberBills.filter(b => b !== null) as BookingBill[];
             
             groupTotal = validBills.reduce((sum, b) => sum + (b.total_amount || 0), 0);
             groupMembers = validBills.map(b => ({
                booking_id: b.booking_id,
                room_name: b.room_number || 'Phòng ?',
                amount: b.total_amount,
                service_total: b.service_total,
                room_charge: b.room_charge
             }));
           } catch (err) {
             console.error('Error calculating member bills:', err);
           }
        }
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
          duration_text: data.duration_text || formatDuration(data.duration_hours, data.duration_minutes),
          duration_hours: data.duration_hours || 0,
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

          is_group_bill: isGroupBill,
          master_booking_id: data.master_booking_id,
          group_total: groupTotal,
          group_members: groupMembers,
          
          // Payments
          deposit_amount: data.deposit_amount || 0,
          amount_to_pay: (data.total_amount - (data.deposit_amount || 0)),
          
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
    selectedChildBookingIds?: string[];
  }): Promise<{ success: boolean; message: string; bill?: any }> {
    try {
      const { data, error } = await supabase.rpc('process_checkout', {
        p_booking_id: params.bill.booking_id,
        p_payment_method: params.paymentMethod,
        p_amount_paid: params.amountPaid,
        p_discount: params.discount,
        p_surcharge: params.surcharge,
        p_notes: params.notes,
        p_verified_by_staff_id: params.verifiedStaff?.id || null,
        p_verified_by_staff_name: params.verifiedStaff?.name || null,
        p_selected_child_ids: params.selectedChildBookingIds || null,
      });

      if (error) {
        console.error('Checkout RPC Error:', JSON.stringify(error, null, 2));
        throw error;
      }

      // Trigger notification if wallet_changes exists
      if (data && data.wallet_changes && Array.isArray(data.wallet_changes) && data.wallet_changes.length > 0) {
        useWalletNotificationStore.getState().showNotification(data.wallet_changes);
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
    payment_method?: string;
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
        p_payment_method: data.payment_method || 'cash',
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

      // Trigger notification if wallet_changes exists
      if (result && result.wallet_changes && Array.isArray(result.wallet_changes) && result.wallet_changes.length > 0) {
        useWalletNotificationStore.getState().showNotification(result.wallet_changes);
      }

      return result;
    } catch (err: any) {
      // Robust error logging for Next.js 16 / Turbopack
      const detailedError = err instanceof Error 
        ? JSON.parse(JSON.stringify(err, Object.getOwnPropertyNames(err)))
        : err;
      
      console.error('Check-in error detailed:', detailedError);
      throw err;
    }
  },

  async cancelBooking(bookingId: string, verifiedStaff?: { id: string, name: string }, penaltyAmount: number = 0, penaltyPaymentMethod: string = 'cash', reason: string = '') {
    try {
      const { data, error } = await supabase.rpc('cancel_booking', {
        p_booking_id: bookingId,
        p_verified_by_staff_id: verifiedStaff?.id || null,
        p_verified_by_staff_name: verifiedStaff?.name || null,
        p_penalty_amount: penaltyAmount,
        p_penalty_payment_method: penaltyPaymentMethod,
        p_reason: reason
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('Error cancelling booking:', error);
      return { success: false, message: error.message };
    }
  },

  async transferGroupMaster(oldMasterBookingId: string, newMasterBookingId: string, actionForOldMaster: 'become_child' | 'ungroup' | 'cancel' = 'ungroup') {
    try {
      const { data, error } = await supabase.rpc('transfer_group_master', {
        p_old_master_booking_id: oldMasterBookingId,
        p_new_master_booking_id: newMasterBookingId,
        p_action_for_old_master: actionForOldMaster
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('Error transferring group master:', error);
      return { success: false, message: error.message };
    }
  },

  async changeRoom(bookingId: string, newRoomId: string, reason?: string, verifiedStaff?: { id: string, name: string }) {
    try {
      const { data, error } = await supabase.rpc('change_room', {
        p_booking_id: bookingId,
        p_new_room_id: newRoomId,
        p_reason: reason || null,
        p_staff_id: verifiedStaff?.id || null
      });

      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error('Change room error:', err);
      throw err;
    }
  },

  async addDeposit(params: {
    bookingId: string;
    amount: number;
    paymentMethod: 'cash' | 'transfer';
    description: string;
    customerId?: string; // Optional customerId to avoid extra query
    verifiedStaff?: { id: string, name: string };
  }) {
    try {
      let customerId = params.customerId;

      // If customerId not provided, fetch it (Backward compatibility)
      if (!customerId) {
        const { data: booking, error: bError } = await supabase
          .from('bookings')
          .select('customer_id')
          .eq('id', params.bookingId)
          .single();
        
        if (bError) throw bError;
        customerId = booking.customer_id;
      }

      if (!customerId) {
        throw new Error('Không tìm thấy khách hàng cho booking này');
      }

      const { data, error } = await supabase.rpc('adjust_customer_balance', {
        p_customer_id: customerId,
        p_amount: params.amount,
        p_type: 'deposit',
        p_description: params.description,
        p_booking_id: params.bookingId,
        p_verified_by_staff_id: params.verifiedStaff?.id || null,
        p_verified_by_staff_name: params.verifiedStaff?.name || null,
        p_payment_method: params.paymentMethod
      });

      if (error) throw error;
      
      // CRITICAL: Check the success field in the returned JSON
      if (data && data.success === false) {
        throw new Error(data.message || 'Giao dịch thất bại');
      }

      // Suppress wallet notification for simple deposits (user requirement)
      // Regular toast.success in the UI is sufficient.
      /*
      if (data && data.wallet_changes && Array.isArray(data.wallet_changes) && data.wallet_changes.length > 0) {
        useWalletNotificationStore.getState().showNotification(data.wallet_changes);
      }
      */

      return data;
    } catch (err: any) {
      console.error('Add deposit error:', err);
      throw err;
    }
  },

  async updateBookingDetails(params: {
    bookingId: string;
    customerName: string;
    checkInAt: string;
    customPrice?: number;
    priceApplyMode: 'all' | 'future';
    reason: string;
    customerId?: string;
    notes?: string;
    verifiedStaff?: { id: string, name: string };
  }) {
    try {
      const { data, error } = await supabase.rpc('update_booking_details', {
        p_booking_id: params.bookingId,
        p_customer_name: params.customerName,
        p_check_in_at: params.checkInAt,
        p_custom_price: params.customPrice ?? null,
        p_price_apply_mode: params.priceApplyMode,
        p_reason: params.reason,
        p_customer_id: params.customerId || null,
        p_staff_id: params.verifiedStaff?.id || null,
        p_notes: params.notes || null
      });

      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error('Update booking details error:', JSON.stringify(err, null, 2));
      throw err;
    }
  },

  async forceUpdateSnapshot(bookingId: string) {
    try {
      const { data, error } = await supabase.rpc('fn_update_booking_snapshot', {
        p_booking_id: bookingId
      });
      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error('Force update snapshot error:', err);
      throw err;
    }
  }
};
