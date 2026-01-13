'use client';

import { 
  BarChart3, 
  TrendingUp, 
  ArrowUpRight,
  PieChart,
  Activity
} from 'lucide-react';

export default function ReportsPage() {
  return (
    <div className="p-8 md:p-16 max-w-7xl mx-auto pb-32 md:pb-16">
      <header className="mb-16">
        <h1 className="text-5xl font-black-italic tracking-tighter uppercase italic text-accent">Báo cáo</h1>
        <p className="text-muted font-bold text-sm tracking-tight mt-4 uppercase tracking-[0.1em]">Phân tích hiệu suất & Doanh thu</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Key Metrics */}
        <div className="bento-card p-10 flex flex-col justify-between min-h-[240px] bg-white border-accent/10 active:scale-95 transition-all group">
          <div className="flex justify-between items-start">
            <div className="w-14 h-14 bg-accent/5 rounded-[22px] flex items-center justify-center text-accent">
              <TrendingUp size={28} />
            </div>
            <span className="text-xs font-black text-green-500 uppercase tracking-widest">+12.5%</span>
          </div>
          <div>
            <p className="text-muted font-black text-[10px] uppercase tracking-[0.2em] mb-2">Doanh thu tháng</p>
            <h3 className="text-4xl font-black tracking-tighter italic text-main group-hover:text-accent transition-colors">420.5M</h3>
          </div>
        </div>

        <div className="bento-card p-10 flex flex-col justify-between min-h-[240px] bg-white active:scale-95 transition-all group hover:border-accent/20">
          <div className="flex justify-between items-start">
            <div className="w-14 h-14 bg-accent/5 rounded-[22px] flex items-center justify-center text-accent">
              <PieChart size={28} />
            </div>
            <ArrowUpRight size={20} className="text-ghost group-hover:text-accent transition-colors" />
          </div>
          <div>
            <p className="text-muted font-black text-[10px] uppercase tracking-[0.2em] mb-2">Tỷ lệ lấp đầy</p>
            <h3 className="text-4xl font-black tracking-tighter text-main group-hover:text-accent transition-colors">78.2%</h3>
          </div>
        </div>

        <div className="md:col-span-2 bento-card p-10 flex flex-col justify-center items-center text-center border border-dashed border-accent/20 bg-transparent shadow-none">
          <div className="w-20 h-20 bg-accent/5 rounded-full flex items-center justify-center mb-6">
            <Activity size={32} className="text-accent/20" />
          </div>
          <h3 className="text-2xl font-black-italic uppercase italic tracking-tighter text-ghost">Sắp ra mắt</h3>
          <p className="text-muted text-sm font-bold mt-4 max-w-xs leading-relaxed uppercase tracking-tight">
            Hệ thống biểu đồ tương tác và báo cáo chi tiết đang được tinh chỉnh.
          </p>
        </div>

        {/* Large Bento Chart Placeholder */}
        <div className="md:col-span-4 bento-card p-16 bg-white flex flex-col justify-center items-center min-h-[450px] border-accent/5">
          <div className="relative">
            <BarChart3 size={80} className="text-accent/5 mb-8" />
            <div className="absolute inset-0 flex items-center justify-center">
               <div className="w-1 h-12 bg-accent/10 rounded-full mx-1 animate-pulse" />
               <div className="w-1 h-20 bg-accent/10 rounded-full mx-1 animate-pulse delay-75" />
               <div className="w-1 h-16 bg-accent/10 rounded-full mx-1 animate-pulse delay-150" />
            </div>
          </div>
          <p className="text-ghost font-black text-[11px] uppercase tracking-[0.3em] mt-8">Advanced Analytics Engine</p>
          <div className="mt-12 flex gap-4">
            <div className="h-1.5 w-32 bg-accent/5 rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-accent/20 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
