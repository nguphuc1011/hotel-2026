import React, { useState, useEffect } from 'react';
import { ArrowDownToLine, X } from 'lucide-react';
import { Service } from '@/services/serviceService';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';

interface InventoryImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: Service | null;
  onConfirm: (data: { quantity: number; cost: number; notes: string; mode: 'buy_unit' | 'sell_unit' }) => void;
}

export default function InventoryImportModal({
  isOpen,
  onClose,
  service,
  onConfirm
}: InventoryImportModalProps) {
  const [importMode, setImportMode] = useState<'buy_unit' | 'sell_unit'>('buy_unit');
  const [form, setForm] = useState({
    quantity: 0,
    cost: 0,
    notes: ''
  });

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setImportMode('buy_unit');
      setForm({ quantity: 0, cost: 0, notes: '' });
    }
  }, [isOpen]);

  if (!isOpen || !service) return null;

  const handleSubmit = () => {
    if (form.quantity <= 0) return;
    onConfirm({
      quantity: form.quantity,
      cost: form.cost,
      notes: form.notes,
      mode: importMode
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm">
              <ArrowDownToLine className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-emerald-950">Nhập kho</h3>
              <p className="text-sm font-bold text-emerald-600/80 uppercase tracking-wider">{service.name}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-12 h-12 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="p-8 space-y-8">
          {/* Unit Selector */}
          {service.unit_buy && service.unit_sell && service.unit_buy !== service.unit_sell && (
            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
              <button
                onClick={() => setImportMode('buy_unit')}
                className={cn(
                  "flex-1 py-3 rounded-xl text-sm font-black transition-all",
                  importMode === 'buy_unit' ? "bg-white shadow-md text-emerald-600" : "text-slate-400 hover:text-slate-600"
                )}
              >
                Theo {service.unit_buy}
              </button>
              <button
                onClick={() => setImportMode('sell_unit')}
                className={cn(
                  "flex-1 py-3 rounded-xl text-sm font-black transition-all",
                  importMode === 'sell_unit' ? "bg-white shadow-md text-emerald-600" : "text-slate-400 hover:text-slate-600"
                )}
              >
                Theo {service.unit_sell}
              </button>
            </div>
          )}

          <div className="space-y-6">
            {/* Quantity */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1">Số lượng nhập</label>
              <div className="relative">
                <input 
                  autoFocus
                  type="number" 
                  value={form.quantity || ''}
                  onChange={(e) => setForm({...form, quantity: Number(e.target.value)})}
                  className="w-full px-6 py-5 rounded-[24px] bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none font-black text-3xl text-emerald-600 transition-all placeholder:text-slate-200"
                  placeholder="0"
                />
                <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col items-end pointer-events-none">
                  <span className="text-sm font-black text-slate-400 uppercase">
                    {importMode === 'buy_unit' ? service.unit_buy : service.unit_sell}
                  </span>
                  {importMode === 'buy_unit' && service.conversion_factor && service.conversion_factor > 1 && (
                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full mt-1">
                      = {((form.quantity || 0) * (service.conversion_factor || 1)).toLocaleString('vi-VN')} {service.unit_sell}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Total Cost */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1">Tổng tiền thanh toán (VNĐ)</label>
              <div className="relative">
                <input 
                  type="number" 
                  value={form.cost || ''}
                  onChange={(e) => setForm({...form, cost: Number(e.target.value)})}
                  className="w-full px-6 py-5 rounded-[24px] bg-slate-50 border-2 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none font-black text-2xl text-blue-600 transition-all placeholder:text-slate-200"
                  placeholder="0"
                />
                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none">
                  <span className="text-sm font-black text-slate-400">VNĐ</span>
                </div>
              </div>
              {form.quantity > 0 && form.cost > 0 && (
                <div className="flex justify-between items-center px-2">
                  <span className="text-xs font-bold text-slate-400 italic">Giá vốn dự kiến:</span>
                  <span className="text-sm font-black text-slate-600">
                    {formatMoney(form.cost / (importMode === 'buy_unit' ? (form.quantity * (service.conversion_factor || 1)) : form.quantity))} / {service.unit_sell}
                  </span>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-1">Ghi chú nhập hàng</label>
              <input 
                type="text" 
                value={form.notes}
                onChange={(e) => setForm({...form, notes: e.target.value})}
                className="w-full px-6 py-4 rounded-2xl bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none font-bold text-slate-600 transition-all placeholder:text-slate-300"
                placeholder="Tên nhà cung cấp, lý do..."
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl font-black text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-all active:scale-95"
          >
            HỦY BỎ
          </button>
          <button 
            onClick={handleSubmit}
            disabled={form.quantity <= 0}
            className="flex-[2] py-4 rounded-2xl font-black text-white bg-emerald-500 hover:bg-emerald-600 shadow-xl shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
          >
            XÁC NHẬN NHẬP
          </button>
        </div>
      </div>
    </div>
  );
}
