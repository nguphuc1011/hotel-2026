'use client';

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  ShoppingCart, 
  Search, 
  Plus, 
  Minus, 
  Package, 
  Wallet, 
  X,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import { Service } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useNotification } from '@/context/NotificationContext';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

interface QuickSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  services: Service[];
}

export function QuickSaleModal({ isOpen, onClose, services }: QuickSaleModalProps) {
  const [tempServices, setTempServices] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const { showNotification } = useNotification();
  const { profile } = useAuth();

  const filteredServices = useMemo(() => {
    return services.filter(s => 
      s.is_active && 
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [services, searchQuery]);

  const selectedItems = useMemo(() => {
    return Object.entries(tempServices)
      .filter(([_, qty]) => qty > 0)
      .map(([id, qty]) => {
        const service = services.find(s => s.id === id);
        return {
          ...service,
          quantity: qty,
          total: (service?.price || 0) * qty
        };
      });
  }, [tempServices, services]);

  const totalAmount = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + (item.total || 0), 0);
  }, [selectedItems]);

  const handleQuantityChange = (id: string, delta: number) => {
    setTempServices(prev => ({
      ...prev,
      [id]: Math.max(0, (prev[id] || 0) + delta)
    }));
  };

  const handleReset = () => {
    setTempServices({});
    setSearchQuery('');
    setPaymentMethod('cash');
  };

  const handleQuickSale = async () => {
    if (selectedItems.length === 0 || isProcessing) return;

    setIsProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Chưa đăng nhập');

      // 1. Ghi nhận doanh thu vào cashflow
      const { error: cashflowError } = await supabase
        .from('cashflow')
        .insert({
          amount: totalAmount,
          type: 'income',
          category: 'Bán lẻ',
          payment_method: paymentMethod,
          description: `Bán lẻ tại quầy: ${selectedItems.map(i => `${i.name} (x${i.quantity})`).join(', ')}`,
          staff_id: user.id
        });

      if (cashflowError) throw cashflowError;

      // 2. Trừ kho và ghi log cho từng món
      for (const item of selectedItems) {
        // Trừ kho
        const { error: stockError } = await supabase
          .from('services')
          .update({ stock: (item.stock || 0) - item.quantity })
          .eq('id', item.id);

        if (stockError) throw stockError;

        // Ghi log kho
        await supabase.from('stock_history').insert({
          service_id: item.id,
          action_type: 'EXPORT',
          quantity: item.quantity,
          details: {
            reason: 'Bán lẻ tại quầy',
            payment_method: paymentMethod,
            staff_name: profile?.full_name || 'Nhân viên'
          }
        });
      }

      showNotification(`Đã tất toán ${formatCurrency(totalAmount)} thành công!`, 'success');
      handleReset();
      onClose();
    } catch (error: any) {
      console.error('Quick sale error:', error);
      showNotification(`Lỗi khi bán lẻ: ${error.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[85vh] p-0 overflow-hidden bg-slate-50 border-none rounded-[2.5rem] shadow-2xl flex flex-col">
        <DialogHeader className="p-8 bg-white border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                <ShoppingCart className="text-blue-600" /> Bán lẻ tại quầy
              </DialogTitle>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Xuất kho & Thu tiền trực tiếp</p>
            </div>
            <Button variant="ghost" onClick={onClose} className="rounded-full w-10 h-10 p-0 hover:bg-slate-100">
              <X size={20} className="text-slate-400" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: Service Selection */}
          <div className="flex-1 flex flex-col p-6 space-y-6 overflow-hidden">
            <div className="relative flex-shrink-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Tìm kiếm hàng hóa (mì gói, nước suối...)"
                className="w-full pl-12 pr-4 py-4 bg-white border-none rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500/20 outline-none font-medium text-slate-700"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-2 gap-4">
              {filteredServices.map((service) => (
                <div 
                  key={service.id}
                  className={cn(
                    "p-4 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between h-32",
                    tempServices[service.id] > 0 
                      ? "bg-blue-50 border-blue-200 shadow-md" 
                      : "bg-white border-slate-100 hover:border-blue-200 hover:shadow-sm"
                  )}
                  onClick={() => handleQuantityChange(service.id, 1)}
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h4 className="font-black text-slate-800 text-sm uppercase leading-tight line-clamp-2">{service.name}</h4>
                      <p className="text-blue-600 font-black text-xs">{formatCurrency(service.price)}</p>
                    </div>
                    {tempServices[service.id] > 0 && (
                      <div className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black animate-in zoom-in">
                        {tempServices[service.id]}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Tồn: {service.stock || 0}</span>
                    {tempServices[service.id] > 0 && (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={() => handleQuantityChange(service.id, -1)}
                          className="w-6 h-6 rounded-lg bg-white border border-blue-200 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors"
                        >
                          <Minus size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Checkout Summary */}
          <div className="w-80 bg-white border-l border-slate-100 p-8 flex flex-col flex-shrink-0">
            <div className="flex-1 flex flex-col space-y-8 overflow-hidden">
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Giỏ hàng</h3>
                <div className="space-y-3 overflow-y-auto max-h-[35vh] pr-2">
                  <AnimatePresence mode="popLayout">
                    {selectedItems.map((item) => (
                      <motion.div 
                        layout
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        key={item.id} 
                        className="flex items-center justify-between group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-slate-700 truncate uppercase">{item.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">x{item.quantity} • {formatCurrency(item.price)}</p>
                        </div>
                        <p className="text-xs font-black text-slate-900 shrink-0 ml-4">{formatCurrency(item.total)}</p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {selectedItems.length === 0 && (
                    <div className="py-12 text-center space-y-3">
                      <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto">
                        <Package className="text-slate-200" size={24} />
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Trống rỗng...</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Thanh toán</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPaymentMethod('cash')}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all",
                      paymentMethod === 'cash' 
                        ? "bg-emerald-50 border-emerald-200 text-emerald-600 shadow-sm" 
                        : "bg-white border-slate-100 text-slate-400 hover:bg-slate-50"
                    )}
                  >
                    <Wallet size={20} />
                    <span className="text-[10px] font-black uppercase">Tiền mặt</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('transfer')}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all",
                      paymentMethod === 'transfer' 
                        ? "bg-blue-50 border-blue-200 text-blue-600 shadow-sm" 
                        : "bg-white border-slate-100 text-slate-400 hover:bg-slate-50"
                    )}
                  >
                    <ArrowRight size={20} />
                    <span className="text-[10px] font-black uppercase">Chuyển khoản</span>
                  </button>
                </div>
              </div>

              <div className="mt-auto space-y-4 pt-6 border-t border-slate-100">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tổng tiền</span>
                  <span className="text-3xl font-black text-slate-900 tracking-tight">{formatCurrency(totalAmount)}</span>
                </div>
                <Button 
                  className="w-full h-16 rounded-[1.5rem] bg-slate-900 hover:bg-black text-white font-black uppercase tracking-widest text-sm shadow-xl shadow-slate-200 flex items-center justify-center gap-3 disabled:opacity-50"
                  onClick={handleQuickSale}
                  disabled={selectedItems.length === 0 || isProcessing}
                >
                  {isProcessing ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Đang xử lý...</span>
                    </div>
                  ) : (
                    <>
                      <CheckCircle2 size={20} />
                      Tất toán ngay
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
