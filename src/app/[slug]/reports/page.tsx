'use client';

import React, { useEffect, useState } from 'react';
import { reportService, ReportTopItem, ReportCategoryData } from '@/services/reportService';
import { Calendar, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import ReportKPIs from '@/components/report/ReportKPIs';
import ProfitCharts from '@/components/report/ProfitCharts';
import TopItemsTable from '@/components/report/TopItemsTable';
import SmartAlerts from '@/components/report/SmartAlerts';
import DrillDownModal from '@/components/report/DrillDownModal';
import AdminCommandCenter from '@/components/report/AdminCommandCenter';
import { toast } from 'sonner';
import { getEndOfDay } from '@/lib/dateUtils'; 
import { usePermission } from '@/hooks/usePermission';
import { PERMISSION_KEYS } from '@/services/permissionService';
import { ShieldCheck, LayoutDashboard, BarChart3, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

// Helper for date formatting
const formatDate = (date: Date) => {
    return date.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
};

export default function ReportsPage() {
  const { can, user, isLoading: isAuthLoading } = usePermission();
  const [activeTab, setActiveTab] = useState<'financial' | 'admin_stats' | 'admin_stream'>('financial');
  
  // Check feature toggle from user's hotel features
  const hasAdminCommand = user?.hotels?.features?.admin_command_center === true;

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
    if (can(PERMISSION_KEYS.VIEW_REPORTS)) {
      loadData();
    }
  }, [dateRange, can]); // Add can to deps

  if (isAuthLoading) return null;

  if (!can(PERMISSION_KEYS.VIEW_REPORTS)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <ShieldCheck size={48} className="mx-auto text-slate-300 mb-4" />
          <h1 className="text-xl font-bold text-slate-700">Không có quyền truy cập</h1>
          <p className="text-slate-500">Vui lòng liên hệ quản lý.</p>
        </div>
      </div>
    );
  }

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
    <div className="min-h-screen bg-[#F5F5F7] text-slate-900 font-sans selection:bg-slate-900 selection:text-white pb-32">
      {/* 1. APPLE STYLE STICKY HEADER */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 md:h-20 flex flex-wrap md:flex-nowrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">Báo cáo</h1>
            <span className="hidden sm:inline-flex text-[11px] bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded-full font-black tracking-wide border border-emerald-100 shadow-sm items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {activeTab === 'financial' ? 'Tài chính' : activeTab === 'admin_stats' ? 'Admin' : 'Luồng HĐ'}
            </span>
          </div>

          <div className="flex items-center gap-2 md:gap-3 flex-wrap sm:flex-nowrap">
            {/* Tab Selector */}
            {hasAdminCommand && (
              <div className="flex items-center p-1 bg-slate-100/80 rounded-full border border-slate-200/60 shadow-inner">
                <button
                  onClick={() => setActiveTab('financial')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 md:px-4 py-1.5 rounded-full text-xs font-black transition-all",
                    activeTab === 'financial' 
                      ? "bg-white text-slate-900 shadow-sm" 
                      : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <BarChart3 size={14} />
                  <span>Tài chính</span>
                </button>
                <button
                  onClick={() => setActiveTab('admin_stats')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 md:px-4 py-1.5 rounded-full text-xs font-black transition-all",
                    activeTab === 'admin_stats' 
                      ? "bg-slate-900 text-white shadow-sm" 
                      : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <LayoutDashboard size={14} />
                  <span>Admin</span>
                </button>
                <button
                  onClick={() => setActiveTab('admin_stream')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 md:px-4 py-1.5 rounded-full text-xs font-black transition-all",
                    activeTab === 'admin_stream' 
                      ? "bg-rose-600 text-white shadow-sm" 
                      : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <Activity size={14} />
                  <span>Luồng HĐ</span>
                </button>
              </div>
            )}

            {/* Date Filter - Only show for financial tab */}
            {activeTab === 'financial' && (
              <div className="flex items-center bg-white p-1 rounded-full border border-slate-200/80 shadow-sm">
                <button 
                  onClick={() => handleMonthChange(-1)}
                  className="w-8 h-8 rounded-full hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="flex items-center gap-1.5 px-2 min-w-[110px] md:min-w-[130px] justify-center">
                  <Calendar size={14} className="text-blue-600" />
                  <span className="font-bold text-slate-800 text-xs tracking-tight">
                    {formatDate(dateRange.start)}
                  </span>
                </div>
                <button 
                  onClick={() => handleMonthChange(1)}
                  className="w-8 h-8 rounded-full hover:bg-slate-50 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6 md:space-y-8">

      {activeTab !== 'financial' && user?.hotel_id ? (
        <AdminCommandCenter 
          hotelId={user.hotel_id} 
          initialTab={activeTab === 'admin_stats' ? 'stats' : 'stream'} 
        />
      ) : (
        <>
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
        </>
      )}

      </main>

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
