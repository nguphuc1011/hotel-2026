import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { formatInputCurrency, parseCurrency } from "@/lib/utils";
import { useState, useEffect } from "react";

interface PaymentDetailsProps {
  paymentMethod: string;
  onPaymentMethodChange: (method: string) => void;
  surcharge: number;
  onSurchargeChange: (value: number) => void;
  notes: string;
  onNotesChange: (value: string) => void;
}

export function PaymentDetails({ 
  paymentMethod, onPaymentMethodChange, 
  surcharge, onSurchargeChange, 
  notes, onNotesChange 
}: PaymentDetailsProps) {
  const [displaySurcharge, setDisplaySurcharge] = useState(formatInputCurrency(surcharge.toString()));

  useEffect(() => {
    setDisplaySurcharge(formatInputCurrency(surcharge.toString()));
  }, [surcharge]);

  return (
    <div className="space-y-4 pt-4 border-t">
      <h4 className="font-semibold text-slate-800">Hình thức thanh toán</h4>
      <RadioGroup value={paymentMethod} onValueChange={onPaymentMethodChange} className="flex gap-4">
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="cash" id="cash" />
          <Label htmlFor="cash" className="font-bold text-slate-600">Tiền mặt</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="card" id="card" />
          <Label htmlFor="card" className="font-bold text-slate-600">Thẻ</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="transfer" id="transfer" />
          <Label htmlFor="transfer" className="font-bold text-slate-600">Chuyển khoản</Label>
        </div>
      </RadioGroup>

      <div className="space-y-2">
        <Label htmlFor="surcharge" className="text-xs font-black uppercase tracking-wider text-slate-400">Phụ phí (nếu có)</Label>
        <div className="relative">
          <Input 
            id="surcharge"
            type="text"
            value={displaySurcharge}
            onChange={(e) => {
              const formatted = formatInputCurrency(e.target.value);
              setDisplaySurcharge(formatted);
              onSurchargeChange(parseCurrency(formatted));
            }}
            placeholder="0"
            className="h-14 rounded-2xl bg-slate-50 border-none px-4 text-base font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes" className="text-xs font-black uppercase tracking-wider text-slate-400">Ghi chú</Label>
        <Textarea 
          id="notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Thông tin thêm về hóa đơn..."
          className="rounded-2xl bg-slate-50 border-none p-4 text-base font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 transition-all min-h-[100px]"
        />
      </div>
    </div>
  );
}
