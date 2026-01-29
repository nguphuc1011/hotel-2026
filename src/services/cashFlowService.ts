import { supabase } from '@/lib/supabase';
import { useWalletNotificationStore } from '@/stores/walletNotificationStore';

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
  customer_name?: string;
  room_name?: string;
  staff_name?: string;
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
  is_revenue: boolean;
}

export interface Wallet {
  id: string;
  name: string;
  balance: number;
  updated_at: string;
}

export const cashFlowService = {
  // --- Wallet Management ---
  async getWallets() {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .order('id');
      
    if (error) throw error;
    return data as Wallet[];
  },

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
    is_revenue?: boolean;
  }) {
    const { data, error } = await supabase.rpc('fn_manage_cash_flow_category', {
      p_action: action,
      p_id: payload.id || null,
      p_name: payload.name || null,
      p_type: payload.type || null,
      p_description: payload.description || null,
      p_is_revenue: payload.is_revenue !== undefined ? payload.is_revenue : true
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
      paymentMethod?: string;
      walletId?: string;
      excludeCategory?: string[];
      excludePaymentMethod?: string[]; // New filter
    }
  ) {
    let query = supabase
      .from('cash_flow')
      .select('*', { count: 'exact' })
      .order('occurred_at', { ascending: false });

    if (filters?.walletId) {
      query = query.eq('wallet_id', filters.walletId);
    }
    
    if (filters?.type) {
      query = query.eq('flow_type', filters.type);
    }
    if (filters?.excludeCategory && filters.excludeCategory.length > 0) {
      query = query.not('category', 'in', filters.excludeCategory);
    }
    if (filters?.excludePaymentMethod && filters.excludePaymentMethod.length > 0) {
      // Use OR filter to include NULLs (which are likely old Cash/Transfer transactions)
      // Syntax: payment_method_code.is.null,payment_method_code.not.in.(val1,val2)
      const values = `(${filters.excludePaymentMethod.join(',')})`;
      query = query.or(`payment_method_code.is.null,payment_method_code.not.in.${values}`);
    }
    if (filters?.paymentMethod) {
      // Only filter by DB column for performance. Old records with NULL won't show.
      query = query.eq('payment_method_code', filters.paymentMethod);
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

    // Enhance data with payment method from bookings (Backfill for old records)
    const transactions = data as CashFlowTransaction[];
    const bookingIds = transactions
      .filter(tx => tx.ref_id && (
        tx.category === 'Tiền phòng' || 
        tx.category === 'Tiền cọc' || 
        tx.category === 'ROOM' ||
        tx.category === 'Thanh toán' ||
        tx.category === 'Thanh toán tiền phòng'
      ))
      .map(tx => tx.ref_id) as string[];

    if (bookingIds.length > 0) {
      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          id, 
          payment_method,
          customer:customers(full_name),
          room:rooms!bookings_room_id_fkey(room_number)
        `)
        .in('id', bookingIds);

      if (bookings) {
        const bookingMap = new Map(bookings.map(b => [b.id, b]));
        transactions.forEach(tx => {
          const booking = bookingMap.get(tx.ref_id!);
          if (booking) {
            // Backfill payment method if missing
            if (!tx.payment_method_code) {
              tx.payment_method_code = booking.payment_method;
            }
            
            // Populate Customer & Room
            const c = booking.customer as any;
            tx.customer_name = Array.isArray(c) ? c[0]?.full_name : c?.full_name;
            
            // Handle Room Name
            const r = booking.room as any;
            tx.room_name = Array.isArray(r) ? r[0]?.room_number : (r?.room_number || r?.name); 
          } else if (!tx.payment_method_code && tx.category === 'Tiền phòng') {
            tx.payment_method_code = 'cash'; // Default for room if not found
          }
        });
      }
    }

    // Fetch Staff Names for created_by (Fix "System" issue)
    const userIds = [...new Set(transactions.map(tx => tx.created_by).filter(Boolean))];
    if (userIds.length > 0) {
      const { data: staffList } = await supabase
        .from('staff')
        .select('id, full_name')
        .in('id', userIds);
      
      if (staffList) {
        const staffMap = new Map(staffList.map(s => [s.id, s.full_name]));
        transactions.forEach(tx => {
           // Prefer verified name, then lookup creator name
           if (tx.verified_by_staff_name) {
             tx.staff_name = tx.verified_by_staff_name;
           } else if (staffMap.has(tx.created_by)) {
             tx.staff_name = staffMap.get(tx.created_by);
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

  // Tính số dư ví tại một thời điểm nhất định (Rule: Opening Balance)
  async getWalletBalanceAt(walletId: string, timestamp: Date): Promise<number> {
    // 1. Lấy số dư hiện tại
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('id', walletId)
      .single();
    
    if (!wallet) return 0;

    // 2. Lấy tổng biến động từ timestamp đến hiện tại
    // Balance_at_T = Current_Balance - Sum(Transactions from T to Now)
    
    // FETCH RAW DATA (Include payment_method_code)
    const { data: transactions } = await supabase
      .from('cash_flow')
      .select('amount, flow_type, wallet_id, payment_method_code, category')
      .gt('occurred_at', timestamp.toISOString());

    if (!transactions) return wallet.balance;

    // 3. Filter in memory (Handle NULL wallet_id logic)
    const filteredTxs = transactions.filter(tx => {
      // Logic from fn_sync_wallets and MoneyPage
      const method = (tx.payment_method_code || 'cash').toLowerCase();
      
      // Exclude virtual/credit flows
      if (method === 'credit' || method === 'deposit_transfer') return false;

      // Determine Target Wallet
      let targetWallet = 'BANK';
      if (method === 'cash' || method === 'tm') {
        targetWallet = 'CASH';
      }

      // Check if this tx belongs to the requested wallet
      // Priority: wallet_id (if set) > inferred from payment_method
      if (tx.wallet_id) {
        return tx.wallet_id === walletId;
      } else {
        return targetWallet === walletId;
      }
    });

    const futureChange = filteredTxs.reduce((acc, tx) => {
      return acc + (tx.flow_type === 'IN' ? tx.amount : -tx.amount);
    }, 0);

    return wallet.balance - futureChange;
  },

  // Gọi RPC tạo phiếu (Transaction safe)
  async createTransaction(payload: {
    flow_type: 'IN' | 'OUT';
    category: string;
    amount: number;
    description: string;
    occurred_at: Date;
    payment_method_code?: string;
    verifiedStaff?: { id: string, name: string };
  }) {
    const { data, error } = await supabase.rpc('fn_create_cash_flow', {
      p_flow_type: payload.flow_type,
      p_category: payload.category,
      p_amount: payload.amount,
      p_description: payload.description,
      p_occurred_at: payload.occurred_at.toISOString(),
      p_verified_by_staff_id: payload.verifiedStaff?.id || null,
      p_verified_by_staff_name: payload.verifiedStaff?.name || null,
      p_payment_method_code: payload.payment_method_code || 'cash'
    });

    if (error) throw error;

    // Trigger notification if wallet_changes exists
    if (data && data.wallet_changes && Array.isArray(data.wallet_changes) && data.wallet_changes.length > 0) {
      useWalletNotificationStore.getState().showNotification(data.wallet_changes);
    }

    return data;
  },

  // --- Owner Debt Management (Sổ Nợ Ngoài) ---
  async getExternalPayables() {
    const { data, error } = await supabase
      .from('external_payables')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data;
  },

  async createOwnerExpense(payload: {
    amount: number;
    description: string;
    creditorName?: string;
    evidenceUrl: string;
  }) {
    const { data, error } = await supabase.rpc('record_owner_expense', {
      p_amount: payload.amount,
      p_description: payload.description,
      p_creditor_name: payload.creditorName || 'Chủ đầu tư',
      p_evidence_url: payload.evidenceUrl
    });

    if (error) throw error;
    return data;
  },

  async repayOwnerDebt(payload: {
    payableId: string;
    paymentMethod: 'cash' | 'transfer';
    pin: string;
  }) {
    const { data, error } = await supabase.rpc('repay_owner_debt', {
      p_payable_id: payload.payableId,
      p_payment_method: payload.paymentMethod,
      p_pin: payload.pin
    });

    if (error) throw error;

    // Trigger notification if wallet_changes exists
    if (data && data.wallet_changes && Array.isArray(data.wallet_changes) && data.wallet_changes.length > 0) {
      useWalletNotificationStore.getState().showNotification(data.wallet_changes);
    }

    return data;
  },

  // Xóa giao dịch (chỉ cho phép xóa thủ công)
  async deleteTransaction(id: string) {
    const { data, error } = await supabase.rpc('fn_delete_cash_flow', {
      p_id: id
    });

    if (error) throw error;

    // Trigger notification if wallet_changes exists
    if (data && data.wallet_changes && Array.isArray(data.wallet_changes) && data.wallet_changes.length > 0) {
      useWalletNotificationStore.getState().showNotification(data.wallet_changes);
    }

    return data;
  }
};
