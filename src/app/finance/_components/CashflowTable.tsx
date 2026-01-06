'use client';

import React from 'react';
import { ArrowUp, ArrowDown, Clock, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { CashflowTransaction } from '@/types';

interface CashflowTableProps {
  transactions: CashflowTransaction[];
  onEdit?: (t: CashflowTransaction) => void;
  onDelete?: (t: CashflowTransaction) => void;
}

export const CashflowTable: React.FC<CashflowTableProps> = ({
  transactions,
  onEdit,
  onDelete: _onDelete,
}) => {
  const abbreviateContent = (content: string) => {
    let abbreviated = content;

    // Loại bỏ chữ Folio
    abbreviated = abbreviated.replace(/Folio[:\s-]*|Folio/gi, '');

    // Viết tắt Thanh toán -> TT
    abbreviated = abbreviated.replace(/Thanh toán/gi, 'TT');

    // Viết tắt Phòng -> P
    abbreviated = abbreviated.replace(/Phòng\s*(P?\d+)/gi, (match, p1) => {
      return p1.startsWith('P') ? p1 : `P${p1}`;
    });

    // Viết tắt Dịch vụ -> DV
    abbreviated = abbreviated.replace(/Dịch vụ/gi, 'DV');

    // Nếu có dạng "TT tiền P204" -> "P204 TT" cho ngắn gọn
    const matchRoomTT = abbreviated.match(/TT\s+(?:tiền\s+)?(P\d+)/i);
    if (matchRoomTT) {
      abbreviated = `${matchRoomTT[1]} TT`;
    }

    return abbreviated.trim();
  };

  const getMethodSymbol = (method: string) => {
    switch (method) {
      case 'cash':
        return 'TM';
      case 'transfer':
        return 'CK';
      case 'card':
        return 'POS';
      default:
        return '';
    }
  };

  const getMethodStyle = (method: string) => {
    switch (method) {
      case 'cash':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'transfer':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'card':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="bg-slate-50/50 rounded-[2rem] border border-dashed border-slate-200 p-12 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
          <Clock className="text-slate-300" size={24} />
        </div>
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-1">
          Chưa có giao dịch
        </h3>
        <p className="text-slate-400 font-medium text-[10px] uppercase tracking-widest max-w-[200px]">
          Các giao dịch trong khoảng thời gian này sẽ hiển thị ở đây.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {transactions.map((t) => (
        <div
          key={t.id}
          className="group relative bg-white pr-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:border-indigo-100 transition-all duration-300 active:scale-[0.98] cursor-pointer overflow-hidden"
          onClick={() => onEdit?.(t)}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex items-center justify-between gap-3 flex-1">
              {/* 1. Creative Side-Badge Time Capsule */}
              <div className="relative flex w-[62px] h-[52px] shadow-sm overflow-hidden shrink-0 bg-slate-100 border-r border-slate-200">
                {/* Left Side: Color Indicator + Arrow (Side-Badge) */}
                <div
                  className={cn(
                    'w-[18px] flex items-center justify-center shrink-0',
                    t.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'
                  )}
                >
                  {t.type === 'income' ? (
                    <ArrowUp size={12} className="text-white" strokeWidth={5} />
                  ) : (
                    <ArrowDown size={12} className="text-white" strokeWidth={5} />
                  )}
                </div>

                {/* Right Side: Stacked Time and Date */}
                <div className="flex-1 flex flex-col">
                  {/* Top: Time (Maximized) */}
                  <div className="h-1/2 flex items-center justify-center bg-slate-200/30">
                    <span className="font-black text-slate-800 text-[13px] leading-none tracking-tighter">
                      {format(new Date(t.created_at), 'HH:mm')}
                    </span>
                  </div>

                  {/* Divider Line */}
                  <div className="h-[1px] bg-slate-200 w-full" />

                  {/* Bottom: Date (Maximized) */}
                  <div className="flex-1 flex items-center justify-center">
                    <span className="font-bold text-slate-600 text-[9px] tracking-tighter leading-none uppercase">
                      {format(new Date(t.created_at), 'dd/MM/yy')}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Content Info */}
              <div className="flex flex-col min-w-0 flex-1 py-1">
                <span className="text-[13px] font-bold text-slate-700 leading-tight line-clamp-1">
                  {abbreviateContent(t.content)}
                </span>
              </div>
            </div>

            {/* 3. Amount & Payment Method */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex flex-col items-end gap-0.5 relative">
                <div className="flex items-start">
                  <span
                    className={cn(
                      'text-[16px] font-black tracking-tighter leading-none',
                      t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                    )}
                  >
                    {t.type === 'income' ? '+' : '-'}
                    {t.amount.toLocaleString()}
                  </span>
                  {/* Superscript-style Payment Badge */}
                  <span
                    className={cn(
                      'ml-0.5 px-0.5 py-0.5 rounded-md text-[6px] font-black border leading-none shadow-sm uppercase -mt-1',
                      getMethodStyle(t.payment_method_code || t.payment_method || 'cash')
                    )}
                  >
                    {getMethodSymbol(t.payment_method_code || t.payment_method || 'cash')}
                  </span>
                </div>

                {/* User Label */}
                <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">
                  {t.created_by || 'ADMIN'}
                </span>
              </div>

              {/* Detail Indicator Arrow */}
              <div className="text-slate-200 group-hover:text-indigo-400 transition-colors">
                <ChevronRight size={16} strokeWidth={3} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
