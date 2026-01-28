import React from 'react';
import { Lightbulb, AlertTriangle, CheckCircle } from 'lucide-react';

interface SmartAlertsProps {
  kpis: {
    revenue: number;
    cogs: number;
    opex: number;
    net_profit: number;
  };
  topItem?: { name: string; revenue: number };
}

export default function SmartAlerts({ kpis, topItem }: SmartAlertsProps) {
  const alerts = [];
  
  // 1. Profitability Check
  if (kpis.net_profit > 0) {
      const margin = (kpis.net_profit / kpis.revenue) * 100;
      if (margin > 50) {
          alerts.push({
              type: 'success',
              icon: CheckCircle,
              message: `Mô hình đang hoạt động rất hiệu quả với biên lợi nhuận ${margin.toFixed(0)}%.`
          });
      } else {
        alerts.push({
            type: 'info',
            icon: Lightbulb,
            message: `Lợi nhuận dương nhưng biên độ (${margin.toFixed(0)}%) có thể tối ưu thêm.`
        });
      }
  } else {
      alerts.push({
          type: 'warning',
          icon: AlertTriangle,
          message: "Đang lỗ! Cần kiểm soát chi phí vận hành ngay lập tức."
      });
  }

  // 2. Cost Analysis
  if (kpis.opex > kpis.cogs * 2 && kpis.opex > 0) {
      alerts.push({
          type: 'warning',
          icon: AlertTriangle,
          message: "Chi phí vận hành đang cao gấp đôi giá vốn. Hãy kiểm tra tiền điện/nước/nhân sự."
      });
  }

  // 3. Top Item Insight
  if (topItem && kpis.revenue > 0) {
      const contribution = (topItem.revenue / kpis.revenue) * 100;
      if (contribution > 50) {
          alerts.push({
              type: 'info',
              icon: Lightbulb,
              message: `"${topItem.name}" đang gánh team (${contribution.toFixed(0)}% doanh thu). Hãy tập trung bán mạnh món này!`
          });
      }
  }

  return (
    <div className="bento-card bg-slate-50 p-6 rounded-[24px] border border-slate-200 h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
            <Lightbulb size={20} />
        </div>
        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Trợ lý ảo phân tích</h3>
      </div>

      <div className="space-y-4">
        {alerts.map((alert, index) => (
            <div key={index} className="flex gap-3 items-start bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <alert.icon 
                    size={20} 
                    className={`shrink-0 mt-0.5 ${
                        alert.type === 'success' ? 'text-emerald-500' : 
                        alert.type === 'warning' ? 'text-red-500' : 'text-blue-500'
                    }`} 
                />
                <p className="text-sm font-medium text-slate-600 leading-relaxed">
                    {alert.message}
                </p>
            </div>
        ))}
        {alerts.length === 0 && (
            <p className="text-slate-400 text-sm font-medium text-center">Chưa đủ dữ liệu để phân tích.</p>
        )}
      </div>
    </div>
  );
}
