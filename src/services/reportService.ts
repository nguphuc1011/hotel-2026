import { supabase } from '@/lib/supabase';

export interface ReportKpi {
  revenue: number;
  cogs: number;
  opex: number;
  net_profit: number;
}

export interface ReportCategoryData {
  category: string;
  amount: number;
  type: 'IN' | 'OUT' | 'COGS';
}

export interface ReportTopItem {
  name: string;
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
}

export const reportService = {
  async getReportData(startDate: Date, endDate: Date) {
    const startStr = startDate.toISOString();
    const endStr = endDate.toISOString();

    // 1. Fetch Revenue & Expenses from cash_flow
    const { data: cashFlowData, error: cfError } = await supabase
      .from('cash_flow')
      .select(`
        category, amount, flow_type, description, occurred_at, 
        created_by, ref_id, payment_method_code
      `)
      .gte('occurred_at', startStr)
      .lte('occurred_at', endStr)
      .eq('is_reversal', false)
      .order('occurred_at', { ascending: false });

    if (cfError) {
      console.error('Error fetching cash_flow:', cfError);
      throw cfError;
    }

    // Fetch all staff for creator mapping (avoiding complex joins/schema cache issues)
    const { data: staffList, error: staffError } = await supabase
      .from('staff')
      .select('id, full_name');

    if (staffError) {
      console.error('Error fetching staff:', staffError);
      // Don't throw, just ignore staff mapping
    }

    const staffMap = new Map(staffList?.map(s => [s.id, s.full_name]) || []);

    // Fetch categories to identify is_revenue
    const { data: categories, error: catError } = await supabase
      .from('cash_flow_categories')
      .select('name, is_revenue');

    if (catError) {
      console.error('Error fetching categories:', catError);
      throw catError;
    }

    const revenueMap = new Map(categories.filter(c => c.is_revenue).map(c => [c.name, true]));

    // 2. Fetch COGS from booking_services
    // Step 2a: Fetch services first (without joining bookings->rooms to avoid ambiguity/depth issues)
    const { data: serviceRaw, error: sError } = await supabase
      .from('booking_services')
      .select(`
        id, quantity, price_at_time, cost_price_at_time, created_at, booking_id,
        service:services(name, cost_price)
      `)
      .gte('created_at', startStr)
      .lte('created_at', endStr)
      .eq('status', 'active');

    if (sError) {
      console.error('Error fetching booking_services:', JSON.stringify(sError));
      throw sError;
    }

    // Step 2b: Fetch related bookings and rooms manually
    const bookingIds = Array.from(new Set(serviceRaw.map(s => s.booking_id).filter(Boolean)));
    
    let bookingMap = new Map();
    if (bookingIds.length > 0) {
        const { data: bookingData, error: bError } = await supabase
            .from('bookings')
            .select('id, room:rooms!bookings_room_id_fkey(room_number)')
            .in('id', bookingIds);
        
        if (bError) {
            console.error('Error fetching bookings:', JSON.stringify(bError));
            // Don't throw, just ignore room info
        } else {
            bookingMap = new Map(bookingData?.map(b => [b.id, b]) || []);
        }
    }

    // Step 2c: Merge data
    const serviceData = serviceRaw.map(s => ({
        ...s,
        booking: bookingMap.get(s.booking_id) || null
    }));

    // Map creator name to cashFlowData
    const enrichedCashFlowData = cashFlowData.map(tx => ({
      ...tx,
      creator: { full_name: staffMap.get(tx.created_by) || 'Hệ thống' },
      is_revenue: revenueMap.has(tx.category)
    }));

    // Process KPI
    let totalRevenue = 0;
    let totalOpEx = 0;
    let totalCOGS = 0;

    const revBreakdown: Record<string, number> = {};
    const expBreakdown: Record<string, number> = {};

    enrichedCashFlowData.forEach(tx => {
      // Normalize category check (Rule 5: Edge cases & Rule 6: DRY)
      // Fix: Exclude imports from OpEx to avoid double counting
      const catLower = (tx.category || '').toLowerCase();
      const isImport = ['nhập hàng', 'nhap_hang'].includes(catLower);
      const isRoomCharge = ['tiền phòng', 'tien_phong'].includes(catLower);
      
      if (tx.flow_type === 'IN' && revenueMap.has(tx.category)) {
        totalRevenue += Number(tx.amount);
        revBreakdown[tx.category] = (revBreakdown[tx.category] || 0) + Number(tx.amount);
      } else if (tx.flow_type === 'OUT' && !isImport && !isRoomCharge) {
        totalOpEx += Number(tx.amount);
        expBreakdown[tx.category] = (expBreakdown[tx.category] || 0) + Number(tx.amount);
      }
    });

    // Unified loop for COGS and Item Stats (Rule 6: DRY - Single pass processing)
    const itemStats: Record<string, ReportTopItem> = {};
    
    serviceData.forEach(s => {
      // Fix: If snapshot cost is 0 (historical data), fallback to current master cost
      const costPrice = Number(s.cost_price_at_time) || Number((s.service as any)?.cost_price) || 0;
      const quantity = s.quantity || 0;
      const priceAtTime = Number(s.price_at_time) || 0;

      const itemCost = quantity * costPrice;
      const itemRev = quantity * priceAtTime;

      // Add to total COGS
      totalCOGS += itemCost;

      // Add to item stats
      const name = (s.service as any)?.name || 'Dịch vụ lạ';
      if (!itemStats[name]) {
        itemStats[name] = { name, revenue: 0, cost: 0, profit: 0, quantity: 0 };
      }
      
      itemStats[name].revenue += itemRev;
      itemStats[name].cost += itemCost;
      itemStats[name].profit += (itemRev - itemCost);
      itemStats[name].quantity += quantity;
    });

    // 3. Fetch Category Averages (Last 3 months)
    const threeMonthsAgo = new Date(startDate);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    // We fetch raw data and aggregate in JS to avoid creating RPC if not needed
    // Assuming reasonable volume of history data. If large, use RPC.
    const { data: historyData, error: histError } = await supabase
        .from('cash_flow')
        .select('category, amount, flow_type')
        .gte('occurred_at', threeMonthsAgo.toISOString())
        .lt('occurred_at', startStr) // Strictly past
        .eq('is_reversal', false);

    const categoryAverages: Record<string, number> = {};
    if (!histError && historyData) {
        const sums: Record<string, { total: number, count: number }> = {};
        historyData.forEach(tx => {
            // Apply same filter rules as main loop (Rule 6: DRY)
            const catLower = (tx.category || '').toLowerCase();
            const isImport = ['nhập hàng', 'nhap_hang'].includes(catLower);
            const isRoomCharge = ['tiền phòng', 'tien_phong'].includes(catLower);
            
            // Only count valid expenses
            if (tx.flow_type === 'OUT' && !isImport && !isRoomCharge) {
                if (!sums[tx.category]) sums[tx.category] = { total: 0, count: 0 };
                sums[tx.category].total += Number(tx.amount);
                sums[tx.category].count += 1;
            }
        });
        Object.entries(sums).forEach(([cat, stats]) => {
            categoryAverages[cat] = Math.round(stats.total / 3); // Average per month (fixed 3 months window)
        });
    }

    return {
      kpis: {
        revenue: totalRevenue,
        cogs: totalCOGS,
        opex: totalOpEx,
        net_profit: totalRevenue - totalCOGS - totalOpEx
      },
      revenueBreakdown: Object.entries(revBreakdown).map(([category, amount]) => ({ category, amount, type: 'IN' as const })),
      expenseBreakdown: Object.entries(expBreakdown).map(([category, amount]) => ({ category, amount, type: 'OUT' as const, average: categoryAverages[category] || 0 })),
      topItems: Object.values(itemStats).sort((a, b) => b.profit - a.profit).slice(0, 5),
      raw: {
        cashFlow: enrichedCashFlowData,
        services: serviceData
      },
      averages: categoryAverages
    };
  }
};
