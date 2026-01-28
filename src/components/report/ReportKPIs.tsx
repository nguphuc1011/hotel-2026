import React from 'react';
import { TrendingUp, TrendingDown, Wallet, ArrowRight } from 'lucide-react';
import { formatMoney } from '@/utils/format';

interface ReportKPIsProps {
  data: {
    revenue: number;
    cogs: number;
    opex: number;
    net_profit: number;
  };
  onDrillDown: (type: 'REVENUE' | 'COSTS' | 'PROFIT') => void;
}

export default function ReportKPIs({ data, onDrillDown }: ReportKPIsProps) {
  const totalCosts = data.cogs + data.opex;
  const margin = data.revenue > 0 ? (data.net_profit / data.revenue) * 100 : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* Revenue Card */}
      <div 
        onClick={() => onDrillDown('REVENUE')}
        className="bento-card bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp size={80} className="text-blue-600" />
        </div>
        <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <TrendingUp size={20} />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tổng thu nhập</span>
            </div>
            <h3 className="text-3xl font-black text-slate-800 tracking-tight mb-1">
                {formatMoney(data.revenue)}
            </h3>
            <div className="flex items-center text-xs font-bold text-blue-600 gap-1 group-hover:translate-x-1 transition-transform">
                Xem chi tiết <ArrowRight size={12} />
            </div>
        </div>
      </div>

      {/* Costs Card */}
      <div 
        onClick={() => onDrillDown('COSTS')}
        className="bento-card bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm hover:shadow-md hover:border-orange-200 transition-all cursor-pointer group relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingDown size={80} className="text-orange-600" />
        </div>
        <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                    <TrendingDown size={20} />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tổng chi phí</span>
            </div>
            <h3 className="text-3xl font-black text-slate-800 tracking-tight mb-1">
                {formatMoney(totalCosts)}
            </h3>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span>GV: {formatMoney(data.cogs)}</span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span>VH: {formatMoney(data.opex)}</span>
            </div>
        </div>
      </div>

      {/* Net Profit Card */}
      <div 
        className="bento-card bg-slate-900 p-6 rounded-[24px] shadow-lg shadow-slate-900/20 group relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-4 opacity-10">
            <Wallet size={80} className="text-white" />
        </div>
        <div className="relative z-10 text-white">
            <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 text-emerald-400 flex items-center justify-center">
                    <Wallet size={20} />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lợi nhuận ròng</span>
            </div>
            <h3 className={`text-4xl font-black tracking-tight mb-4 ${data.net_profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatMoney(data.net_profit)}
            </h3>
            
            {/* Progress Bar */}
            <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span>Biên lợi nhuận (Margin)</span>
                    <span className={margin > 50 ? 'text-emerald-400' : 'text-yellow-400'}>{margin.toFixed(1)}%</span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                    <div 
                        className={`h-full rounded-full ${margin > 50 ? 'bg-emerald-500' : 'bg-yellow-500'}`} 
                        style={{ width: `${Math.min(Math.max(margin, 0), 100)}%` }} 
                    />
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
