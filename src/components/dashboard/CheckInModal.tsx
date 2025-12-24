'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Room, Service, Customer } from '@/types';
import { cn, formatCurrency, formatInputCurrency, parseCurrency } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MoreHorizontal, User, Smartphone, CreditCard, Clock, Settings, FileText, Calendar } from 'lucide-react';
import { suggestRentalType } from '@/lib/pricing';
import { ServiceSelector } from './ServiceSelector';

interface CheckInModalProps {
  room: Room | null;
  services: Service[];
  customers: Customer[];
  timeRules: any;
  onClose: () => void;
  onConfirm: (data: any) => void;
}

export function CheckInModal({ room, services, customers, timeRules, onClose, onConfirm }: CheckInModalProps) {
  const [customer, setCustomer] = useState({ name: '', phone: '', idCard: '', plate_number: '' });
  const [rentalType, setRentalType] = useState('daily');
  const [price, setPrice] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [displayPrice, setDisplayPrice] = useState('0');
  const [displayDeposit, setDisplayDeposit] = useState('0');
  const [servicesUsed, setServicesUsed] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Synchronize numeric price with display string
  useEffect(() => {
    setDisplayPrice(formatCurrency(price));
  }, [price]);

  useEffect(() => {
    setDisplayDeposit(formatCurrency(deposit));
  }, [deposit]);

  const filteredCustomers = useMemo(() => {
    const term = customer.name.toLowerCase();
    if (!term || !isFocused) return [];
    
    // Fuzzy search logic from duan.md
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
    }).slice(0, 5); // Limit to top 5 as per duan.md
  }, [customer.name, customers, isFocused]);

  // Mặc định chọn ngày khi mở modal (Xóa useEffect suggestRentalType cũ)
  
  useEffect(() => {
    if (room && room.prices) {
      const priceForType = room.prices[rentalType as keyof typeof room.prices];
      if (typeof priceForType === 'number') {
        setPrice(priceForType);
      }
    }
  }, [room, rentalType]);

  const handleSelectCustomer = (selected: Customer) => {
    setCustomer({
      name: selected.full_name,
      phone: selected.phone,
      idCard: selected.id_card || '',
      plate_number: selected.plate_number || ''
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
        plate_number: customer.plate_number,
      },
      rentalType: rentalType,
      price: price,
      deposit: deposit,
      services: servicesUsed,
      notes: note,
    };
    onConfirm(checkInData);
  };

  const serviceTotal = servicesUsed.reduce((sum, s) => sum + (s.price * s.quantity), 0);
  const totalAmount = price + deposit + serviceTotal;

  if (!room) return null;

  return (
    <AnimatePresence mode="wait">
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-sm p-0">
        {/* Background Overlay for click to close */}
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full h-full sm:h-full bg-slate-100 shadow-2xl overflow-hidden flex flex-col rounded-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* iOS Style Drag Handle (Mobile only - hidden for full screen) */}
          {/* <div className="absolute left-1/2 top-3 h-1.5 w-12 -translate-x-1/2 rounded-full bg-zinc-300 sm:hidden" /> */}

          {/* Header */}
          <div className="px-6 pt-8 pb-4 flex items-center justify-between">
            <button 
              onClick={onClose} 
              className="text-blue-600 font-bold text-lg active:scale-95 transition-all"
            >
              Hủy
            </button>
            <div className="text-center">
              <h2 className="text-xl font-black text-zinc-900 uppercase">Phòng {room.room_number}</h2>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                {room.room_type} • Tầng {room.area}
              </p>
            </div>
            <button className="p-2 bg-white/50 rounded-full text-zinc-400 active:scale-95 transition-all">
              <MoreHorizontal size={20} />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6 space-y-5 pb-40 scrollbar-hide">
            
            {/* Customer Inputs */}
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Họ và tên khách hàng"
                  value={customer.name}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                  onChange={(e) => setCustomer({...customer, name: e.target.value})}
                  className="w-full px-5 py-4 bg-white border-none rounded-3xl shadow-sm text-zinc-900 font-bold placeholder:text-zinc-300 focus:ring-2 focus:ring-blue-500 transition-all"
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
                      {filteredCustomers.map((c: Customer) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCustomer(c)}
                          className="w-full px-5 py-4 text-left hover:bg-blue-50/50 flex items-center gap-4 transition-all group"
                        >
                          <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                            <User size={20} />
                          </div>
                          <div>
                            <p className="font-black text-zinc-900 uppercase text-sm">{c.full_name}</p>
                            <p className="text-xs font-bold text-zinc-400">{c.phone} {c.plate_number ? `• ${c.plate_number}` : ''}</p>
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
                    value={customer.phone}
                    onChange={(e) => setCustomer({...customer, phone: e.target.value})}
                    className="w-full px-5 py-4 bg-white border-none rounded-3xl shadow-sm text-zinc-900 font-bold placeholder:text-zinc-300 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Số CCCD"
                    value={customer.idCard}
                    onChange={(e) => setCustomer({...customer, idCard: e.target.value})}
                    className="w-full px-5 py-4 bg-white border-none rounded-3xl shadow-sm text-zinc-900 font-bold placeholder:text-zinc-300 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Biển số xe (nếu có)"
                  value={customer.plate_number}
                  onChange={(e) => setCustomer({...customer, plate_number: e.target.value})}
                  className="w-full px-5 py-4 bg-white border-none rounded-3xl shadow-sm text-zinc-900 font-bold placeholder:text-zinc-300 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Rental Type Segmented Control */}
            <div className="p-1.5 bg-white/60 rounded-[2rem] shadow-inner flex relative">
              <motion.div
                layoutId="activeTab"
                className={cn(
                  "absolute h-[calc(100%-12px)] top-[6px] rounded-[1.7rem] shadow-md z-0",
                  rentalType === 'hourly' ? "bg-indigo-600" : 
                  rentalType === 'daily' ? "bg-blue-600" : "bg-purple-600"
                )}
                style={{
                  width: room.enable_overnight ? '33.33%' : '50%',
                  left: rentalType === 'hourly' ? '6px' : 
                        rentalType === 'daily' ? (room.enable_overnight ? '33.33%' : '50%') : 
                        '66.66%'
                }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
              {['hourly', 'daily', ...(room.enable_overnight ? ['overnight'] : [])].map((type) => (
                <button
                  key={type}
                  onClick={() => setRentalType(type)}
                  className={cn(
                    "flex-1 py-3.5 rounded-[1.7rem] text-[11px] font-black uppercase tracking-wider transition-all relative z-10 flex items-center justify-center gap-2",
                    rentalType === type ? "text-white" : "text-zinc-400"
                  )}
                >
                  {type === 'hourly' && <Clock size={14} />}
                  {type === 'daily' && <Calendar size={14} />}
                  {type === 'overnight' && <Smartphone size={14} />}
                  {type === 'hourly' ? 'Theo Giờ' : type === 'daily' ? 'Theo Ngày' : 'Qua Đêm'}
                </button>
              ))}
            </div>

            {/* Price and Deposit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-[2.5rem] shadow-sm relative group">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <CreditCard size={10} /> Giá Phòng
                </p>
                <div className="flex items-baseline gap-1">
                  <input
                    type="text"
                    value={displayPrice}
                    onChange={(e) => {
                      const formatted = formatInputCurrency(e.target.value);
                      setDisplayPrice(formatted);
                      setPrice(parseCurrency(formatted));
                    }}
                    className="w-full text-xl font-black text-zinc-900 border-none p-0 focus:ring-0 bg-transparent"
                  />
                  <span className="text-zinc-300 font-bold font-serif">đ</span>
                </div>
              </div>
              
              <div className="bg-white p-5 rounded-[2.5rem] shadow-sm relative group">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                    <FileText size={10} /> Tiền Cọc
                  </p>
                  <button 
                    onClick={() => setDeposit(totalAmount)}
                    className="text-[9px] font-black text-blue-500 hover:text-blue-700 transition-colors uppercase"
                  >
                    [Tất cả]
                  </button>
                </div>
                <div className="flex items-baseline gap-1">
                  <input
                    type="text"
                    value={displayDeposit}
                    onChange={(e) => {
                      const formatted = formatInputCurrency(e.target.value);
                      setDisplayDeposit(formatted);
                      setDeposit(parseCurrency(formatted));
                    }}
                    className="w-full text-xl font-black text-green-600 border-none p-0 focus:ring-0 bg-transparent"
                  />
                  <span className="text-green-200 font-bold font-serif">đ</span>
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
          </div>

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
              className="px-8 py-5 bg-zinc-900 text-white rounded-[2rem] font-black text-sm uppercase tracking-wider shadow-xl shadow-zinc-200 active:scale-95 transition-all flex items-center gap-3"
            >
              Nhận phòng ngay
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
