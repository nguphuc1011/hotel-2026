import { supabase } from '@/lib/supabase';
import { getActiveHotelId } from '@/utils/tenant';

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
  average?: number;
}

export interface ReportTopItem {
  name: string;
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
}

export const reportService = {
  /**
   * Tải toàn bộ dữ liệu báo cáo P&L (Doanh thu, Chi phí OpEx, Giá vốn COGS, Lợi nhuận ròng)
   * Tính toán 100% tại Backend PostgreSQL RPC 'fn_get_pnl_report' để tối ưu tốc độ và bảo mật multi-tenant.
   */
  async getReportData(startDate: Date, endDate: Date, hotelId?: string) {
    const targetHotelId = hotelId || getActiveHotelId();
    if (!targetHotelId) {
      throw new Error('Không xác định được khách sạn hiện tại');
    }

    const { data, error } = await supabase.rpc('fn_get_pnl_report', {
      p_hotel_id: targetHotelId,
      p_start_date: startDate.toISOString(),
      p_end_date: endDate.toISOString()
    });

    if (error) {
      console.error('Error fetching PnL report from Backend RPC:', error);
      throw error;
    }

    return {
      kpis: data.kpis || { revenue: 0, cogs: 0, opex: 0, net_profit: 0 },
      revenueBreakdown: (data.revenueBreakdown || []) as ReportCategoryData[],
      expenseBreakdown: (data.expenseBreakdown || []) as ReportCategoryData[],
      topItems: (data.topItems || []) as ReportTopItem[],
      raw: data.raw || { cashFlow: [], services: [] },
      averages: data.averages || {}
    };
  }
};
