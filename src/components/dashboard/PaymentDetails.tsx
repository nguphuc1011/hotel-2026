'''
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

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
  return (
    <div className="space-y-4 pt-4 border-t">
      <h4 className="font-semibold">Hình thức thanh toán</h4>
      <RadioGroup value={paymentMethod} onValueChange={onPaymentMethodChange} className="flex gap-4">
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="cash" id="cash" />
          <Label htmlFor="cash">Tiền mặt</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="card" id="card" />
          <Label htmlFor="card">Thẻ</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="transfer" id="transfer" />
          <Label htmlFor="transfer">Chuyển khoản</Label>
        </div>
      </RadioGroup>

      <div className="space-y-2">
        <Label htmlFor="surcharge">Phụ phí (nếu có)</Label>
        <Input 
          id="surcharge"
          type="number"
          value={surcharge}
          onChange={(e) => onSurchargeChange(Number(e.target.value))}
          placeholder="0"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Ghi chú</Label>
        <Textarea 
          id="notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Thông tin thêm về hóa đơn..."
        />
      </div>
    </div>
  );
}
'''
