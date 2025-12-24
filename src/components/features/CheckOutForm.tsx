'use client';

import { Room } from "@/types";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Clock, List, DollarSign, ShoppingCart } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface CheckOutFormProps {
  room: Room;
  onCheckoutSuccess: () => void;
}

interface CheckoutDetails {
  check_in_at: string;
  duration_string: string;
  room_charge: number;
  service_charges: {
    name: string;
    quantity: number;
    price: number;
    total: number;
  }[];
  total_amount: number;
}

export function CheckOutForm({ room, onCheckoutSuccess }: CheckOutFormProps) {
  const [details, setDetails] = useState<CheckoutDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  useEffect(() => {
    if (!room.current_booking_id) {
      toast.error("Lỗi: Không tìm thấy mã đặt phòng.");
      setIsLoading(false);
      return;
    }

    const fetchDetails = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_checkout_details', { p_booking_id: room.current_booking_id });
        if (error) throw error;
        setDetails(data);
      } catch (error: any) {
        console.error("Error fetching checkout details:", error);
        toast.error("Không thể lấy chi tiết hóa đơn: " + error.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [room.current_booking_id]);

  const handleCheckout = async () => {
    if (!room.current_booking_id) {
      toast.error("Lỗi: Không tìm thấy mã đặt phòng để thanh toán.");
      return;
    }
    setIsCheckingOut(true);
    try {
      const { error } = await supabase.rpc('handle_checkout', { p_booking_id: room.current_booking_id });
      if (error) throw error;
      
      toast.success(`Phòng ${room.room_number} đã được thanh toán thành công!`)
      onCheckoutSuccess();

    } catch (error: any) {
      console.error("Checkout error:", error);
      toast.error("Lỗi khi thanh toán: " + error.message);
    } finally {
      setIsCheckingOut(false);
    }
  }

  if (isLoading) {
    return <CheckOutSkeleton />;
  }

  if (!details) {
    return <div className="text-center text-red-500">Không thể tải được chi tiết hóa đơn. Vui lòng thử lại.</div>;
  }

  return (
    <div className="flex flex-col gap-6 pt-2">
      {/* Time Details */}
      <div className="flex items-center gap-4 rounded-lg bg-slate-50 p-4">
        <Clock className="h-8 w-8 text-slate-500" />
        <div>
          <p className="font-semibold text-slate-800">Chi tiết thời gian</p>
          <p className="text-sm text-slate-500">
            Nhận phòng lúc {new Date(details.check_in_at).toLocaleTimeString('vi-VN')} - {new Date(details.check_in_at).toLocaleDateString('vi-VN')}
          </p>
          <p className="text-sm text-slate-500">Thời gian ở: <span className="font-medium text-slate-700">{details.duration_string}</span></p>
        </div>
      </div>

      {/* Bill Details */}
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2"><List className="h-5 w-5"/> Chi tiết hóa đơn</h3>
        <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
          <div className="flex justify-between">
            <span>Tiền phòng ({room.status})</span>
            <span className="font-medium">{new Intl.NumberFormat('vi-VN').format(details.room_charge)}</span>
          </div>
          {details.service_charges.length > 0 && (
            <>
              <Separator />
              <p className="font-medium text-sm pt-1 flex items-center gap-1.5"><ShoppingCart className="h-4 w-4"/> Dịch vụ đã dùng:</p>
              {details.service_charges.map(item => (
                <div key={item.name} className="flex justify-between text-sm text-slate-600 pl-4">
                  <span>{item.name} <span className="text-slate-400">x{item.quantity}</span></span>
                  <span>{new Intl.NumberFormat('vi-VN').format(item.total)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Total */}
      <div className="rounded-lg bg-blue-50 p-4">
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-blue-900 flex items-center gap-2"><DollarSign className="h-6 w-6"/> TỔNG CỘNG</span>
          <span className="text-2xl font-bold text-blue-900">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(details.total_amount)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={() => onCheckoutSuccess()} disabled={isCheckingOut}>Hủy</Button>
        <Button onClick={handleCheckout} disabled={isCheckingOut || isLoading}>
          {isCheckingOut ? "Đang xử lý..." : "Xác nhận Thanh toán"}
        </Button>
      </div>
    </div>
  );
}

const CheckOutSkeleton = () => (
  <div className="flex flex-col gap-6 pt-2 animate-pulse">
    <div className="flex items-center gap-4 rounded-lg bg-slate-100 p-4">
      <div className="h-8 w-8 rounded-full bg-slate-200"></div>
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 rounded bg-slate-200"></div>
        <div className="h-3 w-1/2 rounded bg-slate-200"></div>
      </div>
    </div>
    <div className="space-y-3">
      <div className="h-5 w-1/3 rounded bg-slate-200"></div>
      <div className="space-y-2 rounded-md border border-slate-200 p-3">
        <div className="flex justify-between"><div className="h-4 w-1/4 rounded bg-slate-200"></div><div className="h-4 w-1/4 rounded bg-slate-200"></div></div>
        <div className="flex justify-between"><div className="h-4 w-1/3 rounded bg-slate-200"></div><div className="h-4 w-1/4 rounded bg-slate-200"></div></div>
      </div>
    </div>
    <div className="rounded-lg bg-slate-100 p-4">
      <div className="flex justify-between items-center">
        <div className="h-6 w-1/3 rounded bg-slate-200"></div>
        <div className="h-8 w-1/3 rounded bg-slate-200"></div>
      </div>
    </div>
     <div className="flex justify-end gap-3 pt-2">
        <div className="h-10 w-20 rounded-md bg-slate-200"></div>
        <div className="h-10 w-32 rounded-md bg-slate-200"></div>
      </div>
  </div>
)
