
'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Edit, Printer, DollarSign, Trash2, ChevronDown, User, Clock, Plus, Minus, Search, Save, CheckCircle, Info, LogIn, LogOut, FileText, ShoppingCart, Star, Coffee, Utensils, Beer, Cigarette, Wine } from 'lucide-react';
import { Room, Service, PricingBreakdown, Setting } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { calculateRoomPrice } from '@/lib/pricing';
import { supabase } from '@/lib/supabase';
import { useNotification } from '@/context/NotificationContext';
import { format, parseISO, differenceInMinutes, differenceInCalendarDays } from 'date-fns';
import { cn } from '@/lib/utils';
import CheckoutModal, { CheckoutData } from './CheckoutModal';

// Mock data for icons, will be replaced with actual icons
const Icon = ({ name, className }: { name: string, className?: string }) => {
  const icons: { [key: string]: React.ElementType } = {
    'fa-exchange-alt': ArrowRight,
    'fa-pen': Edit,
    'fa-print': Printer,
    'fa-wallet': DollarSign,
    'fa-trash-alt': Trash2,
    'fa-user-circle': User,
    'fa-clock': Clock,
    'fa-save': Save,
    'fa-check-circle': CheckCircle,
  };
  const LucideIcon = icons[name] || Info;
  return <LucideIcon className={cn("w-5 h-5", className)} />;
};

const LogIcon = ({ action }: { action: string }) => {
    const icons: { [key: string]: React.ElementType } = {
        'check_in': LogIn,
        'check_out': LogOut,
        'add_service': ShoppingCart,
        'update_booking': Edit,
        'payment': DollarSign,
        'audit': Star,
        'cancel_booking': Trash2,
    };
    const LucideIcon = icons[action] || FileText;
    return <LucideIcon className="w-4 h-4 text-slate-500" />;
};

const ServiceIcon = ({ name }: { name: string }) => {
    const n = name.toLowerCase();
    const iconSize = 24;
    if (n.includes('cà phê') || n.includes('coffee')) return <Coffee size={iconSize} className="text-orange-500" />;
    if (n.includes('mì') || n.includes('ăn') || n.includes('phở')) return <Utensils size={iconSize} className="text-yellow-600" />;
    if (n.includes('bia') || n.includes('beer')) return <Beer size={iconSize} className="text-amber-500" />;
    if (n.includes('thuốc') || n.includes('cigarette')) return <Cigarette size={iconSize} className="text-slate-400" />;
    if (n.includes('rượu') || n.includes('wine')) return <Wine size={iconSize} className="text-rose-700" />;
    return <ShoppingCart size={iconSize} className="text-blue-400" />;
};

interface FolioModalProps {
  room: Room | null;
  allRooms: Room[];
  settings: Setting[];
  services: Service[];
  isOpen: boolean;
  onClose: () => void;
  onPayment: (bookingId: string, finalAmount: number, auditNote?: string) => void;
  onUpdate: () => void;
  onCancel: (bookingId: string) => void;
  onChangeRoom: (bookingId: string) => void;
  onEditBooking: (booking: any) => void;
  onMerge: (sourceBookingId: string, targetRoomId: string, breakdown: PricingBreakdown) => void;
}

export default function FolioModal({
  room,
  allRooms,
  settings,
  services,
  isOpen,
  onClose,
  onPayment,
  onUpdate,
  onCancel,
  onChangeRoom,
  onEditBooking,
  onMerge
}: FolioModalProps) {

  const [tempServices, setTempServices] = useState<Record<string, number>>({});
  const [isHeroCardExpanded, setIsHeroCardExpanded] = useState(false);
  const [pricingBreakdown, setPricingBreakdown] = useState<PricingBreakdown | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isServicesExpanded, setIsServicesExpanded] = useState(true);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const { showNotification } = useNotification();

  const duration = useMemo(() => {
    if (!room?.current_booking?.check_in_at) return '0h 0p';
    const start = parseISO(room.current_booking.check_in_at);
    const now = new Date();
    
    if (room.current_booking.rental_type === 'hourly') {
      const totalMinutes = differenceInMinutes(now, start);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `Đã ${hours}h ${minutes}p`;
    } else {
      const days = differenceInCalendarDays(now, start);
      return `Đã ${Math.max(1, days)} ngày`;
    }
  }, [room?.current_booking?.check_in_at, room?.current_booking?.rental_type]);

  const timeRules = useMemo(() => {
    const timeSettings = settings.find(s => s.key === 'time_rules');
    return timeSettings?.value || {};
  }, [settings]);

  const savedServices = useMemo(() => {
    const servicesUsed = room?.current_booking?.services_used || [];
    return servicesUsed.reduce((acc: Record<string, number>, item: any) => {
      const sid = String(item.service_id || item.id);
      if (sid) acc[sid] = item.quantity;
      return acc;
    }, {});
  }, [room?.current_booking?.services_used]);

  useEffect(() => {
    if (isOpen) {
      setTempServices(savedServices);
    } else {
      setTempServices({});
      setSearchQuery('');
      setIsHeroCardExpanded(false);
    }
  }, [isOpen]); // Chỉ chạy khi đóng/mở modal để tránh đè dữ liệu đang nhập

  const serviceTotals = useMemo(() => {
    const calcTotal = (serviceList: Record<string, number>) => 
      Object.entries(serviceList).reduce((total, [sid, qty]) => {
        const serviceInfo = services.find(s => String(s.id) === String(sid));
        return total + (serviceInfo?.price || 0) * qty;
      }, 0);

    const savedTotal = calcTotal(savedServices);
    const tempTotal = calcTotal(tempServices);
    
    return {
      saved: savedTotal,
      temp: tempTotal,
      diff: tempTotal - savedTotal,
    };
  }, [tempServices, savedServices, services]);

  const isDirty = useMemo(() => {
    // Chỉ so sánh các dịch vụ có số lượng > 0
    const cleanTemp = Object.fromEntries(Object.entries(tempServices).filter(([_, q]) => q > 0));
    const cleanSaved = Object.fromEntries(Object.entries(savedServices).filter(([_, q]) => q > 0));
    return JSON.stringify(cleanTemp) !== JSON.stringify(cleanSaved);
  }, [tempServices, savedServices]);

  const updatePricing = useCallback(() => {
    if (room?.current_booking) {
      const breakdown = calculateRoomPrice(
        room.current_booking.check_in_at,
        new Date(),
        settings,
        room,
        room.current_booking.rental_type,
        serviceTotals.temp
      );
      setPricingBreakdown(breakdown);
    }
  }, [room, settings, serviceTotals.temp]);

  useEffect(() => {
    updatePricing();
    const interval = setInterval(updatePricing, 60000);
    return () => clearInterval(interval);
  }, [updatePricing]);

  const handleQuantityChange = (serviceId: string | number, newQuantity: number) => {
    const sid = String(serviceId);
    const qty = Math.max(0, newQuantity);
    setTempServices(prev => ({
      ...prev,
      [sid]: qty
    }));
  };

  const handleSaveUpdate = async () => {
    const bookingId = room?.current_booking?.id;
    if (!bookingId || isSaving) return;

    setIsSaving(true);
    try {
      const updatedServicesArray = Object.entries(tempServices)
        .filter(([_, qty]) => qty > 0)
        .map(([sid, qty]) => {
          const s = services.find(srv => String(srv.id) === String(sid));
          // Tìm giá từ dữ liệu đã lưu nếu không có trong danh sách dịch vụ hiện tại
          const savedS = room.current_booking?.services_used?.find((ss: any) => String(ss.service_id || ss.id) === String(sid));
          
          const price = s?.price || savedS?.price || 0;
          const name = s?.name || savedS?.name || 'Dịch vụ';
          
          return {
            id: sid,
            service_id: sid,
            name,
            price,
            quantity: qty,
            total: price * qty
          };
        });

      const { error } = await supabase
        .from('bookings')
        .update({ services_used: updatedServicesArray })
        .eq('id', bookingId);

      if (error) throw error;
      
      // Cập nhật tempServices để khớp với dữ liệu đã lưu (xóa các dịch vụ qty = 0)
      const newTemp: Record<string, number> = {};
      updatedServicesArray.forEach(s => {
        newTemp[String(s.id)] = s.quantity;
      });
      setTempServices(newTemp);
      
      showNotification('Đã lưu cập nhật dịch vụ', 'success');
      if (onUpdate) onUpdate();
    } catch (error: any) {
      showNotification(`Lỗi khi lưu: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredServices = useMemo(() => {
    if (!searchQuery) return services;
    return services.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery, services]);

  const deposit = room?.current_booking?.deposit_amount || 0;
  
  // Calculate stable display amounts to avoid flashing during recalculation
  const displayPricing = useMemo(() => {
    if (!pricingBreakdown) return { base: 0, diff: serviceTotals.diff };
    
    // Base amount is everything EXCEPT the current temporary services
    // This includes Room Charge, Surcharges, Saved Services, and Merged Bookings
    const roomAndSurcharges = pricingBreakdown.total_amount 
      - pricingBreakdown.service_charge 
      - (pricingBreakdown.tax_details?.service_tax || 0);
      
    const mergedTotal = room?.current_booking?.merged_bookings?.reduce((sum, mb) => sum + mb.amount, 0) || 0;
    const baseAmount = roomAndSurcharges + serviceTotals.saved + mergedTotal - deposit;
    
    return {
      base: baseAmount,
      diff: serviceTotals.diff
    };
  }, [pricingBreakdown, serviceTotals.saved, serviceTotals.diff, deposit, room?.current_booking?.merged_bookings]);

  const finalAmount = (pricingBreakdown?.total_amount || 0) - deposit;

  if (!isOpen || !room || !room.current_booking) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div key="folio-modal-main" className="fixed inset-0 z-[9999] flex items-center justify-center">
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
          >
            {/* Header */}
            <header className="sticky top-0 bg-white border-b border-slate-200 p-4 z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button 
                  onClick={onClose} 
                  className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
                >
                  <X size={20} className="text-slate-600" />
                </button>
                <div>
                  <h2 className="font-black text-lg uppercase leading-tight">Phòng {room.room_number}</h2>
                  <p className="text-blue-600 font-black text-[10px] tracking-[0.2em] uppercase">
                    {room.current_booking.rental_type === 'hourly' ? 'KHÁCH GIỜ' : 
                     room.current_booking.rental_type === 'overnight' ? 'KHÁCH QUA ĐÊM' : 'KHÁCH NGÀY'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                  <Printer size={18} />
                </button>
              </div>
            </header>

            {/* Body */}
            <main className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Quick Action Grid */}
              <div className="grid grid-cols-5 gap-3 text-center">
                {[
                  { label: 'Đổi phòng', icon: 'fa-exchange-alt', action: () => onChangeRoom(room.current_booking!.id) },
                  { label: 'Sửa', icon: 'fa-pen', action: () => onEditBooking(room.current_booking) },
                  { label: 'In', icon: 'fa-print', action: () => {} },
                  { label: 'Cọc', icon: 'fa-wallet', action: () => {} },
                  { label: 'Hủy', icon: 'fa-trash-alt', action: () => onCancel(room.current_booking!.id), color: 'text-rose-500' },
                ].map(item => (
                  <div key={item.label} onClick={item.action} className="flex flex-col items-center gap-1 cursor-pointer">
                    <div className={`w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm ${item.color || 'text-slate-600'}`}>
                      <Icon name={item.icon} />
                    </div>
                    <span className="text-xs font-bold text-slate-500">{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Hero Summary Card */}
              <div 
                className="bg-indigo-700 text-white rounded-[2.5rem] p-6 shadow-2xl cursor-pointer"
                onClick={() => setIsHeroCardExpanded(!isHeroCardExpanded)}
              >
                <div className="relative z-10 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <p className="text-[10px] text-indigo-200 font-black uppercase tracking-[0.2em]">Tổng phải thu</p>
                    <motion.div animate={{ rotate: isHeroCardExpanded ? 180 : 0 }}>
                      <ChevronDown size={14} className="text-indigo-300" />
                    </motion.div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <p className={cn(
                        "font-black tracking-tighter transition-all duration-300",
                        isDirty && displayPricing.diff !== 0 ? "text-4xl opacity-90" : "text-5xl"
                      )}>
                        {formatCurrency(displayPricing.base)}
                      </p>
                      {isDirty && displayPricing.diff !== 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black text-white/60">+</span>
                          <div className="bg-white/20 px-3 py-1 rounded-2xl backdrop-blur-md border border-white/20 animate-pulse">
                            <span className="text-2xl font-black">
                              {formatCurrency(Math.abs(displayPricing.diff))}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <div className="bg-white/10 px-4 py-2 rounded-2xl flex items-center gap-2 border border-white/10">
                      <User size={16} className="text-indigo-200" />
                      <span className="text-base font-black uppercase tracking-tight">
                        {room.current_booking.customer?.full_name || 'Khách vãng lai'}
                      </span>
                    </div>
                    <div className="bg-white/10 px-4 py-2 rounded-2xl flex items-center gap-2 border border-white/10">
                      <Clock size={16} className="text-indigo-200" />
                      <span className="text-base font-black uppercase tracking-tight">
                        {duration}
                      </span>
                    </div>
                  </div>
                </div>
                <AnimatePresence>
                  {isHeroCardExpanded && (
                    <motion.div
                      key="hero-expanded-content"
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: '24px' }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="border-t border-white/10 overflow-hidden"
                    >
                      <div className="pt-6 space-y-3">
                        <div className="flex justify-between">
                          <span className="font-bold text-indigo-200">Giờ vào</span>
                          <span className="font-bold">{format(parseISO(room.current_booking.check_in_at), 'HH:mm dd/MM/yyyy')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold text-indigo-200">Tiền phòng</span>
                          <span className="font-bold">{formatCurrency(pricingBreakdown?.room_charge || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold text-indigo-200">Tiền dịch vụ</span>
                          <span className="font-bold">{formatCurrency(serviceTotals.temp)}</span>
                        </div>

                        {/* Merged Bookings */}
                        {room.current_booking.merged_bookings && room.current_booking.merged_bookings.length > 0 && (
                          <div className="pt-2 space-y-2 border-t border-white/10">
                            <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Tiền gộp từ phòng khác</p>
                            {room.current_booking.merged_bookings.map((mb, idx) => (
                              <div key={idx} className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <Layers size={12} className="text-indigo-300" />
                                  <span className="font-bold">Phòng {mb.room_number}</span>
                                </div>
                                <span className="font-bold">{formatCurrency(mb.amount)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {deposit > 0 && (
                          <div className="flex justify-between">
                            <span className="font-bold text-indigo-200">Tiền cọc</span>
                            <span className="font-bold text-emerald-300">-{formatCurrency(deposit)}</span>
                          </div>
                        )}

                        {/* Notes Boxes */}
                        <div className="grid grid-cols-2 gap-3 pt-4">
                          <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-black uppercase text-indigo-200">Khách hàng</span>
                              <Edit size={10} className="text-indigo-300" />
                            </div>
                            <p className="text-xs text-white/80 line-clamp-2 italic">
                              {room.current_booking.customer?.notes || 'Không có ghi chú...'}
                            </p>
                          </div>
                          <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-black uppercase text-indigo-200">Phòng</span>
                              <Edit size={10} className="text-indigo-300" />
                            </div>
                            <p className="text-xs text-white/80 line-clamp-2 italic">
                              {room.current_booking.notes || 'Không có ghi chú...'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Service Management */}
              <div className="space-y-4">
                <div className="relative">
                  <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm dịch vụ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-14 pl-12 pr-4 bg-white rounded-2xl border border-slate-200 shadow-sm"
                  />
                </div>

                {/* Catalog */}
                <div className="flex overflow-x-auto gap-3 pb-8 pt-6 px-4 -mx-4 scrollbar-hide">
                  {filteredServices.map(service => (
                    <div 
                        key={service.id} 
                        onClick={() => handleQuantityChange(service.id, (tempServices[String(service.id)] || 0) + 1)} 
                        className="relative flex-shrink-0 w-28 text-center bg-white p-4 rounded-[2rem] shadow-sm cursor-pointer hover:bg-slate-50 transition-colors border border-slate-100"
                    >
                      <div className="mb-2 flex justify-center">
                        <ServiceIcon name={service.name} />
                      </div>
                      <p className="font-bold text-[11px] text-slate-700 line-clamp-1">{service.name}</p>
                      <p className="font-black text-green-600 text-[10px]">{formatCurrency(service.price)}</p>
                      {((tempServices[String(service.id)] || 0) - (savedServices[String(service.id)] || 0)) > 0 && (
                        <div className="absolute -top-2 -right-1 min-w-[28px] h-7 px-2 bg-indigo-600 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-lg border-2 border-white z-20">
                          {(tempServices[String(service.id)] || 0) - (savedServices[String(service.id)] || 0)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Dịch vụ đã chọn */}
                <div>
                  <div 
                    className="flex items-center justify-between mb-2 cursor-pointer"
                    onClick={() => setIsServicesExpanded(!isServicesExpanded)}
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-500 uppercase text-xs tracking-wider">Dịch vụ đã chọn</h3>
                      <div className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {Object.values(tempServices).filter(q => q > 0).length}
                      </div>
                    </div>
                    <motion.div animate={{ rotate: isServicesExpanded ? 0 : -90 }}>
                      <ChevronDown size={16} className="text-slate-400" />
                    </motion.div>
                  </div>
                  
                  <AnimatePresence initial={false}>
                    {isServicesExpanded && (
                      <motion.div
                        key="services-expanded-content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-2"
                      >
                        {Object.entries(tempServices)
                          .filter(([_, qty]) => qty > 0)
                          .map(([serviceId, quantity]) => {
                            // Chuẩn hóa so sánh ID để đảm bảo luôn tìm thấy service
                            const serviceInfo = services.find(s => String(s.id) === String(serviceId));
                            
                            // Nếu không tìm thấy trong danh sách services, thử tìm trong chính booking.services_used
                            const savedService = room.current_booking?.services_used?.find(s => String(s.service_id || s.id) === String(serviceId));
                            
                            const name = serviceInfo?.name || savedService?.name || 'Dịch vụ';
                            const price = serviceInfo?.price || savedService?.price || 0;
                            const savedQty = savedServices[serviceId] || 0;
                            const diff = quantity - savedQty;

                            return (
                              <div key={serviceId} className="bg-white p-3 rounded-2xl flex items-center gap-3 shadow-sm border border-slate-100">
                                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                                  <ServiceIcon name={name} />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-slate-800">{name}</p>
                                    {diff !== 0 && (
                                      <span className={cn(
                                        "text-[10px] font-black px-1.5 py-0.5 rounded-md", 
                                        diff > 0 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'
                                      )}>
                                        {diff > 0 ? `+${diff}`: diff}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] font-bold text-slate-400">
                                    {formatCurrency(price)} × {quantity}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl">
                                  <button 
                                    onClick={() => handleQuantityChange(serviceId, quantity - 1)} 
                                    className="w-7 h-7 rounded-lg bg-white shadow-sm flex items-center justify-center text-slate-600 active:scale-90 transition-transform"
                                  >
                                    <Minus size={14} />
                                  </button>
                                  <span className="font-black text-sm w-5 text-center">{quantity}</span>
                                  <button 
                                    onClick={() => handleQuantityChange(serviceId, quantity + 1)} 
                                    className="w-7 h-7 rounded-lg bg-slate-800 text-white shadow-sm flex items-center justify-center active:scale-90 transition-transform"
                                  >
                                    <Plus size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        
                        {Object.values(tempServices).every(q => q === 0) && (
                          <div className="text-center py-8 bg-white rounded-2xl border-2 border-dashed border-slate-100">
                            <ShoppingCart className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                            <p className="text-xs font-bold text-slate-400">Chưa có dịch vụ nào</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              
              {/* System Logs */}
              <div className="space-y-3 pt-4">
                <h3 className="font-bold text-slate-500">Nhật ký hệ thống</h3>
                {room.current_booking.logs?.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).map((log, index) => (
                    <div key={index} className="flex items-start gap-3 text-sm">
                        <div className="bg-slate-100 rounded-full p-2 mt-1">
                            <LogIcon action={log.action} />
                        </div>
                        <div className="flex-1">
                            <p className="text-slate-600">
                                <span className="font-bold text-slate-800">Hệ thống</span> {log.detail}
                                <span className="text-xs text-slate-400 ml-2">{format(new Date(log.time), 'HH:mm dd/MM/yy')}</span>
                            </p>
                        </div>
                    </div>
                ))}
              </div>

            </main>

            {/* Footer */}
              <footer className="sticky bottom-0 bg-white border-t border-slate-200 p-4 z-10">
                <motion.button
                  layout
                  onClick={isDirty ? handleSaveUpdate : () => setIsCheckoutOpen(true)}
                  disabled={isSaving}
                className={cn(
                  "w-full h-16 rounded-2xl font-black text-lg text-white flex items-center justify-center gap-2 transition-colors duration-300",
                  isDirty ? "bg-indigo-600 animate-pulse" : "bg-rose-600"
                )}
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={isDirty ? "save" : "pay"}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>ĐANG LƯU...</span>
                      </>
                    ) : isDirty ? (
                      <>
                        <Icon name="fa-save" />
                        <span>LƯU CẬP NHẬT</span>
                      </>
                    ) : (
                      <>
                        <Icon name="fa-door-open" />
                        <span>THANH TOÁN {formatCurrency(finalAmount)}</span>
                      </>
                    )}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </footer>
          </motion.div>
        </div>
      )}

      {room && room.current_booking && (
        <CheckoutModal
          key="checkout-modal"
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          room={room}
          allRooms={allRooms}
          pricingBreakdown={pricingBreakdown}
          onConfirm={(data: CheckoutData) => {
            const mergedTotal = room.current_booking?.merged_bookings?.reduce((sum, mb) => sum + mb.amount, 0) || 0;
            const baseTotal = (pricingBreakdown?.total_amount || 0) + mergedTotal;
            
            const finalTotal = baseTotal + data.surcharge - (data.discountType === 'percent' ? baseTotal * data.discount / 100 : data.discount);
            const taxAmount = data.isTaxEnabled ? finalTotal * data.taxPercent / 100 : 0;
            const amountToPay = finalTotal + taxAmount - (room.current_booking?.deposit_amount || 0);
            
            onPayment(room.current_booking!.id, amountToPay, data.note);
            setIsCheckoutOpen(false);
          }}
          onMerge={(targetRoomId, breakdown) => {
            onMerge(room.current_booking!.id, targetRoomId, breakdown);
            setIsCheckoutOpen(false);
          }}
        />
      )}
    </AnimatePresence>
  );
}
