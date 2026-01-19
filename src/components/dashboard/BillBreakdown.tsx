import React from 'react';
import { MessageSquare, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BookingBill } from '@/services/bookingService';

interface BillBreakdownProps {
  bill: BookingBill;
  className?: string;
  isDark?: boolean;
  hideAuditLog?: boolean;
}

export default function BillBreakdown({ bill, className, isDark = false, hideAuditLog = false }: BillBreakdownProps) {
  const customerBalance = bill.customer_balance ?? 0;
  const isCustomerInDebt = customerBalance < 0;

  const textColor = isDark ? "text-blue-50" : "text-slate-600";
  const labelColor = isDark ? "text-blue-200/70" : "text-slate-400";
  const borderColor = isDark ? "border-white/10" : "border-slate-100";
  const auditBg = isDark ? "bg-white/10" : "bg-slate-50";
  const auditTextColor = isDark ? "text-blue-100" : "text-slate-500";

  // Calculate explanation text for Room Charge
  const getRoomChargeExplanation = () => {
    const details = [];
    
    // 1. Check for explicit "x" formula (Daily/Overnight usually)
    const mainExp = bill.explanation?.find(e => e.includes('Tiền phòng') && e.includes('x'));
    if (mainExp) {
        const match = mainExp.match(/\((.*?)\)/);
        if (match) details.push(match[1]);
    } 
    else if (bill.rental_type === 'hourly') {
        // 2. Hourly details
        const firstHour = bill.explanation?.find(e => e.includes('Giờ đầu tiên'));
        if (firstHour) {
             const match = firstHour.match(/\((.*?)\)/);
             if (match) details.push(`Giờ đầu: ${match[1]}`);
        }
        const extra = bill.explanation?.find(e => e.includes('Quá giờ') && e.includes('x'));
        if (extra) {
            const match = extra.match(/Tính thêm (.*?) =/);
            if (match) details.push(match[1]);
        }
    }
    
    // 3. Fallback for auto-switch or missing formula
    if (details.length === 0 && (bill.rental_type === 'daily' || bill.rental_type === 'overnight')) {
         const unit = bill.rental_type === 'overnight' ? 'đêm' : 'ngày';
         details.push(`1 ${unit} x ${bill.room_charge.toLocaleString()}đ`);
    }

    return details;
  };

  const roomChargeDetails = getRoomChargeExplanation();

  return (
    <div className={cn("space-y-3", className)}>
      {/* 1. Main items */}
      <div className="space-y-3">
        <div className="flex flex-col">
          <div className="flex justify-between items-center">
            <div className="flex flex-row flex-wrap items-baseline gap-1">
                <span className={cn("text-xs font-bold uppercase tracking-wider", labelColor)}>Tiền phòng</span>
                {roomChargeDetails.length > 0 && (
                    <span className={cn("text-xs font-medium italic", isDark ? "text-white/60" : "text-slate-400")}>
                        ({roomChargeDetails.join(', ')})
                    </span>
                )}
            </div>
            <span className={cn("font-black text-sm", isDark ? "text-white" : "text-slate-900")}>
              {bill.room_charge.toLocaleString()}đ
            </span>
          </div>
        </div>

        {bill.service_total > 0 && (
          <div className="flex flex-col">
            <div className="flex justify-between items-center">
                <span className={cn("text-xs font-bold uppercase tracking-wider", labelColor)}>Dịch vụ</span>
                <span className={cn("font-black text-sm", isDark ? "text-white" : "text-slate-900")}>
                {bill.service_total.toLocaleString()}đ
                </span>
            </div>
          </div>
        )}

        {bill.surcharge_total > 0 && (
          <div className="flex flex-col">
            <div className="flex justify-between items-center">
                <span className={cn("text-xs font-bold uppercase tracking-wider", labelColor)}>Phụ thu</span>
                <span className={cn("font-black text-sm", isDark ? "text-white" : "text-slate-900")}>
                {bill.surcharge_total.toLocaleString()}đ
                </span>
            </div>
            {/* Extract Surcharge Details */}
            {bill.explanation?.filter(e => e.includes('Phụ thu') || e.includes('trả muộn') || e.includes('Vào sớm')).map((e, i) => {
                // Simplification for display
                let text = e.replace('Phụ thu: ', '').split('->')[0].trim();
                return (
                    <div key={i} className={cn("text-xs text-right mt-0.5 font-medium italic", isDark ? "text-white/80" : "text-slate-500")}>
                        {text}
                    </div>
                )
            })}
          </div>
        )}

        {bill.custom_surcharge > 0 && (
          <div className="flex justify-between items-center">
            <span className={cn("text-xs font-bold uppercase tracking-wider", labelColor)}>Phụ phí khác</span>
            <span className={cn("font-black text-sm", isDark ? "text-white" : "text-slate-900")}>
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
      {!hideAuditLog && bill.explanation && bill.explanation.length > 0 && (
        <div className={cn("mt-4 p-4 rounded-2xl border", auditBg, borderColor)}>
          <div className="flex items-center gap-2 mb-2 opacity-60">
            <MessageSquare className="w-3 h-3" />
            <span className="font-black uppercase tracking-widest text-xs">Chi tiết tính toán (Lá sớ)</span>
          </div>
          <div className="space-y-1.5">
            {/* Explicit Check-in Time */}
            {bill.check_in_at && (
                <div className={cn("flex gap-2 text-xs leading-relaxed italic font-medium", auditTextColor)}>
                    <span className="opacity-30 shrink-0">•</span>
                    <span>
                        Thời gian vào: {new Date(bill.check_in_at).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})} {new Date(bill.check_in_at).toLocaleDateString('vi-VN', {day: '2-digit', month:'2-digit'})}
                    </span>
                </div>
            )}
            {bill.explanation.map((line, idx) => {
              // 1. Format Full DateTime: YYYY-MM-DD HH:MM:SS... -> HH:MM DD/MM
              // Note: The SQL already returns formatted strings like "HH:MM DD/MM" for key events.
              // We just need to clean up any raw timestamps if they slip through.
              let formattedLine = line.replace(/(\d{4}-\d{2}-\d{2})[\sT](\d{2}:\d{2}):\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, (match, date, time) => {
                 const [y, m, d] = date.split('-');
                 return `${time} ${d}/${m}`;
              });
              
              // 2. Format Time Only: HH:MM:SS.xxxx -> HH:MM
              formattedLine = formattedLine.replace(/(\d{2}:\d{2}):\d{2}(?:\.\d+)?/g, '$1');

              return (
                <div key={idx} className={cn("flex gap-2 text-xs leading-relaxed italic font-medium", auditTextColor)}>
                  <span className="opacity-30 shrink-0">•</span>
                  <span>{formattedLine}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
