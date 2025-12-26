'use client';

import { useState } from 'react';
import { 
  BarChart3, 
  ChevronLeft, 
  Calendar, 
  Download, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart,
  FileText,
  Printer,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useNotification } from '@/context/NotificationContext';

const REPORT_TYPES = [
  { id: 'revenue', title: 'Báo cáo Doanh thu', icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { id: 'occupancy', title: 'Công suất Phòng', icon: PieChart, color: 'text-blue-600', bg: 'bg-blue-50' },
  { id: 'services', title: 'Báo cáo Dịch vụ', icon: FileText, color: 'text-orange-600', bg: 'bg-orange-50' },
];

const PERIODS = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'yesterday', label: 'Hôm qua' },
  { id: 'week', label: 'Tuần này' },
  { id: 'month', label: 'Tháng này' },
];

export default function ReportsPage() {
  const { showNotification } = useNotification();
  const [selectedType, setSelectedType] = useState('revenue');
  const [selectedPeriod, setSelectedPeriod] = useState('month');

  const mockData = {
    today: {
      revenue: { total: 12500000, growth: 12.5, bookings: 45, avgBooking: 277777 },
      occupancy: { rate: 85, checkedIn: 42, available: 8, maintenance: 2 },
      services: { total: 3200000, topService: 'Giặt ủi', count: 150 },
    },
    yesterday: {
      revenue: { total: 11800000, growth: -5.2, bookings: 42, avgBooking: 280952 },
      occupancy: { rate: 80, checkedIn: 40, available: 10, maintenance: 2 },
      services: { total: 2900000, topService: 'Ăn tại phòng', count: 140 },
    },
    week: {
      revenue: { total: 85000000, growth: 8.1, bookings: 310, avgBooking: 274193 },
      occupancy: { rate: 78, checkedIn: 39, available: 11, maintenance: 2 },
      services: { total: 21500000, topService: 'Giặt ủi', count: 980 },
    },
    month: {
      revenue: { total: 345000000, growth: 15.3, bookings: 1250, avgBooking: 276000 },
      occupancy: { rate: 82, checkedIn: 41, available: 9, maintenance: 2 },
      services: { total: 88000000, topService: 'Thuê xe', count: 3500 },
    },
  };

  const activeData = mockData[selectedPeriod as keyof typeof mockData];

  const handleExport = (format: string) => {
    showNotification(`Đang chuẩn bị tệp ${format}...`, 'info');
    setTimeout(() => {
      showNotification(`Đã xuất báo cáo thành công!`, 'success');
    }, 1500);
  };

  return (
    <div className="pb-32 pt-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/settings" className="p-2 -ml-2 rounded-full active:bg-slate-200 transition-colors">
          <ChevronLeft className="h-6 w-6 text-slate-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Báo Cáo & Thống Kê</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Phân tích hiệu quả kinh doanh</p>
        </div>
      </div>

      {/* Period Selection */}
      <div className="mb-8 flex p-1.5 bg-slate-200/50 rounded-[1.5rem] w-full overflow-x-auto no-scrollbar">
        {PERIODS.map((period) => (
          <button
            key={period.id}
            onClick={() => setSelectedPeriod(period.id)}
            className={cn(
              "px-6 py-2 rounded-full text-sm font-black transition-all whitespace-nowrap flex-1",
              selectedPeriod === period.id ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {period.label}
          </button>
        ))}
      </div>

      {/* Main Stats Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 relative overflow-hidden rounded-[3rem] bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white shadow-2xl shadow-blue-200"
      >
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <TrendingUp size={160} />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={16} className="text-blue-200" />
            <span className="text-xs font-black uppercase tracking-widest text-blue-100">Tổng doanh thu</span>
          </div>
          <div className="flex items-end gap-3 mb-6">
            <h2 className="text-4xl font-black">{formatCurrency(activeData.revenue.total)}</h2>
            <div className={cn(
              "mb-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black backdrop-blur-md",
              activeData.revenue.growth >= 0 ? "bg-white/20" : "bg-red-500/50"
            )}>
              {activeData.revenue.growth >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {activeData.revenue.growth}%
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-6">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Số đơn đặt</p>
              <p className="text-xl font-black">{activeData.revenue.bookings}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Trung bình/đơn</p>
              <p className="text-xl font-black">{formatCurrency(activeData.revenue.avgBooking)}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Report Types Grid */}
      <h3 className="mb-4 px-2 text-xs font-black uppercase tracking-widest text-slate-400">Loại báo cáo chi tiết</h3>
      <div className="grid grid-cols-1 gap-4 mb-8">
        {REPORT_TYPES.map((type) => (
          <motion.button
            key={type.id}
            whileHover={{ x: 4 }}
            onClick={() => setSelectedType(type.id)}
            className={cn(
              "group flex items-center justify-between p-6 rounded-[2.5rem] border transition-all",
              selectedType === type.id 
                ? "bg-white border-blue-100 shadow-md" 
                : "bg-slate-50 border-transparent hover:bg-white hover:border-slate-100 shadow-sm"
            )}
          >
            <div className="flex items-center gap-4">
              <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center transition-transform group-active:scale-90", type.bg)}>
                <type.icon className={cn("h-7 w-7", type.color)} />
              </div>
              <div className="text-left">
                <h4 className="text-base font-black text-slate-800">{type.title}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nhấn để xem chi tiết</p>
              </div>
            </div>
            <ChevronRight className={cn("h-6 w-6 transition-colors", selectedType === type.id ? "text-blue-500" : "text-slate-300")} />
          </motion.button>
        ))}
      </div>

      {/* Details Section */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedType}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          className="mb-8"
        >
          {selectedType === 'revenue' && (
            <div className="grid grid-cols-2 gap-4">
              <StatCard title="Doanh thu phòng" value={formatCurrency(activeData.revenue.total * 0.8)} />
              <StatCard title="Doanh thu dịch vụ" value={formatCurrency(activeData.revenue.total * 0.2)} />
            </div>
          )}
          {selectedType === 'occupancy' && (
            <div className="grid grid-cols-2 gap-4">
              <StatCard title="Tỷ lệ lấp đầy" value={`${activeData.occupancy.rate}%`} />
              <StatCard title="Phòng có khách" value={activeData.occupancy.checkedIn} />
              <StatCard title="Phòng trống" value={activeData.occupancy.available} />
              <StatCard title="Đang bảo trì" value={activeData.occupancy.maintenance} />
            </div>
          )}
          {selectedType === 'services' && (
            <div className="grid grid-cols-2 gap-4">
              <StatCard title="Doanh thu dịch vụ" value={formatCurrency(activeData.services.total)} />
              <StatCard title="Lượt sử dụng" value={activeData.services.count} />
              <StatCard title="Dịch vụ hot" value={activeData.services.topService} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Quick Actions */}
      <h3 className="mb-4 px-2 text-xs font-black uppercase tracking-widest text-slate-400">Thao tác nhanh</h3>
      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => handleExport('Excel')}
          className="flex flex-col items-center justify-center p-6 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm active:scale-95 transition-all gap-3"
        >
          <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Download size={24} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Xuất Excel</span>
        </button>
        <button 
          onClick={() => handleExport('PDF')}
          className="flex flex-col items-center justify-center p-6 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm active:scale-95 transition-all gap-3"
        >
          <div className="h-12 w-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600">
            <Printer size={24} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">In Báo Cáo</span>
        </button>
      </div>

      {/* Floating Filter Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-24 right-6 h-16 w-16 rounded-full bg-slate-800 text-white shadow-2xl shadow-slate-200 flex items-center justify-center z-40"
      >
        <Calendar size={28} />
      </motion.button>
    </div>
  );
}

const StatCard = ({ title, value }: { title: string, value: string | number }) => (
  <div className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm">
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</p>
    <p className="text-2xl font-black text-slate-700">{value}</p>
  </div>
);
