import React from 'react';
import { MessageSquare, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BookingBill } from '@/services/bookingService';
import { formatMoney } from '@/utils/format';
import { MoneyInput } from '@/components/ui/MoneyInput';

interface BillBreakdownProps {
  bill: BookingBill;
  className?: string;
  isDark?: boolean;
  hideAuditLog?: boolean;
  discount?: number;
  onDiscountChange?: (val: number) => void;
  surcharge?: number;
  onSurchargeChange?: (val: number) => void;
  hideSummary?: boolean;
  pendingServicesTotal?: number;
}

export default function BillBreakdown({ 
  bill, 
  className, 
  isDark = false, 
  hideAuditLog = false,
  hideSummary = false,
  discount,
  onDiscountChange,
  surcharge,
  onSurchargeChange,
  pendingServicesTotal = 0
}: BillBreakdownProps) {
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
    const actualType = bill.rental_type_actual || bill.rental_type;
    
    // 1. Check for explicit "x" formula (Daily/Overnight usually)
    const mainExp = bill.explanation?.find(e => e.includes('Tiền phòng') && e.includes('x'));
    if (mainExp) {
        const match = mainExp.match(/\((.*?)\)/);
        if (match) details.push(match[1]);
    } 
    else if (actualType === 'hourly') {
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
    if (details.length === 0 && (actualType === 'daily' || actualType === 'overnight')) {
         const unit = actualType === 'overnight' ? 'đêm' : 'ngày';
         // Ưu tiên lấy duration_text từ bill nếu có (ví dụ: "3 ngày")
         const duration = bill.duration_text || '1';
         details.push(`${duration} x ${formatMoney(bill.room_charge / (parseInt(duration) || 1))}`);
    }

    return details;
  };

  const roomChargeDetails = getRoomChargeExplanation();

  return (
    <div className={cn("space-y-4", className)}>
      {/* 1. Main items */}
      {!hideSummary && (
      <div className="space-y-4">
        <div className="flex flex-col">
          <div className="flex justify-between items-center">
            <div className="flex flex-col items-start gap-1">
                <span className={cn("text-sm font-black uppercase tracking-wider", labelColor)}>Tiền phòng</span>
                {roomChargeDetails.length > 0 && (
                    <span className={cn("text-sm font-bold italic text-rose-600")}>
                        {roomChargeDetails.join(', ')}
                    </span>
                )}
            </div>
            <span className={cn("font-black text-xl", isDark ? "text-white" : "text-slate-900")}>
              {formatMoney(bill.room_charge)}
            </span>
          </div>
        </div>

        {(bill.service_total > 0 || pendingServicesTotal > 0) && (
          <div className="flex flex-col">
            <div className="flex justify-between items-center">
                <div className="flex flex-row items-baseline gap-1">
                    <span className={cn("text-sm font-black uppercase tracking-wider", labelColor)}>Dịch vụ</span>
                    {pendingServicesTotal > 0 && (
                        <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 animate-pulse")}>
                            MỚI
                        </span>
                    )}
                </div>
                <span className={cn("font-black text-lg", isDark ? "text-white" : "text-slate-900")}>
                {formatMoney(bill.service_total + pendingServicesTotal)}
                </span>
            </div>
          </div>
        )}

        {(bill.surcharge_total > 0 || (bill.custom_surcharge && bill.custom_surcharge > 0)) && (
          <div className="flex flex-col">
            <div className="flex justify-between items-center">
                <span className={cn("text-sm font-black uppercase tracking-wider", labelColor)}>Phụ thu</span>
                <span className={cn("font-black text-lg", isDark ? "text-white" : "text-slate-900")}>
                {formatMoney(bill.surcharge_total)}
                </span>
            </div>
            {/* Extract Surcharge Details */}
            {bill.explanation?.filter(e => e.includes('Phụ thu') || e.includes('trả muộn') || e.includes('Vào sớm')).map((e, i) => {
                // Simplification for display
                let text = e.replace('Phụ thu: ', '').split('->')[0].trim();
                return (
                    <div key={i} className={cn("text-sm text-right mt-0.5 font-bold italic", isDark ? "text-white/80" : "text-rose-500")}>
                        {text}
                    </div>
                )
            })}
          </div>
        )}

        {(bill.service_fee_amount > 0 || bill.vat_amount > 0) && (
          <div className={cn("pt-3 border-t-2", borderColor)}>
            {bill.service_fee_amount > 0 && (
              <div className="flex justify-between items-center mb-1">
                <span className={cn("text-sm font-black uppercase tracking-wider", labelColor)}>Phí phục vụ</span>
                <span className={cn("font-black text-lg", isDark ? "text-white" : "text-slate-900")}>
                  {formatMoney(bill.service_fee_amount)}
                </span>
              </div>
            )}
            {bill.vat_amount > 0 && (
              <div className="flex justify-between items-center">
                <span className={cn("text-sm font-black uppercase tracking-wider", labelColor)}>Thuế VAT</span>
                <span className={cn("font-black text-lg", isDark ? "text-white" : "text-slate-900")}>
                  {formatMoney(bill.vat_amount)}
                </span>
              </div>
            )}
          </div>
        )}

        {isCustomerInDebt && (
          <div className={cn("pt-3 border-t-2 flex justify-between items-center", borderColor)}>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-rose-500" />
              <span className={cn("text-sm font-black uppercase tracking-wider", isDark ? "text-rose-200" : "text-rose-500")}>Nợ cũ</span>
            </div>
            <span className={cn("font-black text-lg", isDark ? "text-rose-200" : "text-rose-600")}>
              {formatMoney(Math.abs(customerBalance))}
            </span>
          </div>
        )}

        {bill.deposit_amount > 0 && (
          <div className={cn("pt-3 border-t-2 flex justify-between items-center", borderColor)}>
            <span className={cn("text-sm font-black uppercase tracking-wider", isDark ? "text-blue-300" : "text-blue-500")}>Thu trước</span>
            <span className={cn("font-black text-lg", isDark ? "text-blue-300" : "text-blue-600")}>
              -{formatMoney(bill.deposit_amount)}
            </span>
          </div>
        )}

        {(bill.custom_surcharge > 0 || surcharge !== undefined) && (
          <div className={cn("pt-3 border-t-2 flex justify-between items-center", borderColor)}>
            <span className={cn("text-sm font-black uppercase tracking-wider", labelColor)}>Phụ phí khác</span>
            {onSurchargeChange ? (
              <div className="w-40">
                <MoneyInput
                  value={surcharge ?? bill.custom_surcharge}
                  onChange={onSurchargeChange}
                  className="h-10 text-right font-black text-base border-none bg-slate-50 focus:bg-slate-100 rounded-lg px-2"
                  align="right"
                />
              </div>
            ) : (
              <span className={cn("font-black text-lg", isDark ? "text-white" : "text-slate-900")}>
                {formatMoney(surcharge ?? bill.custom_surcharge)}
              </span>
            )}
          </div>
        )}

        {(bill.discount_amount > 0 || discount !== undefined) && (
          <div className={cn("pt-3 border-t-2 flex justify-between items-center", borderColor)}>
            <span className={cn("text-sm font-black uppercase tracking-wider", isDark ? "text-rose-200" : "text-rose-500")}>Giảm giá</span>
            {onDiscountChange ? (
              <div className="w-40">
                <MoneyInput
                  value={discount ?? bill.discount_amount}
                  onChange={onDiscountChange}
                  className="h-10 font-black text-base border-none bg-rose-50 focus:bg-rose-100 rounded-lg px-2 text-rose-600"
                  align="right"
                />
              </div>
            ) : (
              <span className={cn("font-black text-lg", isDark ? "text-rose-200" : "text-rose-600")}>
                -{formatMoney(discount ?? bill.discount_amount)}
              </span>
            )}
          </div>
        )}
      </div>
      )}

      {/* 2. Audit Trail (Lá Sớ) */}
      {!hideAuditLog && bill.explanation && bill.explanation.length > 0 && (
        <div className={cn("p-5 rounded-2xl border-2 text-left", auditBg, borderColor, !hideSummary && "mt-6")}>
          <div className="flex items-center gap-2 mb-3 opacity-80">
            <MessageSquare className="w-4 h-4" />
            <span className="font-black uppercase tracking-widest text-sm">Chi tiết tính toán</span>
          </div>
          <div className="space-y-2 text-left">
            {/* Explicit Check-in Time */}
            {bill.check_in_at && (
                <div className={cn("flex gap-2 text-sm leading-relaxed italic font-bold", auditTextColor)}>
                    <span className="opacity-50 shrink-0">•</span>
                    <span>
                        Thời gian vào: {new Date(bill.check_in_at).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})} {new Date(bill.check_in_at).toLocaleDateString('vi-VN', {day: '2-digit', month:'2-digit'})}
                    </span>
                </div>
            )}
            {bill.explanation.map((line, idx) => {
              // 1. Format Full DateTime: YYYY-MM-DD HH:MM:SS... -> HH:MM DD/MM
              let formattedLine = line.replace(/(\d{4}-\d{2}-\d{2})[\sT](\d{2}:\d{2}):\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, (match, date, time) => {
                 const [y, m, d] = date.split('-');
                 return `${time} ${d}/${m}`;
              });
              
              // 2. Format Time Only: HH:MM:SS.xxxx -> HH:MM
              formattedLine = formattedLine.replace(/(\d{2}:\d{2}):\d{2}(?:\.\d+)?/g, '$1');

              // 3. Highlight important info (Money, Units, Type switches)
              const isHighlight = formattedLine.includes('vượt trần') || 
                                 formattedLine.includes('Tính thêm') || 
                                 formattedLine.includes('Chuyển sang') ||
                                 formattedLine.includes('ngày') ||
                                 formattedLine.includes('đêm');

              return (
                <div key={idx} className={cn(
                    "flex gap-2 text-sm leading-relaxed italic font-bold", 
                    isHighlight ? "text-rose-600" : auditTextColor
                )}>
                  <span className="opacity-50 shrink-0">•</span>
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
