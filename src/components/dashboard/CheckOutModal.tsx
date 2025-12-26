'use client';

import { useState, useEffect, useMemo } from 'react';
import { useNotification } from '@/context/NotificationContext';
import { supabase } from '@/lib/supabase';
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
  const { showNotification } = useNotification();

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
      showNotification('Không tìm thấy thông tin đặt phòng hiện tại.', 'error');
      return;
    }

    setIsSubmitting(true);
    showNotification('Đang xử lý thanh toán...', 'info');

    try {
      const { data, error } = await supabase.rpc('handle_checkout', {
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

      if (error) throw error;
      
      mutateRooms();
      onClose();
      showNotification(`Thanh toán phòng ${room.room_number} thành công!`, 'success');
    } catch (err: any) {
      console.error('Checkout RPC error:', err);
      showNotification(`Lỗi: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="p-0">
        <div className="flex-1 overflow-y-auto">
          <DialogHeader className="px-6 pt-8 pb-4">
            <DialogTitle className="text-xl font-black text-zinc-900 uppercase">Thanh toán - Phòng {room.room_number}</DialogTitle>
          </DialogHeader>
          
          <div className="px-6 space-y-6 pb-40">
            <div className="space-y-4">
              <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Dịch vụ đã sử dụng</h3>
              <ServiceSelector 
                services={services} 
                selectedServices={selectedServices} 
                onChange={setSelectedServices} 
              />
            </div>

            <div className="space-y-6 rounded-[2rem] bg-slate-50 p-6 shadow-sm border border-slate-100">
              <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b pb-2">Chi tiết hóa đơn</h3>
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
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-2xl border-t border-white/20 z-10">
          <div className="flex gap-3">
            <DialogClose asChild>
              <Button variant="outline" className="flex-1 h-14 rounded-2xl font-bold text-zinc-500 border-none bg-zinc-100">Hủy</Button>
            </DialogClose>
            <Button 
              onClick={handleConfirmCheckout} 
              disabled={isSubmitting}
              className="flex-[2] h-14 rounded-2xl bg-blue-600 font-bold text-white shadow-lg shadow-blue-200"
            >
              {isSubmitting ? 'Đang xử lý...' : 'Xác nhận thanh toán'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
'''
