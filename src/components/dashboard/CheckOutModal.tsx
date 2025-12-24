'''
'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase-client';
import { Room, Setting, Service } from '@/types';
import { calculatePrice } from '@/lib/pricing';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import { ServiceSelector } from './ServiceSelector';
import { BillSummary } from './BillSummary';
import { PaymentDetails } from './PaymentDetails';

interface CheckOutModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  room: Room;
  settings: Setting[];
  services: Service[];
  mutateRooms: () => void;
  onClose: () => void;
}

export function CheckOutModal({ isOpen, onOpenChange, room, settings, services, mutateRooms, onClose }: CheckOutModalProps) {
  const [selectedServices, setSelectedServices] = useState<any[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [surcharge, setSurcharge] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const timeRules = useMemo(() => settings.find(s => s.key === 'time_rules')?.value || {},
    [settings]
  );

  const { roomTotal, details: priceDetails } = useMemo(() => {
    if (!room.current_booking?.check_in_at) return { roomTotal: 0, details: {} };
    return calculatePrice(room, timeRules);
  }, [room, timeRules]);

  const servicesTotal = useMemo(() => 
    selectedServices.reduce((acc, s) => acc + s.price * s.quantity, 0),
    [selectedServices]
  );

  const totalAmount = roomTotal + servicesTotal + surcharge;

  useEffect(() => {
    if (isOpen) {
      setSelectedServices([]);
      setPaymentMethod('cash');
      setSurcharge(0);
      setNotes('');
    }
  }, [isOpen]);

  const handleConfirmCheckout = async () => {
    if (!room.current_booking) {
      toast.error('Không tìm thấy thông tin đặt phòng hiện tại.');
      return;
    }

    setIsSubmitting(true);
    const promise = supabase.rpc('handle_checkout', {
      p_booking_id: room.current_booking.id,
      p_room_id: room.id,
      p_total_amount: totalAmount,
      p_surcharge: surcharge,
      p_services_total: servicesTotal,
      p_room_total: roomTotal,
      p_payment_method: paymentMethod,
      p_notes: notes,
      p_used_services: selectedServices.map(s => ({ service_id: s.id, quantity: s.quantity, price: s.price }))
    });

    toast.promise(promise, {
      loading: 'Đang xử lý thanh toán...',
      success: (data: any) => {
        if (data.error) {
          throw new Error(data.error.message);
        }
        mutateRooms();
        onClose();
        return `Thanh toán phòng ${room.room_number} thành công!`
      },
      error: (err: any) => {
        console.error('Checkout RPC error:', err);
        return `Lỗi: ${err.message}`;
      },
      finally: () => {
        setIsSubmitting(false);
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Thanh toán - Phòng {room.room_number}</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Dịch vụ đã sử dụng</h3>
            <ServiceSelector 
              services={services} 
              selectedServices={selectedServices} 
              onSelectionChange={setSelectedServices} 
            />
          </div>

          <div className="space-y-6 rounded-lg bg-slate-50 p-4">
            <h3 className="font-semibold text-lg border-b pb-2">Chi tiết hóa đơn</h3>
            <BillSummary 
              priceDetails={priceDetails}
              roomTotal={roomTotal}
              servicesTotal={servicesTotal}
              surcharge={surcharge}
              totalAmount={totalAmount}
            />
            <PaymentDetails
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
              surcharge={surcharge}
              onSurchargeChange={setSurcharge}
              notes={notes}
              onNotesChange={setNotes}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button onClick={handleConfirmCheckout} disabled={isSubmitting}>
            {isSubmitting ? 'Đang xử lý...' : 'Xác nhận thanh toán'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
'''
