import React from 'react';
import { MessageSquare, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BookingBill } from '@/services/bookingService';

interface BillBreakdownProps {
  bill: BookingBill;
  className?: string;
  isDark?: boolean;
}

export default function BillBreakdown({ bill, className, isDark = false }: BillBreakdownProps) {
  const customerBalance = bill.customer_balance ?? 0;
  const isCustomerInDebt = customerBalance < 0;

  const textColor = isDark ? "text-blue-50" : "text-slate-600";
  const labelColor = isDark ? "text-blue-200/70" : "text-slate-400";
  const borderColor = isDark ? "border-white/10" : "border-slate-100";
  const auditBg = isDark ? "bg-white/10" : "bg-slate-50";
  const auditTextColor = isDark ? "text-blue-100" : "text-slate-500";

  return (
    <div className={cn("space-y-3", className)}>
      {/* 1. Main items */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className={cn("text-xs font-bold uppercase tracking-wider", labelColor)}>Tiền phòng</span>
          <span className={cn("font-black", isDark ? "text-white" : "text-slate-900")}>
            {bill.room_charge.toLocaleString()}đ
          </span>
        </div>

        {bill.service_total > 0 && (
          <div className="flex justify-between items-center">
            <span className={cn("text-xs font-bold uppercase tracking-wider", labelColor)}>Dịch vụ</span>
            <span className={cn("font-black", isDark ? "text-white" : "text-slate-900")}>
              {bill.service_total.toLocaleString()}đ
            </span>
          </div>
        )}

        {bill.surcharge_total > 0 && (
          <div className="flex justify-between items-center">
            <span className={cn("text-xs font-bold uppercase tracking-wider", labelColor)}>Phụ thu</span>
            <span className={cn("font-black", isDark ? "text-white" : "text-slate-900")}>
              {bill.surcharge_total.toLocaleString()}đ
            </span>
          </div>
        )}

        {bill.custom_surcharge > 0 && (
          <div className="flex justify-between items-center">
            <span className={cn("text-xs font-bold uppercase tracking-wider", labelColor)}>Phụ phí khác</span>
            <span className={cn("font-black", isDark ? "text-white" : "text-slate-900")}>
              {bill.custom_surcharge.toLocaleString()}đ
            </span>
          </div>
        )}

        {(bill.service_fee_amount > 0 || bill.vat_amount > 0) && (
          <div className={cn("pt-2 border-t", borderColor)}>
            {bill.service_fee_amount > 0 && (
              <div className="flex justify-between items-center mb-1">
                <span className={cn("text-xs font-bold uppercase tracking-wider", labelColor)}>Phí phục vụ</span>
                <span className={cn("font-black", isDark ? "text-white" : "text-slate-900")}>
                  {bill.service_fee_amount.toLocaleString()}đ
                </span>
              </div>
            )}
            {bill.vat_amount > 0 && (
              <div className="flex justify-between items-center">
                <span className={cn("text-xs font-bold uppercase tracking-wider", labelColor)}>Thuế VAT</span>
                <span className={cn("font-black", isDark ? "text-white" : "text-slate-900")}>
                  {bill.vat_amount.toLocaleString()}đ
                </span>
              </div>
            )}
          </div>
        )}

        {isCustomerInDebt && (
          <div className={cn("pt-2 border-t flex justify-between items-center", borderColor)}>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3 text-rose-500" />
              <span className={cn("text-xs font-bold uppercase tracking-wider", isDark ? "text-rose-200" : "text-rose-500")}>Nợ cũ</span>
            </div>
            <span className={cn("font-black", isDark ? "text-rose-200" : "text-rose-600")}>
              {Math.abs(customerBalance).toLocaleString()}đ
            </span>
          </div>
        )}

        {bill.discount_amount > 0 && (
          <div className={cn("pt-2 border-t flex justify-between items-center", borderColor)}>
            <span className={cn("text-xs font-bold uppercase tracking-wider", isDark ? "text-rose-200" : "text-rose-500")}>Giảm giá</span>
            <span className={cn("font-black", isDark ? "text-rose-200" : "text-rose-600")}>
              -{bill.discount_amount.toLocaleString()}đ
            </span>
          </div>
        )}

        {bill.deposit_amount > 0 && (
          <div className={cn("pt-2 border-t flex justify-between items-center", borderColor)}>
            <span className={cn("text-xs font-bold uppercase tracking-wider", isDark ? "text-blue-300" : "text-blue-500")}>Đã cọc</span>
            <span className={cn("font-black", isDark ? "text-blue-300" : "text-blue-600")}>
              -{bill.deposit_amount.toLocaleString()}đ
            </span>
          </div>
        )}
      </div>

      {/* 2. Audit Trail (Lá Sớ) */}
      {bill.explanation && bill.explanation.length > 0 && (
        <div className={cn("mt-4 p-4 rounded-2xl border", auditBg, borderColor)}>
          <div className="flex items-center gap-2 mb-2 opacity-60">
            <MessageSquare className="w-3 h-3" />
            <span className="font-black uppercase tracking-widest text-[9px]">Chi tiết tính toán (Lá sớ)</span>
          </div>
          <div className="space-y-1.5">
            {bill.explanation.map((line, idx) => (
              <div key={idx} className={cn("flex gap-2 text-[11px] leading-relaxed italic font-medium", auditTextColor)}>
                <span className="opacity-30 shrink-0">•</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
