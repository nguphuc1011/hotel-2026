'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Room, Service, Customer, TimeRules, CheckInData } from '@/types';
import { cn, formatCurrency, suggestRentalType } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MoreHorizontal, User, Clock, Calendar, Scan, AlertTriangle, Check } from 'lucide-react';
import { useCustomerBalance } from '@/hooks/useCustomerBalance';
import { ServiceSelector } from './ServiceSelector';
import { NumericInput } from '@/components/ui/NumericInput';
import CCCDScanner from '@/app/settings/customers/_components/CCCDScanner';
import { toast } from 'sonner';
import { HotelService } from '@/services/hotel';
import { supabase } from '@/lib/supabase';

interface CheckInModalProps {
  room: Room | null;
  services: Service[];
  timeRules: TimeRules;
  isOpen: boolean;
  isProcessing?: boolean;
  onClose: () => void;
  onConfirm: (data: CheckInData) => void;
}

export function CheckInModal({
  room,
  services,
  timeRules,
  isOpen,
  isProcessing = false,
  onClose,
  onConfirm,
}: CheckInModalProps) {
  const [customer, setCustomer] = useState<{
    id?: string;
    name: string;
    phone: string;
    idCard: string;
    address: string;
  }>({ name: '', phone: '', idCard: '', address: '' });
  const [rentalType, setRentalType] = useState('hourly');
  const hasSuggested = useRef(false);

  // Suggest rental type ONLY once when modal opens or room changes
  useEffect(() => {
    if (isOpen && room && !hasSuggested.current) {
      const suggestion = suggestRentalType(new Date(), timeRules);
      // Nếu đề xuất bán đêm nhưng phòng không cho phép -> đổi sang hourly
      if (suggestion === 'overnight' && !room.enable_overnight) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRentalType('hourly');
      } else {
        setRentalType(suggestion);
      }
      hasSuggested.current = true;
    }

    if (!isOpen) {
      hasSuggested.current = false;
    }
  }, [isOpen, room, timeRules]);
  const [price, setPrice] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [depositMethod, setDepositMethod] = useState('cash');
  const [servicesUsed, setServicesUsed] = useState<
    Array<{ service_id: string; quantity: number; price: number }>
  >([]);
  const [note, setNote] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [customerBalance, setCustomerBalance] = useState<number>(0);

  // Search khách hàng khi gõ tên
  useEffect(() => {
    const searchTimer = setTimeout(async () => {
      if (customer.name && customer.name.length >= 1 && !isProcessing) {
        console.time('[Hiệu Năng] Tìm kiếm Khách hàng');
        const results = await HotelService.searchCustomers(customer.name);
        setSearchResults(results);
        console.timeEnd('[Hiệu Năng] Tìm kiếm Khách hàng');
      } else {
        setSearchResults([]);
      }
    }, 300); // Debounce 300ms

    return () => clearTimeout(searchTimer);
  }, [customer.name, isFocused, isProcessing, customer.id]);

  const handleScanComplete = (data: {
    fullName: string;
    idNumber: string;
    dob: string;
    address: string;
  }) => {
    // Fill form
    setCustomer((prev) => ({
      ...prev,
      name: data.fullName !== 'Không nhận diện được' ? data.fullName : prev.name,
      idCard: data.idNumber !== 'Không nhận diện được' ? data.idNumber : prev.idCard,
      address: data.address !== 'Không nhận diện được' ? data.address : prev.address,
    }));

    // Check blacklist logic "Tháo"
    // Tìm trong DB xem khách này có trong blacklist không
    const checkCustomerStatus = async () => {
      const { data: existingCust } = await supabase
        .from('customers')
        .select('*')
        .or(`id_card.eq.${data.idNumber},full_name.ilike.${data.fullName}`)
        .maybeSingle();

      if (existingCust) {
        // 1. Check blacklist
        if (existingCust.notes?.toLowerCase().includes('black-list')) {
          toast.error('Tháo phát hiện khách này cần lưu tâm!', {
            description: 'Khách hàng này nằm trong danh sách đen hoặc có lịch sử không tốt.',
            duration: 5000,
            icon: <AlertTriangle className="text-red-500" />,
          });
        }

        // 2. Check debt
        const bal = Number(existingCust.balance || 0);
        setCustomerBalance(bal);
        if (bal < 0) {
          setCustomer({
            id: existingCust.id,
            name: existingCust.full_name,
            phone: existingCust.phone || '',
            idCard: existingCust.id_card || '',
            address: existingCust.address || '',
          });

          toast.warning(`Phát hiện nợ cũ: ${formatCurrency(Math.abs(bal))}`, {
            description: 'Vui lòng xác nhận phương án xử lý nợ.',
            duration: 4000,
          });
        }
      } else {
        toast.success('Đã nhận diện thông tin CCCD');
      }
    };

    checkCustomerStatus();
  };

  // Synchronize numeric price when room or rentalType changes
  useEffect(() => {
    if (isOpen && room) {
      // Ưu tiên lấy giá từ category, nếu không có mới dùng room.prices
      const targetPrices = room.category?.prices || room.prices;
      if (targetPrices) {
        const priceForType = targetPrices[rentalType as keyof typeof targetPrices];
        if (typeof priceForType === 'number' && priceForType > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setPrice(priceForType);
        } else if (typeof priceForType === 'number' && priceForType === 0) {
          // Fallback to default hourly if specific type is 0
          setPrice(targetPrices.hourly || 0);
        }
      }
    }
  }, [isOpen, room, rentalType]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomer({ name: '', phone: '', idCard: '', address: '' });

      setPrice(0);

      setDeposit(0);

      setServicesUsed([]);

      setNote('');

      setCustomerBalance(0);
    }
  }, [isOpen]);

  // Check blacklist logic "Tháo"
  const handleSelectCustomer = (data: Customer) => {
    setCustomer({
      id: data.id,
      name: data.full_name,
      phone: data.phone || '',
      idCard: data.id_card || '',
      address: data.address || '',
    });
    setSearchResults([]);
    setIsFocused(false);

    // Check blacklist & balance
    const checkCustomerStatus = async () => {
      const { data: existingCust } = await supabase
        .from('customers')
        .select('*')
        .eq('id', data.id)
        .maybeSingle();

      if (existingCust) {
        // 1. Check blacklist
        if (existingCust.notes?.toLowerCase().includes('black-list')) {
          toast.error('CẢNH BÁO: Khách hàng trong danh sách đen!', {
            description: 'Vui lòng kiểm tra kỹ lịch sử và ghi chú của khách hàng này.',
            duration: 5000,
            icon: <AlertTriangle className="text-red-500" />,
          });
        }

        // 2. Update balance
        setCustomerBalance(existingCust.balance || 0);
      }
    };

    checkCustomerStatus();
  };

  const handleConfirm = () => {
    try {
      if (isProcessing) {
        return;
      }

      const checkInData = {
        room_id: room?.id,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          idCard: customer.idCard,
          address: customer.address,
        },
        rentalType: rentalType,
        price: price,
        deposit: deposit,
        depositMethod: depositMethod,
        services: servicesUsed,
        notes: note,
      };
      onConfirm(checkInData);
    } catch {
      // Error handled by parent or notification
    }
  };

  const rentalTypes = useMemo(() => {
    const types = [
      { id: 'hourly', label: 'THEO GIỜ', icon: <Clock size={20} /> },
      { id: 'daily', label: 'THEO NGÀY', icon: <Calendar size={20} /> },
      { id: 'overnight', label: 'QUA ĐÊM', icon: <Clock size={20} className="rotate-180" /> },
    ];

    if (room && !room.enable_overnight) {
      return types.filter((t) => t.id !== 'overnight');
    }
    return types;
  }, [room]);

  const activeIndex = rentalTypes.findIndex((t) => t.id === rentalType);
  const serviceTotal = servicesUsed.reduce((sum, s) => sum + s.price * s.quantity, 0);

  // totalAmount includes room price + services - customerBalance (debt is negative, so it adds up)
  const totalAmount = price + serviceTotal - customerBalance;

  const {
    isDebt: hasOldDebt,
    isCredit: hasCredit,
    absFormattedBalance: formattedOldDebt,
  } = useCustomerBalance(customerBalance);

  return (
    <>
      <AnimatePresence mode="wait">
        {isOpen && room && (
          <div
            key="checkin-modal-root"
            className="fixed inset-0 z-[10010] flex items-center justify-center pointer-events-auto"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md z-0"
              onClick={() => !isProcessing && onClose()}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 40, stiffness: 400 }}
              className="relative w-full h-[100dvh] bg-slate-50 flex flex-col overflow-hidden z-[10020]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <header className="sticky top-0 bg-white border-b border-slate-100 pt-4 pb-4 px-4 z-10 flex items-center justify-center relative min-h-[80px]">
                <button
                  onClick={onClose}
                  disabled={isProcessing}
                  className={cn(
                    'absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center hover:bg-slate-100 transition-colors',
                    isProcessing && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <X size={20} className="text-slate-400" />
                </button>
                <div className="text-center">
                  <h2 className="font-black text-2xl text-slate-800 uppercase tracking-tight">
                    Nhận phòng
                  </h2>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <p className="text-slate-400 font-bold text-[10px] tracking-[0.2em] uppercase">
                      Phòng {room.room_number}
                    </p>
                    {room.category?.name && (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-black rounded-full uppercase tracking-wider border border-blue-100">
                        {room.category.name}
                      </span>
                    )}
                  </div>
                </div>
              </header>

              {/* Debt/Credit Banner inside CheckInModal */}
              <AnimatePresence mode="wait">
                {hasOldDebt && (
                  <motion.div
                    key="debt-banner"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-rose-600 text-white px-6 py-3 flex items-center justify-between shadow-inner"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                        <AlertTriangle size={16} className="text-white animate-pulse" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/80 leading-none">
                          Khách đang nợ cũ
                        </p>
                        <p className="text-sm font-black mt-0.5">{formattedOldDebt}</p>
                      </div>
                    </div>
                    <div className="bg-white/10 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider">
                      Tự động cộng vào công nợ
                    </div>
                  </motion.div>
                )}
                {hasCredit && (
                  <motion.div
                    key="credit-banner"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-emerald-600 text-white px-6 py-3 flex items-center justify-between shadow-inner"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                        <Check size={16} className="text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/80 leading-none">
                          Khách đang có tiền dư
                        </p>
                        <p className="text-sm font-black mt-0.5">{formattedOldDebt}</p>
                      </div>
                    </div>
                    <div className="bg-white/10 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider">
                      Tự động trừ khi trả phòng
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Scrollable Content */}
              <main className="flex-1 overflow-y-auto space-y-8 p-6 scrollbar-hide">
                {/* Customer Inputs */}
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    disabled={isProcessing}
                    className={cn(
                      'w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center gap-3 text-white font-black uppercase tracking-wider shadow-lg shadow-blue-200 hover:shadow-blue-300 hover:scale-[1.02] active:scale-[0.98] transition-all group overflow-hidden relative',
                      isProcessing && 'opacity-50 cursor-not-allowed grayscale'
                    )}
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
                        onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                        disabled={isProcessing}
                        className={cn(
                          'w-full px-6 py-4 bg-white border border-slate-100 rounded-full shadow-sm text-slate-900 font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50',
                          hasOldDebt && 'border-rose-300 bg-rose-50',
                          hasCredit && 'border-emerald-300 bg-emerald-50'
                        )}
                      />

                      {hasOldDebt && (
                        <div
                          className={cn(
                            'absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full animate-bounce shadow-lg text-white',
                            'bg-rose-600'
                          )}
                        >
                          <AlertTriangle size={12} />
                          <span className="text-[10px] font-black uppercase">
                            {`Nợ: ${formattedOldDebt}`}
                          </span>
                        </div>
                      )}
                      {hasCredit && (
                        <div
                          className={cn(
                            'absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full animate-bounce shadow-lg text-white',
                            'bg-emerald-600'
                          )}
                        >
                          <Check size={12} />
                          <span className="text-[10px] font-black uppercase">
                            {`Dư: ${formattedOldDebt}`}
                          </span>
                        </div>
                      )}
                      <AnimatePresence>
                        {searchResults.length > 0 && (
                          <motion.div
                            key="customer-search-results"
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute z-20 w-full bg-white/80 backdrop-blur-2xl border border-white rounded-3xl mt-2 shadow-2xl overflow-hidden divide-y divide-zinc-50"
                          >
                            {searchResults.map((c: Customer, index: number) => {
                              const balance = Number(c.balance || 0);
                              const hasDebt = balance < 0;
                              const hasCredit = balance > 0;
                              return (
                                <button
                                  key={c.id || `customer-${index}`}
                                  type="button"
                                  onClick={() => handleSelectCustomer(c)}
                                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all text-left group"
                                >
                                  <div className="flex items-center gap-4">
                                    <div
                                      className={cn(
                                        'w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-sm',
                                        hasDebt
                                          ? 'bg-rose-50 text-rose-600'
                                          : hasCredit
                                            ? 'bg-emerald-50 text-emerald-600'
                                            : 'bg-slate-50 text-slate-400'
                                      )}
                                    >
                                      <User size={20} />
                                    </div>
                                    <div>
                                      <h4 className="font-black text-slate-800 uppercase tracking-tight group-hover:text-blue-600 transition-colors">
                                        {c.full_name}
                                      </h4>
                                      <p className="text-slate-400 font-bold text-xs">{c.phone}</p>
                                    </div>
                                  </div>
                                  {balance !== 0 && (
                                    <div
                                      className={cn(
                                        'px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider shadow-sm',
                                        hasDebt
                                          ? 'bg-rose-600 text-white'
                                          : 'bg-emerald-600 text-white'
                                      )}
                                    >
                                      {hasDebt ? 'Nợ: ' : 'Dư: '}{' '}
                                      {formatCurrency(Math.abs(balance))}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
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
                          onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                          disabled={isProcessing}
                          className="w-full px-6 py-4 bg-white border border-slate-100 rounded-full shadow-sm text-slate-900 font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                        />
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Số CCCD"
                          value={customer.idCard || ''}
                          onChange={(e) => setCustomer({ ...customer, idCard: e.target.value })}
                          disabled={isProcessing}
                          className="w-full px-6 py-4 bg-white border border-slate-100 rounded-full shadow-sm text-slate-900 font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                        />
                      </div>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Địa chỉ khách hàng"
                        value={customer.address || ''}
                        onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                        disabled={isProcessing}
                        className="w-full px-6 py-4 bg-white border border-slate-100 rounded-full shadow-sm text-slate-900 font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Rental Type Selection - Modern Card Style */}
                <div className="relative flex bg-white/50 p-2 rounded-[2.5rem] shadow-inner border border-slate-100 gap-2">
                  <div className="absolute inset-0 p-2 pointer-events-none">
                    <div className="relative w-full h-full">
                      <motion.div
                        layoutId="activeRentalType"
                        className={cn(
                          'absolute h-full rounded-[2rem] shadow-lg transition-colors duration-500',
                          rentalType === 'hourly' && 'bg-blue-600 shadow-blue-200',
                          rentalType === 'daily' && 'bg-emerald-600 shadow-emerald-200',
                          rentalType === 'overnight' && 'bg-indigo-600 shadow-indigo-200'
                        )}
                        initial={false}
                        animate={{
                          x: `${activeIndex * 100}%`,
                          width: `${100 / rentalTypes.length}%`,
                        }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    </div>
                  </div>

                  {rentalTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => !isProcessing && setRentalType(type.id as any)}
                      disabled={isProcessing}
                      className={cn(
                        'relative flex-1 py-4 flex flex-col items-center justify-center gap-1.5 rounded-[1.5rem] transition-all duration-500 z-10',
                        rentalType === type.id
                          ? 'text-white'
                          : 'text-slate-400 hover:text-slate-600',
                        isProcessing && 'cursor-not-allowed opacity-50'
                      )}
                    >
                      <span
                        className={cn(
                          'transition-transform duration-500',
                          rentalType === type.id && 'scale-110'
                        )}
                      >
                        {type.icon}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-[0.15em]">
                        {type.label}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Price & Deposit Inputs */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">
                      Tiền phòng
                    </label>
                    <div className="relative group">
                      <NumericInput
                        value={price}
                        onChange={setPrice}
                        disabled={isProcessing}
                        className="w-full text-3xl font-black text-slate-800 border-none p-0 focus:ring-0 bg-transparent"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">
                      Trả trước
                    </label>
                    <div className="flex flex-col gap-2">
                      <div className="relative group">
                        <NumericInput
                          value={deposit}
                          onChange={setDeposit}
                          disabled={isProcessing}
                          className="w-full px-6 py-4 bg-white border border-slate-100 rounded-full shadow-sm text-slate-900 font-black focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                        />
                      </div>
                      {deposit > 0 && (
                        <div className="flex items-center gap-2 px-2">
                          {[
                            { id: 'cash', label: 'Tiền mặt', icon: '💵' },
                            { id: 'transfer', label: 'Chuyển khoản', icon: '🏦' },
                            { id: 'card', label: 'Thẻ', icon: '💳' },
                          ].map((method) => (
                            <button
                              key={method.id}
                              onClick={() => setDepositMethod(method.id)}
                              className={cn(
                                'flex-1 py-2 px-1 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1 border',
                                depositMethod === method.id
                                  ? 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200'
                                  : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
                              )}
                            >
                              <span>{method.icon}</span>
                              {method.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notes Section */}
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                  <textarea
                    placeholder="Ghi chú thêm..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={isProcessing}
                    rows={2}
                    className="w-full text-sm font-bold text-zinc-600 border-none p-0 focus:ring-0 bg-transparent resize-none placeholder:text-zinc-200 disabled:opacity-50"
                  />
                </div>

                {/* Service Selection */}
                <div className={cn('pt-2', isProcessing && 'opacity-50 pointer-events-none')}>
                  <ServiceSelector
                    services={services}
                    selectedServices={servicesUsed}
                    onChange={setServicesUsed}
                  />
                </div>
              </main>

              {/* iOS Style Glassmorphism Footer - Fixed height */}
              <footer className="relative shrink-0 p-6 pt-4 pb-safe bg-white border-t border-slate-100 flex items-center justify-between z-[10030] shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
                <div className="space-y-0.5 pointer-events-none">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                    {customerBalance !== 0 ? 'Tổng cộng (gồm nợ/dư)' : 'Tổng tạm tính'}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span
                      className={cn(
                        'text-2xl font-black tracking-tight',
                        hasOldDebt
                          ? 'text-rose-600'
                          : hasCredit
                            ? 'text-emerald-600'
                            : 'text-zinc-900'
                      )}
                    >
                      {formatCurrency(totalAmount)}
                    </span>
                  </div>
                  {customerBalance !== 0 && (
                    <p
                      className={cn(
                        'text-[9px] font-bold uppercase flex items-center gap-1',
                        hasOldDebt ? 'text-rose-500' : 'text-emerald-500'
                      )}
                    >
                      {hasOldDebt ? (
                        <>
                          <AlertTriangle size={10} />
                          <span>+ {formattedOldDebt} nợ cũ</span>
                        </>
                      ) : (
                        <>
                          <Check size={10} />
                          <span>- {formattedOldDebt} tiền dư</span>
                        </>
                      )}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isProcessing}
                  className={cn(
                    'px-10 py-6 bg-slate-900 text-white rounded-[2rem] font-black text-sm uppercase tracking-wider shadow-xl shadow-slate-200 active:scale-95 transition-all flex items-center gap-3 group relative touch-manipulation z-[10040]',
                    isProcessing && 'opacity-70 cursor-not-allowed shadow-none'
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[2rem]" />
                  <span className="relative z-10">
                    {isProcessing ? 'Đang xử lý...' : 'Nhận phòng ngay'}
                  </span>
                  <div className="relative z-10 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:rotate-12 transition-transform">
                    {isProcessing ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      >
                        <MoreHorizontal size={20} />
                      </motion.div>
                    ) : (
                      <MoreHorizontal size={20} />
                    )}
                  </div>
                </button>
              </footer>
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
