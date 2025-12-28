'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Room, Service, Customer, TimeRules, CheckInData } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MoreHorizontal, User, Smartphone, CreditCard, Clock, Settings, FileText, Calendar, Scan, AlertTriangle } from 'lucide-react';
import { suggestRentalType } from '@/lib/pricing';
import { ServiceSelector } from './ServiceSelector';
import { NumericInput } from '@/components/ui/NumericInput';
import CCCDScanner from '@/app/settings/customers/_components/CCCDScanner';
import { toast } from 'sonner';

interface CheckInModalProps {
  room: Room | null;
  services: Service[];
  customers: Customer[];
  timeRules: TimeRules;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: CheckInData) => void;
}

export function CheckInModal({ room, services, customers, timeRules, isOpen, onClose, onConfirm }: CheckInModalProps) {
  const [customer, setCustomer] = useState({ name: '', phone: '', idCard: '', address: '' });
  const [rentalType, setRentalType] = useState('hourly');

  // Suggest rental type on mount/room change
  useEffect(() => {
    if (isOpen && room) {
      const suggestion = suggestRentalType(new Date(), timeRules);
      // Nếu đề xuất bán đêm nhưng phòng không cho phép -> đổi sang hourly
      if (suggestion === 'overnight' && !room.enable_overnight) {
        setRentalType('hourly');
      } else {
        setRentalType(suggestion);
      }
    }
  }, [isOpen, room, timeRules]);
  const [price, setPrice] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [servicesUsed, setServicesUsed] = useState<Array<{ service_id: string; quantity: number; price: number }>>([]);
  const [note, setNote] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const handleScanComplete = (data: { fullName: string; idNumber: string; dob: string; address: string }) => {
    // Fill form
    setCustomer(prev => ({
      ...prev,
      name: data.fullName !== 'Không nhận diện được' ? data.fullName : prev.name,
      idCard: data.idNumber !== 'Không nhận diện được' ? data.idNumber : prev.idCard,
      address: data.address !== 'Không nhận diện được' ? data.address : prev.address,
    }));
    
    // Check blacklist logic "Tháo"
    const isBlacklisted = customers.some(c => 
      (c.id_card === data.idNumber && c.id_card !== 'Không nhận diện được') || 
      (c.full_name.toLowerCase() === data.fullName.toLowerCase() && c.notes?.toLowerCase().includes('black-list'))
    );

    if (isBlacklisted) {
      toast.error('Tháo phát hiện khách này cần lưu tâm!', {
        description: 'Khách hàng này nằm trong danh sách đen hoặc có lịch sử không tốt.',
        duration: 5000,
        icon: <AlertTriangle className="text-red-500" />,
      });
    } else {
      toast.success('Đã nhận diện thông tin CCCD');
    }
  };

  // Synchronize numeric price when room or rentalType changes
  useEffect(() => {
    if (isOpen && room && room.prices) {
      const priceForType = room.prices[rentalType as keyof typeof room.prices];
      if (typeof priceForType === 'number' && priceForType > 0) {
        setPrice(priceForType);
      } else if (typeof priceForType === 'number' && priceForType === 0) {
        // Fallback to room's default hourly if specific type is 0 (unlikely but possible)
        setPrice(room.prices.hourly || 0);
      }
    }
  }, [isOpen, room, rentalType]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setCustomer({ name: '', phone: '', idCard: '', address: '' });
      setPrice(0);
      setDeposit(0);
      setServicesUsed([]);
      setNote('');
    }
  }, [isOpen]);

  const filteredCustomers = useMemo(() => {
    const term = customer.name.toLowerCase();
    if (!term || !isFocused) return [];
    
    const removeDau = (str: string) => {
      return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    };
    
    const searchStr = removeDau(term);
    return customers.filter((c: Customer) => {
      const fullName = c.full_name || '';
      const phone = c.phone || '';
      const idCard = c.id_card || '';
      
      return removeDau(fullName).includes(searchStr) ||
             phone.includes(term) ||
             idCard.includes(term);
    }).slice(0, 5);
  }, [customer.name, customers, isFocused]);

  const handleSelectCustomer = (selected: Customer) => {
    setCustomer({
      name: selected.full_name,
      phone: selected.phone,
      idCard: selected.id_card || '',
      address: selected.address || ''
    });
    setIsFocused(false);
  };

  const handleConfirm = () => {
    const checkInData = {
      room_id: room?.id,
      customer: {
        name: customer.name,
        phone: customer.phone,
        idCard: customer.idCard,
        address: customer.address,
      },
      rentalType: rentalType,
      price: price,
      deposit: deposit,
      services: servicesUsed,
      notes: note,
    };
    onConfirm(checkInData);
  };

  const rentalTypes = useMemo(() => {
    const types = [
      { id: 'hourly', label: 'THEO GIỜ', icon: <Clock size={20} /> },
      { id: 'daily', label: 'THEO NGÀY', icon: <Calendar size={20} /> },
      { id: 'overnight', label: 'QUA ĐÊM', icon: <Clock size={20} className="rotate-180" /> }
    ];
    
    if (room && !room.enable_overnight) {
      return types.filter(t => t.id !== 'overnight');
    }
    return types;
  }, [room]);

  const activeIndex = rentalTypes.findIndex(t => t.id === rentalType);
  const serviceTotal = servicesUsed.reduce((sum, s) => sum + (s.price * s.quantity), 0);
  const totalAmount = price + serviceTotal;

  return (
    <>
      <AnimatePresence mode="wait">
        {isOpen && room && (
          <div key="checkin-modal-root" className="fixed inset-0 z-[9999] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 40, stiffness: 400 }}
            className="relative w-full h-full bg-slate-50 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <header className="sticky top-0 bg-white border-b border-slate-100 pt-4 pb-4 px-4 z-10 flex items-center justify-center relative min-h-[80px]">
              <button 
                onClick={onClose} 
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center hover:bg-slate-100 transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
              <div className="text-center">
                <h2 className="font-black text-2xl text-slate-800 uppercase tracking-tight">Nhận phòng</h2>
                <p className="text-slate-400 font-bold text-[10px] tracking-[0.2em] uppercase mt-1">
                  Phòng {room.room_number}
                </p>
              </div>
            </header>

            {/* Scrollable Content */}
            <main className="flex-1 overflow-y-auto space-y-8 p-6 pb-40 scrollbar-hide">
            
            {/* Customer Inputs */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center gap-3 text-white font-black uppercase tracking-wider shadow-lg shadow-blue-200 hover:shadow-blue-300 hover:scale-[1.02] active:scale-[0.98] transition-all group overflow-hidden relative"
              >
                <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <Scan size={22} className="group-hover:rotate-12 transition-transform" />
                QUÉT THẺ CCCD (THÁO AI)
              </button>

              <div className="space-y-3">
                <div className="relative">
                <input
                  type="text"
                  placeholder="Họ và tên khách hàng"
                  value={customer.name || ''}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                  onChange={(e) => setCustomer({...customer, name: e.target.value})}
                  className="w-full px-6 py-4 bg-white border border-slate-100 rounded-full shadow-sm text-slate-900 font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 transition-all"
                />
                
                {/* Smart Suggestion Dropdown */}
                <AnimatePresence>
                  {filteredCustomers.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute z-20 w-full bg-white/80 backdrop-blur-2xl border border-white rounded-3xl mt-2 shadow-2xl overflow-hidden divide-y divide-zinc-50"
                    >
                      {filteredCustomers.map((c: Customer, index: number) => (
                        <button
                          key={c.id || `customer-${index}`}
                          type="button"
                          onClick={() => handleSelectCustomer(c)}
                          className="w-full px-5 py-4 text-left hover:bg-blue-50/50 flex items-center gap-4 transition-all group"
                        >
                          <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                            <User size={20} />
                          </div>
                          <div>
                            <p className="font-black text-zinc-900 uppercase text-sm">{c.full_name}</p>
                            <p className="text-xs font-bold text-zinc-400">{c.phone} {c.address ? `• ${c.address}` : ''}</p>
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Số điện thoại"
                    value={customer.phone || ''}
                    onChange={(e) => setCustomer({...customer, phone: e.target.value})}
                    className="w-full px-6 py-4 bg-white border border-slate-100 rounded-full shadow-sm text-slate-900 font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Số CCCD"
                    value={customer.idCard || ''}
                    onChange={(e) => setCustomer({...customer, idCard: e.target.value})}
                    className="w-full px-6 py-4 bg-white border border-slate-100 rounded-full shadow-sm text-slate-900 font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Địa chỉ khách hàng"
                  value={customer.address || ''}
                  onChange={(e) => setCustomer({...customer, address: e.target.value})}
                  className="w-full px-6 py-4 bg-white border border-slate-100 rounded-full shadow-sm text-slate-900 font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>
          </div>

            {/* Rental Type Selection - Modern Card Style */}
            <div className="relative flex bg-white/50 p-2 rounded-[2.5rem] shadow-inner border border-slate-100 gap-2 mb-6">
              <div className="absolute inset-0 p-2 pointer-events-none">
                <div className="relative w-full h-full">
                  <motion.div
                    layoutId="activeRentalType"
                    className={cn(
                      "absolute h-full rounded-[2rem] shadow-lg transition-colors duration-500",
                      rentalType === 'hourly' && "bg-blue-600 shadow-blue-200",
                      rentalType === 'daily' && "bg-emerald-600 shadow-emerald-200",
                      rentalType === 'overnight' && "bg-indigo-600 shadow-indigo-200"
                    )}
                    initial={false}
                    animate={{
                      width: `${100 / rentalTypes.length}%`,
                      x: `${activeIndex * 100}%`,
                    }}
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                </div>
              </div>

              {rentalTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setRentalType(type.id)}
                  className={cn(
                    "relative flex-1 flex flex-col items-center justify-center gap-2 py-5 rounded-[2rem] transition-colors duration-300 z-10",
                    rentalType === type.id ? "text-white" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-xl transition-all duration-500",
                    rentalType === type.id ? "scale-110 bg-white/20 rotate-[10deg]" : "bg-slate-50"
                  )}>
                    {type.icon}
                  </div>
                  <span className="text-[10px] font-black tracking-[0.1em] uppercase">
                    {type.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Price and Deposit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-slate-100 relative group transition-all hover:shadow-md">
                <div className="absolute top-4 right-5 opacity-10 group-hover:opacity-20 transition-opacity">
                  <CreditCard size={40} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <CreditCard size={10} /> Giá Phòng
                </p>
                <div className="flex items-baseline gap-1">
                  <NumericInput
                    value={price}
                    onChange={setPrice}
                    className="w-full text-2xl font-black text-slate-900 border-none p-0 focus:ring-0 bg-transparent"
                    suffix="đ"
                  />
                </div>
              </div>
              
              <div className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-slate-100 relative group transition-all hover:shadow-md">
                <div className="absolute top-4 right-5 opacity-10 group-hover:opacity-20 transition-opacity">
                  <FileText size={40} />
                </div>
                <div className="flex justify-between items-start mb-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <FileText size={10} /> Tiền Cọc
                  </p>
                  <button 
                    onClick={() => setDeposit(price + serviceTotal)}
                    className="text-[9px] font-black text-blue-500 hover:text-blue-700 transition-colors uppercase px-2 py-0.5 bg-blue-50 rounded-full"
                  >
                    Tất cả
                  </button>
                </div>
                <div className="flex items-baseline gap-1">
                  <NumericInput
                    value={deposit}
                    onChange={setDeposit}
                    className="w-full text-2xl font-black text-emerald-600 border-none p-0 focus:ring-0 bg-transparent"
                    suffix="đ"
                  />
                </div>
              </div>
            </div>

            {/* Note Textarea */}
            <div className="bg-white p-5 rounded-[2.5rem] shadow-sm">
              <textarea
                placeholder="Ghi chú thêm..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full text-sm font-bold text-zinc-600 border-none p-0 focus:ring-0 bg-transparent resize-none placeholder:text-zinc-200"
              />
            </div>

            {/* Service Selection */}
            <div className="pt-2">
              <ServiceSelector services={services} selectedServices={servicesUsed} onChange={setServicesUsed} />
            </div>
          </main>

          {/* iOS Style Glassmorphism Footer */}
          <div className="absolute bottom-0 left-0 right-0 p-6 pt-4 bg-white/80 backdrop-blur-xl border-t border-white flex items-center justify-between z-10">
            <div className="space-y-0.5">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Tổng tạm tính</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-zinc-900 tracking-tight">
                  {formatCurrency(totalAmount)}
                </span>
                <span className="text-zinc-400 font-bold font-serif">đ</span>
              </div>
            </div>
            
            <button
              onClick={handleConfirm}
              className="px-8 py-5 bg-slate-900 text-white rounded-[2rem] font-black text-sm uppercase tracking-wider shadow-xl shadow-slate-200 active:scale-95 transition-all flex items-center gap-3 group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <span className="relative z-10">Nhận phòng ngay</span>
              <div className="relative z-10 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:rotate-12 transition-transform">
                <MoreHorizontal size={20} />
              </div>
            </button>
          </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    
    <CCCDScanner 
        key="cccd-scanner-modal"
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScanComplete={handleScanComplete} 
      />
    </>
  );
}
