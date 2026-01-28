import React from 'react';
import { Trophy, TrendingUp } from 'lucide-react';
import { formatMoney } from '@/utils/format';

export interface ReportTopItem {
  name: string;
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
}

interface TopItemsTableProps {
  items: ReportTopItem[];
}

export default function TopItemsTable({ items }: TopItemsTableProps) {
  return (
    <div className="bento-card bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-yellow-50 text-yellow-600 flex items-center justify-center">
            <Trophy size={20} />
        </div>
        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Top 5 Món Lời Nhất</h3>
      </div>

      <div className="space-y-4">
        {items.length === 0 ? (
            <p className="text-slate-400 text-sm font-medium text-center py-8">Chưa có dữ liệu bán hàng</p>
        ) : (
            items.map((item, index) => {
                const margin = item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0;
                return (
                    <div key={index} className="flex items-center justify-between group hover:bg-slate-50 p-2 rounded-xl transition-colors -mx-2">
                        <div className="flex items-center gap-3">
                            <div className={`
                                w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm
                                ${index === 0 ? 'bg-yellow-100 text-yellow-600' : 
                                  index === 1 ? 'bg-slate-200 text-slate-600' : 
                                  index === 2 ? 'bg-orange-100 text-orange-600' : 'bg-slate-50 text-slate-400'}
                            `}>
                                #{index + 1}
                            </div>
                            <div>
                                <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                                <div className="text-xs text-slate-500 font-medium">Đã bán: {item.quantity}</div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="font-black text-emerald-600 text-sm">+{formatMoney(item.profit)}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Margin: {margin.toFixed(0)}%
                            </div>
                        </div>
                    </div>
                );
            })
        )}
      </div>
    </div>
  );
}
