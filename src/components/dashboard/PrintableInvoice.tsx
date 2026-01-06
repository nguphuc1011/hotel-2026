
import React from 'react';
import { Room, Booking, Service } from '@/types';
import { formatCurrency, formatDateTime } from '@/lib/utils';

interface PrintableInvoiceProps {
  room: Room;
  booking: Booking;
  services: any[];
  pricing: any;
  totalServiceCost: number;
  totalAmount: number;
}

export const PrintableInvoice = React.forwardRef<HTMLDivElement, PrintableInvoiceProps>((
  { room, booking, services, pricing, totalServiceCost, totalAmount }, 
  ref
) => {
  return (
    <div ref={ref} className="p-8 font-sans text-sm text-black bg-white">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">HÓA ĐƠN THANH TOÁN</h1>
        <p>Khách sạn ABC</p>
        <p>123 Đường XYZ, Quận 1, TP. HCM</p>
        <p>Điện thoại: 0123 456 789</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <p><span className="font-bold">Phòng:</span> {room.room_number}</p>
          <p><span className="font-bold">Khách hàng:</span> {(booking as any).customer?.full_name || (booking as any).customers?.full_name || 'Khách lẻ'}</p>
        </div>
        <div>
          <p className="text-right"><span className="font-bold">Ngày in:</span> {formatDateTime(new Date().toISOString())}</p>
          <p className="text-right"><span className="font-bold">Mã Booking:</span> #{booking.id.substring(0, 8)}</p>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-bold border-b pb-1 mb-2">Chi tiết tiền phòng</h2>
        <div className="flex justify-between">
          <p>Nhận phòng:</p>
          <p>{formatDateTime(booking.check_in_at)}</p>
        </div>
        <div className="flex justify-between">
          <p>Trả phòng:</p>
          <p>{formatDateTime(new Date().toISOString())}</p>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <p>Loại thuê:</p>
          <p>{booking.rental_type === 'hourly' ? 'Theo giờ' : booking.rental_type === 'daily' ? 'Theo ngày' : 'Qua đêm'}</p>
        </div>
        <div className="flex justify-between font-bold mt-2 pt-2 border-t">
          <p>Thành tiền phòng:</p>
          <p>{formatCurrency(pricing?.room_charge || 0)}</p>
        </div>
      </div>

      {services && services.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold border-b pb-1 mb-2">Chi tiết dịch vụ</h2>
          {services.map((s, idx) => (
            <div key={s.id || idx} className="flex justify-between">
              <p>{s.name || s.services?.name || 'Dịch vụ'} (x{s.quantity})</p>
              <p>{formatCurrency(s.total || (s.quantity * s.price))}</p>
            </div>
          ))}
          <div className="flex justify-between font-bold mt-2 border-t pt-1">
            <p>Tổng tiền dịch vụ:</p>
            <p>{formatCurrency(totalServiceCost)}</p>
          </div>
        </div>
      )}

      <div className="border-t-2 border-dashed pt-4">
        <div className="flex justify-between">
          <p>Tiền phòng + Dịch vụ:</p>
          <p>{formatCurrency((pricing?.room_charge || 0) + totalServiceCost)}</p>
        </div>
        
        <div className="flex justify-between">
          <p>Đã trả trước:</p>
          <p>-{formatCurrency(booking.deposit_amount)}</p>
        </div>
        <div className="flex justify-between text-xl font-bold mt-2">
          <p>KHÁCH CẦN TRẢ:</p>
          <p>{formatCurrency(totalAmount)}</p>
        </div>
      </div>

      <div className="text-center mt-10">
        <p>Cảm ơn quý khách và hẹn gặp lại!</p>
      </div>
    </div>
  );
});

PrintableInvoice.displayName = 'PrintableInvoice';
