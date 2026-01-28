import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { formatMoney } from '@/utils/format';

interface ProfitChartsProps {
  kpis: {
    revenue: number;
    cogs: number;
    opex: number;
    net_profit: number;
  };
  onDrillDown: (segment: string) => void;
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444']; // Profit (Green), OpEx (Orange), COGS (Red)

export default function ProfitCharts({ kpis, onDrillDown }: ProfitChartsProps) {
  // Data for Pie Chart
  const pieData = [
    { name: 'Lợi nhuận ròng', value: kpis.net_profit, color: '#10b981' }, // Emerald-500
    { name: 'Chi phí vận hành', value: kpis.opex, color: '#f59e0b' }, // Amber-500
    { name: 'Giá vốn hàng bán', value: kpis.cogs, color: '#ef4444' }, // Red-500
  ].filter(d => d.value > 0);

  // Data for Waterfall Chart (Simulated with Stacked Bar)
  // Revenue: Base 0, Val Revenue
  // COGS: Base (Revenue - COGS), Val COGS
  // OpEx: Base (Revenue - COGS - OpEx), Val OpEx
  // Profit: Base 0, Val Profit
  
  const revenue = kpis.revenue;
  const afterCogs = revenue - kpis.cogs;
  const afterOpex = afterCogs - kpis.opex; // Should equal net_profit

  const waterfallData = [
    { name: 'Doanh thu', base: 0, value: revenue, fill: '#3b82f6', type: 'total' }, // Blue
    { name: 'Giá vốn', base: afterCogs, value: kpis.cogs, fill: '#ef4444', type: 'minus' }, // Red
    { name: 'Vận hành', base: afterOpex, value: kpis.opex, fill: '#f59e0b', type: 'minus' }, // Orange
    { name: 'Lợi nhuận', base: 0, value: kpis.net_profit, fill: '#10b981', type: 'total' }, // Green
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload.find((p: any) => p.name === 'value' || p.name === 'Lợi nhuận ròng' || p.name === 'Chi phí vận hành' || p.name === 'Giá vốn hàng bán' || p.dataKey === 'value');
      if (!data) return null;
      return (
        <div className="bg-slate-900 text-white text-xs p-3 rounded-lg shadow-xl border border-slate-700">
          <p className="font-bold mb-1 uppercase tracking-wider text-slate-400">{label || data.name}</p>
          <p className="text-lg font-black">{formatMoney(data.value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
      {/* Pie Chart */}
      <div className="bento-card bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm">
        <h3 className="text-lg font-black text-slate-800 mb-6 uppercase tracking-tight">Cơ cấu dòng tiền</h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                onClick={(data) => onDrillDown(data.name)}
                cursor="pointer"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                ))}
              </Pie>
              <RechartsTooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="circle"
                formatter={(value) => <span className="text-xs font-bold text-slate-600 ml-1">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Waterfall Chart */}
      <div className="bento-card bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm">
        <h3 className="text-lg font-black text-slate-800 mb-6 uppercase tracking-tight">Thác nước lợi nhuận</h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={waterfallData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} 
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`}
              />
              <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
              
              {/* Invisible base bar to push the visible bar up */}
              <Bar dataKey="base" stackId="a" fill="transparent" />
              
              {/* Visible bar */}
              <Bar 
                dataKey="value" 
                stackId="a" 
                radius={[4, 4, 4, 4]} 
                onClick={(data) => onDrillDown(data.name)}
                cursor="pointer"
              >
                {waterfallData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
