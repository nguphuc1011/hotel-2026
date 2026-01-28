import React, { useMemo, useState } from 'react';
import { X, Calendar, ArrowRight, User, FileText, ExternalLink, Clock, ChevronDown, ChevronRight, PieChart } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoney } from '@/utils/format';

interface DrillDownItem {
  category: string;
  amount: number;
  flow_type: 'IN' | 'OUT';
  description: string | null;
  occurred_at: string;
  creator?: string;
  ref_id?: string;
  ref_type?: 'booking' | 'expense' | 'import';
}

interface DrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: DrillDownItem[];
  totalAmount: number;
  averages?: Record<string, number>;
}

export default function DrillDownModal({ isOpen, onClose, title, items, totalAmount, averages }: DrillDownModalProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // 1. Grouping Logic
  const groupedItems = useMemo(() => {
    const groups = items.reduce((acc, item) => {
      const key = item.category || 'Khác';
      if (!acc[key]) {
        acc[key] = {
          items: [],
          total: 0
        };
      }
      acc[key].items.push(item);
      acc[key].total += item.amount;
      return acc;
    }, {} as Record<string, { items: DrillDownItem[], total: number }>);

    // Sort groups by total amount desc
    return Object.entries(groups).sort(([, a], [, b]) => b.total - a.total);
  }, [items]);

  if (!isOpen) return null;

  const handleLinkClick = (item: DrillDownItem) => {
    if (!item.ref_id) return;
    
    // In a real app, this would route to the specific detail page or open a modal context
    // For now, we simulate the "Evidence" check
    if (item.ref_type === 'booking') {
        toast.info(`Đang mở Folio phòng: ${item.ref_id}`);
        // window.open(`/bookings/${item.ref_id}`, '_blank');
    } else {
        toast.info(`Đang mở chứng từ gốc: ${item.ref_id}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#F5F5F7] rounded-[24px] w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden border border-white/20">
        
        {/* Header - Glassmorphism */}
        <div className="p-6 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 flex items-center justify-between sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-full">
                    Bằng chứng thép
                </span>
                <span className="text-[11px] font-medium text-slate-400">
                    {items.length} giao dịch
                </span>
            </div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">{title}</h3>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
                <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">Tổng cộng</div>
                <div className={`text-xl font-black tracking-tight ${totalAmount >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatMoney(totalAmount)}
                </div>
            </div>
            <button 
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-all shadow-sm active:scale-95 border border-slate-200/60"
            >
                <X size={20} />
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#F8F9FA]">
            {groupedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-60 text-slate-400">
                    <FileText size={48} className="mb-4 opacity-20" />
                    <p className="text-sm font-medium">Không có dữ liệu chứng từ</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Summary Header */}
                    <div className="flex items-center justify-between px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <span>Danh mục ({groupedItems.length})</span>
                        <span>Tổng tiền</span>
                    </div>

                    {groupedItems.map(([category, group]) => {
                        const isExpanded = expandedCategory === category;
                        const percent = totalAmount !== 0 ? (group.total / totalAmount) * 100 : 0;
                        
                        return (
                        <div key={category} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
                            {/* Summary Row (Clickable) */}
                            <div 
                                onClick={() => setExpandedCategory(isExpanded ? null : category)}
                                className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50/30' : 'hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isExpanded ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                        {isExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-700 text-sm">{category}</h4>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-xs text-slate-400 font-medium">{group.items.length} giao dịch</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                            <span className="text-xs text-blue-500 font-medium">{percent.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-slate-800">{formatMoney(group.total)}</div>
                                    {/* Mini Bar */}
                                    <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden ml-auto">
                                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(Math.abs(percent), 100)}%` }}></div>
                                    </div>
                                </div>
                            </div>

                            {/* Details (Collapsible) */}
                            {isExpanded && (
                                <div className="border-t border-blue-100 bg-slate-50/30 p-2 animate-in slide-in-from-top-2">
                                    <div className="divide-y divide-slate-100">
                                        {group.items.map((item, idx) => (
                                            <div key={idx} className="p-3 hover:bg-white rounded-xl transition-colors grid grid-cols-12 gap-3 items-center group">
                                                
                                                {/* Time */}
                                                <div className="col-span-3 sm:col-span-2 flex flex-col justify-center">
                                                    <div className="flex items-center gap-1.5 text-slate-500">
                                                        <Clock size={12} />
                                                        <span className="text-xs font-mono font-medium">
                                                            {new Date(item.occurred_at).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-300 pl-4">
                                                        {new Date(item.occurred_at).toLocaleDateString('vi-VN', {day: '2-digit', month: '2-digit'})}
                                                    </div>
                                                </div>

                                                {/* Description & Link */}
                                                <div className="col-span-6 sm:col-span-7">
                                                    <div 
                                                        onClick={() => handleLinkClick(item)}
                                                        className={`text-sm font-medium text-slate-700 line-clamp-1 group-hover:text-blue-600 transition-colors flex items-center gap-2 ${item.ref_id ? 'cursor-pointer' : ''}`}
                                                    >
                                                        {item.description || item.category}
                                                        {item.ref_id && <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                                                    </div>
                                                    {/* Sub-details (if any) */}
                                                    {item.ref_type && (
                                                        <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider font-bold">
                                                            {item.ref_type === 'booking' ? 'Booking Ref' : 'Document Ref'}: {item.ref_id?.slice(0, 8)}...
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Amount */}
                                                <div className="col-span-3 sm:col-span-3 text-right">
                                                    <div className={`text-sm font-bold ${item.flow_type === 'IN' ? 'text-green-600' : 'text-slate-700'}`}>
                                                        {item.flow_type === 'IN' ? '+' : '-'}{formatMoney(item.amount)}
                                                    </div>
                                                    {/* Comparison Insight */}
                                                    {averages && averages[item.category] && (
                                                        <div className="flex items-center justify-end gap-1 mt-0.5">
                                                            {item.amount > averages[item.category] ? (
                                                                item.flow_type === 'OUT' ? (
                                                                    // Higher Expense = Bad (Red)
                                                                    <>
                                                                        <span className="text-[10px] text-red-500 font-medium">Cao</span>
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                                                                    </>
                                                                ) : (
                                                                    // Higher Revenue = Good (Green)
                                                                    <>
                                                                        <span className="text-[10px] text-green-500 font-medium">Tốt</span>
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                                                    </>
                                                                )
                                                            ) : (
                                                                item.flow_type === 'OUT' ? (
                                                                    // Lower Expense = Good (Green)
                                                                    <>
                                                                        <span className="text-[10px] text-green-500 font-medium">Tiết kiệm</span>
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                                                    </>
                                                                ) : (
                                                                    // Lower Revenue = Bad (Red)
                                                                    <>
                                                                        <span className="text-[10px] text-red-400 font-medium">Thấp</span>
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-300"></div>
                                                                    </>
                                                                )
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        );
                    })}
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200/60 bg-slate-50/50 flex justify-end">
             <div className="text-[10px] text-slate-400 italic">
                * Dữ liệu được trích xuất trực tiếp từ Sổ cái hệ thống (General Ledger)
             </div>
        </div>
      </div>
    </div>
  );
}
