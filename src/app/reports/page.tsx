'use client';

import React, { useEffect, useState } from 'react';
import { reportService, ReportTopItem, ReportCategoryData } from '@/services/reportService';
import { Calendar, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import ReportKPIs from '@/components/report/ReportKPIs';
import ProfitCharts from '@/components/report/ProfitCharts';
import TopItemsTable from '@/components/report/TopItemsTable';
import SmartAlerts from '@/components/report/SmartAlerts';
import DrillDownModal from '@/components/report/DrillDownModal';
import { toast } from 'sonner';
import { getEndOfDay } from '@/lib/dateUtils'; // Assuming this exists, or I'll define local helpers

// Helper for date formatting
const formatDate = (date: Date) => {
    return date.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
};

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    };
  });

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    kpis: { revenue: number; cogs: number; opex: number; net_profit: number };
    revenueBreakdown: ReportCategoryData[];
    expenseBreakdown: ReportCategoryData[];
    topItems: ReportTopItem[];
    raw: { cashFlow: any[]; services: any[] };
    averages?: Record<string, number>;
  } | null>(null);

  // Drill Down State
  const [drillModal, setDrillModal] = useState<{
    open: boolean;
    title: string;
    items: any[];
    total: number;
    averages?: Record<string, number>;
  }>({
    open: false,
    title: '',
    items: [],
    total: 0
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await reportService.getReportData(dateRange.start, dateRange.end);
      setData(result);
    } catch (error) {
      console.error(error);
      toast.error('Không thể tải dữ liệu báo cáo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const handleMonthChange = (delta: number) => {
    const newStart = new Date(dateRange.start);
    newStart.setMonth(newStart.getMonth() + delta);
    const newEnd = new Date(newStart.getFullYear(), newStart.getMonth() + 1, 0, 23, 59, 59);
    setDateRange({ start: newStart, end: newEnd });
  };

  const handleDrillDown = (segment: string) => {
    if (!data) return;

    let items: any[] = [];
    let title = '';
    let total = 0;

    const normalize = (str: string) => str.toLowerCase().trim();
    const seg = normalize(segment);

    if (seg === 'revenue' || seg === 'doanh thu' || seg === 'tổng thu nhập') {
        title = 'Chi tiết Doanh thu';
        items = data.raw.cashFlow
            .filter(tx => tx.flow_type === 'IN' && tx.is_revenue)
            .map(tx => ({
                category: tx.category,
                amount: Number(tx.amount),
                flow_type: 'IN',
                description: tx.description,
                occurred_at: tx.occurred_at,
                creator: tx.creator?.full_name || 'Hệ thống',
                ref_id: tx.ref_id,
                ref_type: 'booking' // Assuming most revenue is booking
            }));
        total = items.reduce((sum, item) => sum + item.amount, 0);

    } else if (seg === 'costs' || seg === 'tổng chi phí') {
        title = 'Chi tiết Tổng chi phí';
        // OpEx (Apply Normalize Filter)
        const opexItems = data.raw.cashFlow
            .filter(tx => {
                if (tx.flow_type !== 'OUT') return false;
                const catLower = (tx.category || '').toLowerCase();
                const isImport = ['nhập hàng', 'nhap_hang'].includes(catLower);
                const isRoomCharge = ['tiền phòng', 'tien_phong'].includes(catLower);
                return !isImport && !isRoomCharge;
            })
            .map(tx => ({
                category: tx.category,
                amount: Number(tx.amount),
                flow_type: 'OUT',
                description: tx.description,
                occurred_at: tx.occurred_at,
                creator: tx.creator?.full_name || 'Hệ thống',
                ref_id: tx.ref_id,
                ref_type: 'expense'
            }));
        
        // COGS
        const cogsItems = data.raw.services.map(s => ({
            category: 'Giá vốn',
            amount: (s.quantity || 0) * (Number(s.cost_price_at_time) || Number((s.service as any)?.cost_price) || 0), // Fallback cost
            flow_type: 'OUT',
            description: `Giá vốn: ${s.service?.name} (x${s.quantity}) - Phòng ${s.booking?.room?.room_number || 'Unknown'}`,
            occurred_at: s.created_at,
            creator: 'Hệ thống', // COGS is auto
            ref_id: s.booking?.id, // Link to booking
            ref_type: 'booking'
        }));

        items = [...opexItems, ...cogsItems];
        total = items.reduce((sum, item) => sum + item.amount, 0);

    } else if (seg === 'chi phí vận hành' || seg === 'vận hành') {
        title = 'Chi tiết Chi phí Vận hành';
        items = data.raw.cashFlow
            .filter(tx => {
                if (tx.flow_type !== 'OUT') return false;
                const catLower = (tx.category || '').toLowerCase();
                const isImport = ['nhập hàng', 'nhap_hang'].includes(catLower);
                const isRoomCharge = ['tiền phòng', 'tien_phong'].includes(catLower);
                return !isImport && !isRoomCharge;
            })
            .map(tx => ({
                category: tx.category,
                amount: Number(tx.amount),
                flow_type: 'OUT',
                description: tx.description,
                occurred_at: tx.occurred_at,
                creator: tx.creator?.full_name || 'Hệ thống',
                ref_id: tx.ref_id,
                ref_type: 'expense'
            }));
        total = items.reduce((sum, item) => sum + item.amount, 0);

    } else if (seg === 'giá vốn hàng bán' || seg === 'giá vốn') {
        title = 'Chi tiết Giá vốn hàng bán';
        items = data.raw.services.map(s => ({
            category: 'Giá vốn',
            amount: (s.quantity || 0) * (Number(s.cost_price_at_time) || Number((s.service as any)?.cost_price) || 0), // Fallback cost
            flow_type: 'OUT',
            description: `Giá vốn: ${s.service?.name} (x${s.quantity}) - Phòng ${s.booking?.room?.room_number || 'Unknown'}`,
            occurred_at: s.created_at,
            creator: 'Hệ thống',
            ref_id: s.booking?.id,
            ref_type: 'booking'
        }));
        total = items.reduce((sum, item) => sum + item.amount, 0);

    } else if (seg === 'lợi nhuận ròng' || seg === 'lợi nhuận' || seg === 'profit') {
        // No drill down for profit yet, or maybe show simple message
        return;
    } else {
        // Try to match specific category
        title = `Chi tiết: ${segment}`;
        items = data.raw.cashFlow
            .filter(tx => tx.category === segment)
            .map(tx => ({
                category: tx.category,
                amount: Number(tx.amount),
                flow_type: tx.flow_type,
                description: tx.description,
                occurred_at: tx.occurred_at,
                creator: tx.creator?.full_name || 'Hệ thống',
                ref_id: tx.ref_id,
                ref_type: tx.flow_type === 'IN' ? 'booking' : 'expense'
            }));
        total = items.reduce((sum, item) => sum + item.amount, 0);
    }

    // Sort by date desc
    items.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

    setDrillModal({
        open: true,
        title,
        items,
        total,
        averages: data.averages
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
        <div>
            <h1 className="text-4xl md:text-5xl font-black-italic tracking-tighter uppercase italic text-slate-800">
                Bức tranh tài chính
            </h1>
            <p className="text-slate-400 font-bold text-sm tracking-tight mt-2 uppercase tracking-[0.1em]">
                Theo dõi sức khỏe dòng tiền & Lợi nhuận
            </p>
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
            <button 
                onClick={() => handleMonthChange(-1)}
                className="w-10 h-10 rounded-xl hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
            >
                <ChevronLeft size={20} />
            </button>
            <div className="flex items-center gap-2 px-2 min-w-[140px] justify-center">
                <Calendar size={16} className="text-blue-600" />
                <span className="font-bold text-slate-700 uppercase tracking-wide text-sm">
                    {formatDate(dateRange.start)}
                </span>
            </div>
            <button 
                onClick={() => handleMonthChange(1)}
                className="w-10 h-10 rounded-xl hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
            >
                <ChevronRight size={20} />
            </button>
        </div>
      </div>

      {loading || !data ? (
          <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
      ) : (
          <div className="space-y-8">
              {/* 1. KPIs */}
              <ReportKPIs data={data.kpis} onDrillDown={handleDrillDown} />

              {/* 2. Charts */}
              <ProfitCharts kpis={data.kpis} onDrillDown={handleDrillDown} />

              {/* 3. Bottom Grid: Top Items & Alerts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <TopItemsTable items={data.topItems} />
                  <SmartAlerts kpis={data.kpis} topItem={data.topItems[0]} />
              </div>
          </div>
      )}

      {/* Drill Down Modal */}
      <DrillDownModal 
        isOpen={drillModal.open}
        onClose={() => setDrillModal(prev => ({ ...prev, open: false }))}
        title={drillModal.title}
        items={drillModal.items}
        totalAmount={drillModal.total}
        averages={drillModal.averages}
      />
    </div>
  );
}
