'''
import { PriceDetails } from "@/lib/pricing";
import { formatCurrency } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BillSummaryProps {
  priceDetails: PriceDetails | null;
  roomTotal: number;
  servicesTotal: number;
  surcharge: number;
  totalAmount: number;
}

export function BillSummary({ priceDetails, roomTotal, servicesTotal, surcharge, totalAmount }: BillSummaryProps) {
  return (
    <div className="space-y-2 text-sm">
      <h4 className="font-semibold mb-2">Tiền phòng</h4>
      <ScrollArea className="h-24 pr-3">
        {priceDetails?.breakdown.map((item, index) => (
          <div key={index} className="flex justify-between items-center mb-1">
            <span className="text-slate-600">{item.label}</span>
            <span className="font-medium">{formatCurrency(item.price)}</span>
          </div>
        ))}
      </ScrollArea>
      <Separator />
      <div className="flex justify-between items-center font-semibold">
        <span>Tổng tiền phòng</span>
        <span>{formatCurrency(roomTotal)}</span>
      </div>

      <Separator className="my-4"/>

      <div className="flex justify-between items-center">
        <span className="text-slate-600">Tiền dịch vụ</span>
        <span className="font-medium">{formatCurrency(servicesTotal)}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-slate-600">Phụ phí</span>
        <span className="font-medium">{formatCurrency(surcharge)}</span>
      </div>
      
      <Separator />

      <div className="flex justify-between items-center text-base font-bold pt-2">
        <span>TỔNG CỘNG</span>
        <span className="text-blue-600">{formatCurrency(totalAmount)}</span>
      </div>
    </div>
  );
}
'''
