import React from 'react';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';

interface PrintableDebtReceiptProps {
  customerName: string;
  amount: number;
  paymentMethod: string;
  note?: string;
  transactionId: string;
  transactionDate: string;
  cashierName?: string;
}

export const PrintableDebtReceipt = React.forwardRef<HTMLDivElement, PrintableDebtReceiptProps>((
  { customerName, amount, paymentMethod, note, transactionId, transactionDate, cashierName },
  ref
) => {
  return (
    <div ref={ref} className="p-8 font-sans text-sm text-black bg-white">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold uppercase">Biên lai thu nợ</h1>
        <p className="font-bold">Khách sạn ABC</p>
        <p>123 Đường XYZ, Quận 1, TP. HCM</p>
      </div>

      <div className="mb-6 border-b pb-4">
        <div className="flex justify-between mb-2">
          <span className="font-bold">Mã giao dịch:</span>
          <span className="font-mono">{transactionId.substring(0, 8).toUpperCase()}</span>
        </div>
        <div className="flex justify-between mb-2">
          <span className="font-bold">Ngày giờ:</span>
          <span>{format(new Date(transactionDate), 'HH:mm dd/MM/yyyy')}</span>
        </div>
        <div className="flex justify-between mb-2">
           <span className="font-bold">Thu ngân:</span>
           <span>{cashierName || 'Nhân viên'}</span>
        </div>
      </div>

      <div className="py-4 mb-6">
        <div className="flex justify-between mb-2">
          <span className="font-bold">Khách hàng:</span>
          <span className="uppercase">{customerName}</span>
        </div>
        <div className="flex justify-between mb-2">
          <span className="font-bold">Hình thức thanh toán:</span>
          <span className="capitalize">{paymentMethod === 'bank_transfer' ? 'Chuyển khoản' : paymentMethod === 'card' ? 'Thẻ' : 'Tiền mặt'}</span>
        </div>
        {note && (
           <div className="flex justify-between mb-2">
             <span className="font-bold">Ghi chú:</span>
             <span>{note}</span>
           </div>
        )}
      </div>

      <div className="text-center mb-8 bg-slate-50 py-4 rounded-xl border border-slate-100">
        <p className="text-slate-500 mb-1 text-xs uppercase tracking-wider">Số tiền thanh toán</p>
        <p className="text-3xl font-black">{formatCurrency(amount)}</p>
      </div>

      <div className="grid grid-cols-2 gap-8 text-center mt-12">
        <div>
          <p className="font-bold mb-16">Người nộp tiền</p>
          <p className="text-xs italic">(Ký, họ tên)</p>
        </div>
        <div>
          <p className="font-bold mb-16">Người thu tiền</p>
          <p className="font-bold">{cashierName || 'Nhân viên'}</p>
        </div>
      </div>
      
      <div className="text-center mt-12 text-xs text-slate-400 italic">
        <p>Cảm ơn quý khách!</p>
      </div>
    </div>
  );
});

PrintableDebtReceipt.displayName = 'PrintableDebtReceipt';
