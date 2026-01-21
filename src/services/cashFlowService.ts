import { supabase } from '@/lib/supabase';

export interface CashFlowTransaction {
  id: string;
  flow_type: 'IN' | 'OUT';
  category: string;
  amount: number;
  description: string | null;
  occurred_at: string;
  created_at: string;
  created_by: string;
  ref_id: string | null;
  is_auto: boolean;
  payment_method_code?: string;
  verified_by_staff_name?: string;
}

export interface CashFlowStats {
  total_in: number;
  total_out: number;
  net_income: number;
  current_balance: number;
  chart_data: {
    date: string;
    total_in: number;
    total_out: number;
  }[];
}

export interface CashFlowCategory {
  id: string;
  name: string;
  type: 'IN' | 'OUT';
  description: string | null;
  is_system: boolean;
  is_active: boolean;
}

export const cashFlowService = {
  // ... existing methods ...

  // --- Category Management ---
  async getCategories(type?: 'IN' | 'OUT') {
    const { data, error } = await supabase.rpc('fn_get_cash_flow_categories', {
      p_type: type || null
    });
    
    if (error) throw error;
    return data as CashFlowCategory[];
  },

  async manageCategory(action: 'CREATE' | 'UPDATE' | 'DELETE', payload: {
    id?: string;
    name?: string;
    type?: 'IN' | 'OUT';
    description?: string;
  }) {
    const { data, error } = await supabase.rpc('fn_manage_cash_flow_category', {
      p_action: action,
      p_id: payload.id || null,
      p_name: payload.name || null,
      p_type: payload.type || null,
      p_description: payload.description || null
    });

    if (error) throw error;
    return data;
  },

  // Lấy danh sách giao dịch (có phân trang & filter)
  async getTransactions(
    page: number = 1, 
    pageSize: number = 20, 
    filters?: { 
      type?: 'IN' | 'OUT'; 
      startDate?: Date; 
      endDate?: Date;
    }
  ) {
    let query = supabase
      .from('cash_flow')
      .select('*', { count: 'exact' })
      .order('occurred_at', { ascending: false });

    if (filters?.type) {
      query = query.eq('flow_type', filters.type);
    }
    if (filters?.startDate) {
      query = query.gte('occurred_at', filters.startDate.toISOString());
    }
    if (filters?.endDate) {
      query = query.lte('occurred_at', filters.endDate.toISOString());
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    // Enhance data with payment method from bookings (Workaround for read-only DB)
    const transactions = data as CashFlowTransaction[];
    const bookingIds = transactions
      .filter(tx => tx.ref_id && (tx.category === 'Tiền phòng' || tx.category === 'ROOM'))
      .map(tx => tx.ref_id) as string[];

    if (bookingIds.length > 0) {
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, payment_method')
        .in('id', bookingIds);

      if (bookings) {
        const bookingMap = new Map(bookings.map(b => [b.id, b.payment_method]));
        transactions.forEach(tx => {
          if (tx.ref_id && bookingMap.has(tx.ref_id)) {
            tx.payment_method_code = bookingMap.get(tx.ref_id);
          } else if (tx.category === 'Tiền phòng') {
            tx.payment_method_code = 'cash'; // Default for room if not found
          }
        });
      }
    }

    // Default for manual entries if not set
    transactions.forEach(tx => {
      if (!tx.payment_method_code) {
        tx.payment_method_code = 'cash'; // Fallback to TM
      }
    });

    return { data: transactions, count };
  },

  // Gọi RPC lấy thống kê (Backend Calculation - Rule 8)
  async getStats(fromDate: Date, toDate: Date): Promise<CashFlowStats> {
    const { data, error } = await supabase.rpc('fn_get_cash_flow_stats', {
      p_from_date: fromDate.toISOString(),
      p_to_date: toDate.toISOString(),
    });

    if (error) throw error;
    return data as CashFlowStats;
  },

  // Gọi RPC tạo phiếu (Transaction safe)
  async createTransaction(payload: {
    flow_type: 'IN' | 'OUT';
    category: string;
    amount: number;
    description: string;
    occurred_at: Date;
    verifiedStaff?: { id: string, name: string };
  }) {
    const { data, error } = await supabase.rpc('fn_create_cash_flow', {
      p_flow_type: payload.flow_type,
      p_category: payload.category,
      p_amount: payload.amount,
      p_description: payload.description,
      p_occurred_at: payload.occurred_at.toISOString(),
      p_verified_by_staff_id: payload.verifiedStaff?.id || null,
      p_verified_by_staff_name: payload.verifiedStaff?.name || null
    });

    if (error) throw error;
    return data;
  },

  // Xóa giao dịch (chỉ cho phép xóa thủ công)
  async deleteTransaction(id: string) {
    const { error } = await supabase
      .from('cash_flow')
      .delete()
      .eq('id', id)
      .eq('is_auto', false); // Không cho xóa giao dịch tự động

    if (error) throw error;
  }
};
