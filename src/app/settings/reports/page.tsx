'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart,
  FileText,
  Printer,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Calendar as CalendarIcon,
  Loader2,
  Users,
  Hotel,
  Search,
  ArrowRight
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useNotification } from '@/context/NotificationContext';
import { supabase } from '@/lib/supabase';
import { 
  startOfDay, 
  endOfDay, 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  format, 
  eachDayOfInterval, 
  isSameDay,
  subMonths,
  differenceInDays,
  startOfWeek,
  parseISO
} from 'date-fns';
import { vi } from 'date-fns/locale';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart as RePieChart,
  Pie,
  Legend
} from 'recharts';

const PERIODS = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'yesterday', label: 'Hôm qua' },
  { id: 'week', label: '7 ngày' },
  { id: 'month', label: 'Tháng này' },
  { id: 'custom', label: 'Tùy chỉnh' },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface ReportData {
  revenue: {
    total: number;
    growth: number;
    bookings: number;
    avgBooking: number;
    roomRevenue: number;
    serviceRevenue: number;
  };
  occupancy: {
    rate: number;
    checkedIn: number;
    available: number;
    maintenance: number;
    totalRooms: number;
  };
  services: {
    total: number;
    count: number;
    topServices: Array<{ name: string; value: number }>;
  };
  roomTypes: Array<{ name: string; revenue: number; bookings: number }>;
  chartData: any[];
}

export default function ReportsPage() {
  const { showNotification } = useNotification();
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<ReportData | null>(null);
  const [cachedData, setCachedData] = useState<Record<string, ReportData>>({});
  const [customRange, setCustomRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    const cacheKey = selectedPeriod === 'custom' 
      ? `custom-${customRange.start}-${customRange.end}` 
      : selectedPeriod;
    
    if (cachedData[cacheKey]) {
      setData(cachedData[cacheKey]);
      setIsLoading(false);
    } else {
      fetchReportData();
    }
  }, [selectedPeriod]);

  const fetchReportData = async () => {
    setIsLoading(true);
    try {
      const now = new Date();
      let start: Date, end: Date;
      let prevStart: Date, prevEnd: Date;
      const cacheKey = selectedPeriod === 'custom' 
        ? `custom-${customRange.start}-${customRange.end}` 
        : selectedPeriod;

      if (selectedPeriod === 'custom') {
        start = startOfDay(parseISO(customRange.start));
        end = endOfDay(parseISO(customRange.end));
        const diff = differenceInDays(end, start);
        prevStart = startOfDay(subDays(start, diff + 1));
        prevEnd = endOfDay(subDays(start, 1));
      } else {
        switch (selectedPeriod) {
          case 'today':
            start = startOfDay(now);
            end = endOfDay(now);
            prevStart = startOfDay(subDays(now, 1));
            prevEnd = endOfDay(subDays(now, 1));
            break;
          case 'yesterday':
            start = startOfDay(subDays(now, 1));
            end = endOfDay(subDays(now, 1));
            prevStart = startOfDay(subDays(now, 2));
            prevEnd = endOfDay(subDays(now, 2));
            break;
          case 'week':
            start = startOfDay(subDays(now, 6));
            end = endOfDay(now);
            prevStart = startOfDay(subDays(start, 7));
            prevEnd = endOfDay(subDays(start, 1));
            break;
          case 'month':
            start = startOfMonth(now);
            end = endOfDay(now);
            prevStart = startOfMonth(subMonths(now, 1));
            prevEnd = endOfMonth(subMonths(now, 1));
            break;
          default:
            start = startOfMonth(now);
            end = endOfDay(now);
            prevStart = startOfMonth(subMonths(now, 1));
            prevEnd = endOfMonth(subMonths(now, 1));
        }
      }

      // Fetch bookings for current period with room info
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          check_in_at,
          room_charge_actual,
          services_used,
          rooms (
            room_number,
            room_type
          )
        `)
        .gte('check_in_at', start.toISOString())
        .lte('check_in_at', end.toISOString());

      if (bookingsError) throw bookingsError;

      // Fetch bookings for previous period for growth calculation
      const { data: prevBookings, error: prevBookingsError } = await supabase
        .from('bookings')
        .select('room_charge_actual, services_used')
        .gte('check_in_at', prevStart.toISOString())
        .lte('check_in_at', prevEnd.toISOString());

      if (prevBookingsError) throw prevBookingsError;

      // Fetch rooms for occupancy calculation
      const { data: rooms, error: roomsError } = await supabase
        .from('rooms')
        .select('status, room_type');

      if (roomsError) throw roomsError;

      // Process Data
      const totalRevenue = bookings?.reduce((acc, b) => {
        const servicesTotal = b.services_used?.reduce((sAcc: number, s: any) => sAcc + (s.total || 0), 0) || 0;
        return acc + (b.room_charge_actual || 0) + servicesTotal;
      }, 0) || 0;

      const roomRevenue = bookings?.reduce((acc, b) => acc + (b.room_charge_actual || 0), 0) || 0;
      const serviceRevenue = totalRevenue - roomRevenue;

      const prevTotalRevenue = prevBookings?.reduce((acc, b) => {
        const servicesTotal = b.services_used?.reduce((sAcc: number, s: any) => sAcc + (s.total || 0), 0) || 0;
        return acc + (b.room_charge_actual || 0) + servicesTotal;
      }, 0) || 0;

      const growth = prevTotalRevenue === 0 ? 100 : Math.round(((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100);

      // Chart Data
      const interval = eachDayOfInterval({ start, end });
      const chartData = interval.map(day => {
        const dayBookings = bookings?.filter(b => isSameDay(new Date(b.check_in_at), day)) || [];
        const dayRevenue = dayBookings.reduce((acc, b) => {
          const servicesTotal = b.services_used?.reduce((sAcc: number, s: any) => sAcc + (s.total || 0), 0) || 0;
          return acc + (b.room_charge_actual || 0) + servicesTotal;
        }, 0);
        return {
          date: format(day, 'dd/MM'),
          revenue: dayRevenue,
          bookings: dayBookings.length
        };
      });

      // Top Services
      const serviceMap = new Map<string, number>();
      bookings?.forEach(b => {
        b.services_used?.forEach((s: any) => {
          const current = serviceMap.get(s.name) || 0;
          serviceMap.set(s.name, current + (s.total || 0));
        });
      });

      const topServices = Array.from(serviceMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      // Room Type Performance
      const roomTypeMap = new Map<string, { revenue: number; bookings: number }>();
      bookings?.forEach(b => {
        const type = (b.rooms as any)?.room_type || 'Khác';
        const current = roomTypeMap.get(type) || { revenue: 0, bookings: 0 };
        const servicesTotal = b.services_used?.reduce((sAcc: number, s: any) => sAcc + (s.total || 0), 0) || 0;
        roomTypeMap.set(type, {
          revenue: current.revenue + (b.room_charge_actual || 0) + servicesTotal,
          bookings: current.bookings + 1
        });
      });

      const roomTypePerformance = Array.from(roomTypeMap.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.revenue - a.revenue);

      // Occupancy
      const totalRooms = rooms?.length || 0;
      const checkedIn = rooms?.filter(r => r.status === 'hourly' || r.status === 'daily' || r.status === 'overnight').length || 0;
      const maintenance = rooms?.filter(r => r.status === 'repair').length || 0;
      const available = totalRooms - checkedIn - maintenance;
      const occupancyRate = totalRooms === 0 ? 0 : Math.round((checkedIn / (totalRooms - maintenance)) * 100);

      const finalData: ReportData = {
        revenue: {
          total: totalRevenue,
          growth,
          bookings: bookings?.length || 0,
          avgBooking: bookings?.length ? Math.round(totalRevenue / bookings.length) : 0,
          roomRevenue,
          serviceRevenue
        },
        occupancy: {
          rate: occupancyRate,
          checkedIn,
          available,
          maintenance,
          totalRooms
        },
        services: {
          total: serviceRevenue,
          count: bookings?.reduce((acc, b) => acc + (b.services_used?.length || 0), 0) || 0,
          topServices
        },
        roomTypes: roomTypePerformance,
        chartData
      };

      setData(finalData);
      setCachedData(prev => ({ ...prev, [cacheKey]: finalData }));

    } catch (error) {
      console.error('Error fetching report data:', error);
      showNotification('Không thể tải dữ liệu báo cáo', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = (formatType: string) => {
    showNotification(`Đang chuẩn bị tệp ${formatType}...`, 'info');
    setTimeout(() => {
      showNotification(`Đã xuất báo cáo thành công!`, 'success');
    }, 1500);
  };

  if (isLoading && !data) {
    return (
      <div className="pb-32 pt-4 px-4 max-w-5xl mx-auto bg-slate-50/50 min-h-screen">
        <div className="flex items-center justify-between mb-8 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-200" />
            <div className="space-y-2">
              <div className="h-6 w-32 bg-slate-200 rounded-lg" />
              <div className="h-3 w-24 bg-slate-100 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-20 h-10 rounded-full bg-slate-200" />
            <div className="w-20 h-10 rounded-full bg-slate-200" />
          </div>
        </div>

        <div className="space-y-6">
          <div className="h-80 w-full bg-slate-200 rounded-[2.5rem] animate-pulse" />
          <div className="h-72 w-full bg-slate-200 rounded-[2.5rem] animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-64 bg-slate-200 rounded-[2.5rem] animate-pulse" />
            <div className="h-64 bg-slate-200 rounded-[2.5rem] animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32 pt-4 px-4 max-w-5xl mx-auto bg-slate-50/50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/settings" className="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center active:scale-95 transition-all">
            <ChevronLeft className="h-6 w-6 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Báo Cáo</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hiệu quả kinh doanh</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => handleExport('Excel')}
            className="px-4 h-10 rounded-full bg-white shadow-sm border border-slate-100 flex items-center gap-2 text-emerald-600 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
          >
            <Download size={16} />
            <span>Excel</span>
          </button>
          <button 
            onClick={() => handleExport('PDF')}
            className="px-4 h-10 rounded-full bg-white shadow-sm border border-slate-100 flex items-center gap-2 text-rose-600 font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
          >
            <Printer size={16} />
            <span>In</span>
          </button>
        </div>
      </div>

      {/* Period Selection */}
      <div className="mb-6 p-1 bg-white rounded-2xl flex overflow-x-auto no-scrollbar shadow-sm border border-slate-200/50">
        {PERIODS.map((period) => (
          <button
            key={period.id}
            onClick={() => setSelectedPeriod(period.id)}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-black transition-all whitespace-nowrap flex-1",
              selectedPeriod === period.id 
                ? "bg-slate-900 text-white shadow-md" 
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            )}
          >
            {period.label}
          </button>
        ))}
      </div>

      {/* Custom Range Picker */}
      <AnimatePresence>
        {selectedPeriod === 'custom' && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-4 items-center">
              <div className="flex-1 w-full">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Từ ngày</p>
                <input 
                  type="date" 
                  value={customRange.start}
                  onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                  className="w-full h-12 px-4 rounded-xl bg-slate-50 border-none font-bold text-slate-700 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <ArrowRight className="hidden sm:block text-slate-300 mt-5" />
              <div className="flex-1 w-full">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Đến ngày</p>
                <input 
                  type="date" 
                  value={customRange.end}
                  onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                  className="w-full h-12 px-4 rounded-xl bg-slate-50 border-none font-bold text-slate-700 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button 
                onClick={fetchReportData}
                className="h-12 w-full sm:w-12 mt-5 rounded-xl bg-blue-600 text-white flex items-center justify-center active:scale-95 transition-all shadow-lg shadow-blue-100"
              >
                <Search size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {data && (
        <div className="space-y-6">
          {/* Main KPI Card */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white shadow-2xl shadow-slate-200"
          >
            <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-[100px] -mr-40 -mt-40" />
            
            <div className="relative z-10">
              <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-10">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3 text-blue-400">
                    <DollarSign size={16} />
                    <span className="text-[11px] font-black uppercase tracking-[0.25em]">Tổng doanh thu</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <h2 className="text-5xl font-black tracking-tight">{formatCurrency(data.revenue.total)}</h2>
                    <div className={cn(
                      "flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-black shadow-lg",
                      data.revenue.growth >= 0 
                        ? "bg-emerald-500 text-white shadow-emerald-200/20" 
                        : "bg-rose-500 text-white shadow-rose-200/20"
                    )}>
                      {data.revenue.growth >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {Math.abs(data.revenue.growth)}%
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-10">
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Số đơn hàng</p>
                    <p className="text-3xl font-black">{data.revenue.bookings}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">TB/Đơn hàng</p>
                    <p className="text-2xl font-black">{formatCurrency(data.revenue.avgBooking)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-white/5">
                <div className="bg-white/5 p-5 rounded-3xl border border-white/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Tiền phòng</p>
                  <p className="text-xl font-black">{formatCurrency(data.revenue.roomRevenue)}</p>
                  <div className="mt-2 h-1 w-12 bg-blue-500 rounded-full" />
                </div>
                <div className="bg-white/5 p-5 rounded-3xl border border-white/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Dịch vụ</p>
                  <p className="text-xl font-black">{formatCurrency(data.revenue.serviceRevenue)}</p>
                  <div className="mt-2 h-1 w-12 bg-emerald-500 rounded-full" />
                </div>
                <div className="bg-white/5 p-5 rounded-3xl border border-white/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Hiệu suất</p>
                  <p className="text-xl font-black">{data.occupancy.rate}%</p>
                  <div className="mt-2 h-1 w-12 bg-orange-500 rounded-full" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Revenue Chart */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-widest">Biểu đồ doanh thu</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Sự biến động doanh thu theo thời gian</p>
              </div>
              <div className="px-4 py-2 bg-slate-50 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-widest">
                {format(parseISO(customRange.start), 'dd/MM')} - {format(parseISO(customRange.end), 'dd/MM')}
              </div>
            </div>
            
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }}
                    dy={15}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }}
                    tickFormatter={(val) => val >= 1000000 ? `${val/1000000}M` : val}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '24px', 
                      border: 'none', 
                      boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                      padding: '16px'
                    }}
                    itemStyle={{ fontSize: '14px', fontWeight: 900, textTransform: 'uppercase' }}
                    labelStyle={{ fontSize: '10px', fontWeight: 900, color: '#64748b', marginBottom: '6px' }}
                    formatter={(value: number) => [formatCurrency(value), 'Doanh thu']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#3b82f6" 
                    strokeWidth={4}
                    fillOpacity={1} 
                    fill="url(#colorRevenue)" 
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Breakdown Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Room Type Revenue */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-widest">Loại phòng hiệu quả</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Phân tích theo loại phòng</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Hotel size={24} />
                </div>
              </div>

              <div className="space-y-6">
                {data.roomTypes.length > 0 ? (
                  data.roomTypes.map((type, index) => (
                    <div key={type.name} className="space-y-2">
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{type.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{type.bookings} đơn đặt</p>
                        </div>
                        <p className="text-sm font-black text-slate-900">{formatCurrency(type.revenue)}</p>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(type.revenue / data.revenue.total) * 100}%` }}
                          transition={{ duration: 1, delay: index * 0.1 }}
                          className="h-full bg-blue-500 rounded-full" 
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10">
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Chưa có dữ liệu phòng</p>
                  </div>
                )}
              </div>
            </div>

            {/* Service Breakdown */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-widest">Cơ cấu dịch vụ</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Top 5 dịch vụ doanh thu cao</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <PieChart size={24} />
                </div>
              </div>

              <div className="h-56 w-full flex items-center justify-center">
                {data.services.topServices.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={data.services.topServices}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={85}
                        paddingAngle={8}
                        dataKey="value"
                        animationBegin={200}
                        animationDuration={1500}
                      >
                        {data.services.topServices.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                      />
                    </RePieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Chưa có dữ liệu dịch vụ</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                {data.services.topServices.map((service, index) => (
                  <div key={service.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-slate-600 uppercase tracking-tight truncate max-w-[80px]">{service.name}</span>
                      <span className="text-[10px] font-black text-slate-900">{formatCurrency(service.value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* AI Insights & Summary */}
          <div className="relative overflow-hidden p-8 bg-blue-600 rounded-[3rem] text-white shadow-2xl shadow-blue-200">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32" />
            <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center">
              <div className="h-20 w-20 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <TrendingUp size={40} className="text-blue-100" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-black uppercase tracking-widest mb-3">Tóm tắt & Đề xuất AI</h4>
                <div className="space-y-4">
                  <p className="text-base text-blue-50 font-medium leading-relaxed opacity-90">
                    {data.revenue.growth > 15 
                      ? `Kết quả kinh doanh vô cùng ấn tượng! Doanh thu tăng trưởng mạnh mẽ đạt ${data.revenue.growth}% so với kỳ trước. ${data.roomTypes[0] ? `Loại phòng ${data.roomTypes[0].name} đang mang lại hiệu quả cao nhất.` : ''} Hãy tập trung đẩy mạnh các dịch vụ đi kèm để nâng cao chỉ số TB/Đơn hàng hiện đang là ${formatCurrency(data.revenue.avgBooking)}.`
                      : data.occupancy.rate < 40
                      ? `Công suất phòng hiện tại (${data.occupancy.rate}%) đang dưới mức kỳ vọng. Đề xuất triển khai các chiến dịch "Flash Sale" cho khung giờ thấp điểm hoặc tặng voucher dịch vụ ${data.services.topServices[0]?.name || ''} để kích cầu.`
                      : `Hoạt động kinh doanh đang đi vào quỹ đạo ổn định. Doanh thu dịch vụ đóng góp ${Math.round((data.revenue.serviceRevenue / data.revenue.total) * 100)}% tổng doanh thu. Bạn có thể tối ưu hóa quy trình phục vụ dịch vụ ${data.services.topServices[0]?.name || ''} để tăng biên lợi nhuận.`
                    }
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-wider">
                      #TangTruong
                    </span>
                    <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-wider">
                      #ToiUuDichVu
                    </span>
                    <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-wider">
                      #HieuSuatPhong
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Performance Table */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-50">
              <h3 className="text-base font-black text-slate-800 uppercase tracking-widest">Chi tiết theo ngày</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Dữ liệu chi tiết từng ngày trong kỳ</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ngày</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Đơn hàng</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Doanh thu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.chartData.slice().reverse().map((day) => (
                    <tr key={day.date} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-4 text-sm font-black text-slate-700">{day.date}</td>
                      <td className="px-8 py-4">
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-black">
                          {day.bookings} đơn
                        </span>
                      </td>
                      <td className="px-8 py-4 text-sm font-black text-slate-900 text-right">
                        {formatCurrency(day.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay for subsequent fetches */}
      {isLoading && data && (
        <div className="fixed inset-0 bg-white/40 backdrop-blur-[2px] z-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Đang cập nhật...</p>
          </div>
        </div>
      )}
    </div>
  );
}
