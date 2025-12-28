'use client';

import React from 'react';
import { 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Clock, 
  User, 
  CreditCard, 
  Banknote,
  MoreHorizontal
} from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CashflowTransaction } from '@/types';

interface CashflowTableProps {
  transactions: CashflowTransaction[];
}

export const CashflowTable: React.FC<CashflowTableProps> = ({ transactions }) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);
  };

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-20 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
          <Clock className="text-slate-200" size={32} />
        </div>
        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Chưa có giao dịch</h3>
        <p className="text-slate-400 font-bold text-sm max-w-xs">
          Các giao dịch thu chi trong khoảng thời gian này sẽ được hiển thị tại đây.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-50">
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Thời gian</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Loại & Danh mục</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nội dung</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Số tiền</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Thanh toán</th>
              <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Người tạo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {transactions.map((t) => (
              <tr key={t.id} className="group hover:bg-slate-50/50 transition-colors">
                <td className="px-8 py-6">
                  <div className="flex flex-col">
                    <span className="font-black text-slate-700 text-sm">
                      {format(new Date(t.created_at), 'HH:mm', { locale: vi })}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      {format(new Date(t.created_at), 'dd/MM/yyyy', { locale: vi })}
                    </span>
                  </div>
                </td>
                <td className="px-8 py-6">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-xl",
                      t.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    )}>
                      {t.type === 'income' ? <ArrowUpCircle size={18} /> : <ArrowDownCircle size={18} />}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-black text-slate-700 text-sm uppercase tracking-tight">
                        {t.category_name}
                      </span>
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-widest",
                        t.type === 'income' ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {t.type === 'income' ? 'Khoản Thu' : 'Khoản Chi'}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-6">
                  <div className="flex flex-col max-w-xs">
                    <span className="font-bold text-slate-600 text-sm line-clamp-1">{t.content}</span>
                    {t.notes && (
                      <span className="text-[10px] text-slate-400 italic line-clamp-1">{t.notes}</span>
                    )}
                  </div>
                </td>
                <td className="px-8 py-6">
                  <span className={cn(
                    "text-lg font-black tracking-tighter",
                    t.type === 'income' ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                  </span>
                </td>
                <td className="px-8 py-6">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl w-fit">
                    {t.payment_method === 'cash' ? (
                      <Banknote size={14} className="text-slate-500" />
                    ) : (
                      <CreditCard size={14} className="text-slate-500" />
                    )}
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                      {t.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                    </span>
                  </div>
                </td>
                <td className="px-8 py-6 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="flex flex-col items-end">
                      <span className="font-bold text-slate-700 text-sm">{t.created_by}</span>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1">
                        <User size={10} /> Nhân viên
                      </span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xs">
                      {t.created_by?.charAt(0).toUpperCase()}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
