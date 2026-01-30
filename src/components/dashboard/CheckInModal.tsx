'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
    X, User, Plus, Minus, Search, Loader2, 
    Calendar, Clock, MapPin, 
    Phone, Globe, Facebook, MessageCircle,
    Briefcase, AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';
import { Room } from '@/types/dashboard';
import { customerService, Customer } from '@/services/customerService';
import { serviceService, Service } from '@/services/serviceService';
import { settingsService, RoomCategory } from '@/services/settingsService';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';
import { securityService, SecurityAction } from '@/services/securityService';
import { useSecurity } from '@/hooks/useSecurity';

interface CheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room | null;
  onCheckIn: (bookingData: any) => Promise<void>;
}

type RentalType = 'hourly' | 'daily' | 'overnight';

// --- Constants ---

const RENTAL_TYPES: { id: RentalType; label: string; icon: any }[] = [
    { id: 'hourly', label: 'THEO GIỜ', icon: Clock },
    { id: 'daily', label: 'THEO NGÀY', icon: Calendar },
    { id: 'overnight', label: 'QUA ĐÊM', icon: Clock },
];

const SOURCES = [
    { id: 'direct', label: 'Vãng lai', icon: User },
    { id: 'booking', label: 'Booking', icon: Globe },
    { id: 'agoda', label: 'Agoda', icon: MapPin },
    { id: 'traveloka', label: 'Traveloka', icon: PlaneIcon },
    { id: 'facebook', label: 'Facebook', icon: Facebook },
    { id: 'phone', label: 'Điện thoại', icon: Phone },
    { id: 'zalo', label: 'Zalo', icon: MessageCircle },
];

function PlaneIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12h20M2 12l5-5m-5 5l5 5" transform="rotate(180 12 12)" />
        </svg>
    )
}

// --- Helper Components ---

function Switch({ checked, onCheckedChange, label }: { checked: boolean, onCheckedChange: (c: boolean) => void, label?: string }) {
    return (
        <div className="flex items-center gap-3 cursor-pointer group select-none" onClick={() => onCheckedChange(!checked)}>
             <div className={cn(
                "w-11 h-6 rounded-full p-1 transition-all duration-300 ease-out flex items-center",
                checked ? "bg-blue-600 shadow-inner" : "bg-slate-200 group-hover:bg-slate-300"
            )}>
                <div className={cn(
                    "w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ease-out",
                    checked ? "translate-x-5" : "translate-x-0"
                )} />
            </div>
            {label && <span className={cn("font-bold text-sm transition-colors", checked ? "text-slate-800" : "text-slate-500")}>{label}</span>}
        </div>
    )
}

// Hook for Long Press
function useLongPress(
    onLongPress: (e: React.MouseEvent | React.TouchEvent) => void,
    onClick: () => void,
    { shouldPreventDefault = true, delay = 300 } = {}
) {
    const [longPressTriggered, setLongPressTriggered] = useState(false);
    const timeout = useRef<NodeJS.Timeout | null>(null);
    const target = useRef<EventTarget | null>(null);
    const lastTouchTime = useRef<number>(0);
    
    // Swipe detection refs
    const startX = useRef<number>(0);
    const startY = useRef<number>(0);
    const isSwiping = useRef<boolean>(false);

    const start = (event: React.MouseEvent | React.TouchEvent) => {
        if (event.type === 'mousedown' && Date.now() - lastTouchTime.current < 500) return;
        
        // Reset swipe state
        isSwiping.current = false;
        
        if (event.type === 'touchstart') {
            lastTouchTime.current = Date.now();
            const touch = (event as React.TouchEvent).touches[0];
            startX.current = touch.clientX;
            startY.current = touch.clientY;
        }

        if (shouldPreventDefault && event.target) {
            target.current = event.target;
        }
        timeout.current = setTimeout(() => {
            if (!isSwiping.current) { // Only trigger long press if not swiping
                onLongPress(event);
                setLongPressTriggered(true);
            }
        }, delay);
    };

    const move = (event: React.TouchEvent) => {
        if (isSwiping.current) return;
        
        const touch = event.touches[0];
        const diffX = Math.abs(touch.clientX - startX.current);
        const diffY = Math.abs(touch.clientY - startY.current);
        
        // If moved more than 10px, consider it a swipe
        if (diffX > 10 || diffY > 10) {
            isSwiping.current = true;
            if (timeout.current) {
                clearTimeout(timeout.current);
            }
        }
    };

    const clear = (event: React.MouseEvent | React.TouchEvent, shouldTriggerClick = true) => {
        if (event.type === 'mouseup' && Date.now() - lastTouchTime.current < 500) return;
        if (event.type === 'touchend') lastTouchTime.current = Date.now();

        if (timeout.current) {
            clearTimeout(timeout.current);
        }
        
        // Only click if:
        // 1. Should trigger click (mouse leave passes false)
        // 2. Long press wasn't triggered
        // 3. User didn't swipe/scroll
        if (shouldTriggerClick && !longPressTriggered && !isSwiping.current) {
            onClick();
        }
        
        setLongPressTriggered(false);
        isSwiping.current = false;
        target.current = null;
    };

    return {
        onMouseDown: (e: React.MouseEvent) => start(e),
        onTouchStart: (e: React.TouchEvent) => start(e),
        onTouchMove: (e: React.TouchEvent) => move(e),
        onMouseUp: (e: React.MouseEvent) => clear(e),
        onMouseLeave: (e: React.MouseEvent) => clear(e, false),
        onTouchEnd: (e: React.TouchEvent) => clear(e)
    };
}

function ServiceCard({ service, quantity, onAdd, onRemove }: { 
    service: Service, 
    quantity: number,
    onAdd: () => void,
    onRemove: () => void
}) {
    const longPressEvent = useLongPress(onRemove, onAdd, { delay: 400 });
    const isOutOfStock = (service.track_inventory ? (service.stock_quantity || 0) <= 0 : false);
    const isLowStock = service.track_inventory ? (service.stock_quantity || 0) <= (service.min_stock_level || 0) : false;
    const isSelected = quantity > 0;
    
    return (
        <div 
            {...longPressEvent}
            className={cn(
                "min-w-[150px] w-[150px] h-[170px] rounded-[32px] flex flex-col items-center justify-center p-4 relative select-none transition-all snap-start",
                isOutOfStock ? "opacity-60 grayscale cursor-not-allowed bg-slate-50" : "cursor-pointer bg-white hover:shadow-lg hover:-translate-y-1",
                quantity > 0 ? "shadow-lg ring-2 ring-slate-400 ring-offset-2" : "shadow-sm border border-slate-100"
            )}
        >
            <div className={cn(
                "w-[60px] h-[60px] rounded-[24px] flex items-center justify-center mb-3 transition-all relative shadow-sm",
                quantity > 0 ? "bg-slate-500 text-white shadow-slate-200" : "bg-slate-50 text-slate-400"
            )}>
                {quantity > 0 && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm border-2 border-white z-10">
                        {quantity}
                    </div>
                )}
                <Briefcase className="w-7 h-7" strokeWidth={2} />
                <div className={cn(
                    "absolute -bottom-2 right-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                    isOutOfStock ? "bg-red-100 text-red-600" : isLowStock ? "bg-amber-100 text-amber-700" : "bg-white text-slate-600 border border-slate-200"
                )}>
                    Kho: {service.stock_quantity}
                </div>
            </div>
            
            <div className="text-center w-full space-y-1">
                <h4 className={cn("font-bold text-sm line-clamp-1", quantity > 0 ? "text-slate-800" : "text-slate-600")}>
                    {service.name}
                </h4>
                <div className={cn("font-bold text-sm", quantity > 0 ? "text-slate-600" : "text-slate-400")}>
                    {formatMoney(service.price)}
                </div>
                <p className="text-xs text-slate-400">{service.unit_sell || service.unit}</p>
            </div>
        </div>
    )
}

export default function CheckInModal({ isOpen, onClose, room, onCheckIn }: CheckInModalProps) {
  const { alert: alertDialog, confirm: confirmDialog } = useGlobalDialog();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<RentalType>('hourly');
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [deposit, setDeposit] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Security Hook
  const { verify, SecurityModals } = useSecurity();
  
  // New State
  const [source, setSource] = useState('direct');
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [selectedServices, setSelectedServices] = useState<{service: Service, quantity: number}[]>([]);
  const [notes, setNotes] = useState('');

  // Toggles & Expanded State
  const [isCustomPrice, setIsCustomPrice] = useState(false);
  const [customPrice, setCustomPrice] = useState<number>(0);
  const [customPriceReason, setCustomPriceReason] = useState('');
  
  const [isExtraPeople, setIsExtraPeople] = useState(false);
  const [extraAdults, setExtraAdults] = useState(0);
  const [extraChildren, setExtraChildren] = useState(0);

  // Settings State
  const [roomCategory, setRoomCategory] = useState<RoomCategory | null>(null);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);

  const searchRef = useRef<HTMLDivElement>(null);

  // Helper to normalize string for search (remove accents)
  const normalize = (str: string) => {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .trim();
  };

  // Check for mounting
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch Settings, Category & Customers
  useEffect(() => {
    if (isOpen && room) {
        const fetchData = async () => {
            try {
                // Fetch categories
                const categories = await settingsService.getRoomCategories();
                const currentCat = categories.find(c => c.id === room.category_id);
                setRoomCategory(currentCat || null);

                // Pre-fetch customers for fast searching
                const { data } = await customerService.getCustomers({ limit: 1000 });
                setAllCustomers(data);
            } catch (e) {
                console.error("Failed to load settings or customers", e);
            }
        };
        fetchData();
        
        // Reset States
        setExtraAdults(0);
        setExtraChildren(0);
        setDeposit(0);
        setNotes('');
        setSearchTerm('');
        setNewCustomerPhone('');
        setNewCustomerIdCard('');
        setSelectedCustomer(null);
        setActiveTab('hourly');
        setIsSubmitting(false);
        setIsCustomPrice(false);
        setCustomPrice(0);
        setCustomPriceReason('');
        setSource('direct');
        setSelectedServices([]);
        setIsExtraPeople(false);
        
        serviceService.getServices().then(setAvailableServices).catch(console.error);
    }
  }, [isOpen, room]);

  // Fast Local Search
  useEffect(() => {
    if (!searchTerm.trim() || selectedCustomer) {
        setCustomers([]);
        return;
    }

    const searchNorm = normalize(searchTerm);
    const filtered = allCustomers.filter(c => {
        const nameNorm = normalize(c.full_name);
        const phone = c.phone || '';
        const idCard = c.id_card || '';
        return nameNorm.includes(searchNorm) || phone.includes(searchNorm) || idCard.includes(searchNorm);
    }).slice(0, 5); // Limit to 5 results for UI

    setCustomers(filtered);
  }, [searchTerm, allCustomers, selectedCustomer]);

  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerIdCard, setNewCustomerIdCard] = useState('');

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setCustomers([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchRef]);

  // Sync custom price with default price when toggled on
  useEffect(() => {
    if (isCustomPrice && customPrice === 0 && room) {
        const defaultPrice = 
            activeTab === 'hourly' ? room.price_hourly || 0 :
            activeTab === 'daily' ? room.price_daily || 0 :
            activeTab === 'overnight' ? room.price_overnight || 0 : 0;
        setCustomPrice(defaultPrice);
    }
  }, [isCustomPrice, activeTab, room]);

  if (!isOpen || !room) return null;

  // --- Handlers ---

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSearchTerm(customer.full_name);
    setCustomers([]);
  };

  const handleClearCustomer = () => {
      setSelectedCustomer(null);
      setSearchTerm('');
  };

  const handleAddService = (service: Service) => {
      setSelectedServices(prev => {
          const existing = prev.find(item => item.service.id === service.id);
          if (existing) {
              return prev.map(item => item.service.id === service.id ? { ...item, quantity: item.quantity + 1 } : item);
          }
          return [...prev, { service, quantity: 1 }];
      });
  };

  const handleRemoveService = (serviceId: string) => {
      setSelectedServices(prev => {
          const existing = prev.find(item => item.service.id === serviceId);
          if (existing && existing.quantity > 1) {
              return prev.map(item => item.service.id === serviceId ? { ...item, quantity: item.quantity - 1 } : item);
          }
          return prev.filter(item => item.service.id !== serviceId);
      });
  };

  const handleSubmit = async (verifiedStaff?: { id: string, name: string }) => {
        // --- Security Checks ---
        if (!verifiedStaff) {
            // Check if any sensitive action is being performed
            if (isCustomPrice) {
                await verify('checkin_custom_price', (staffId, staffName) => 
                    handleSubmit(staffId ? { id: staffId, name: staffName || '' } : undefined)
                );
                return;
            }

            if (selectedCustomer && selectedCustomer.balance < 0) {
                await verify('checkin_debt_allow', (staffId, staffName) => 
                    handleSubmit(staffId ? { id: staffId, name: staffName || '' } : undefined)
                );
                return;
            }

            if (isExtraPeople && (extraAdults > 0 || extraChildren > 0)) {
                await verify('checkin_override_surcharge', (staffId, staffName) => 
                    handleSubmit(staffId ? { id: staffId, name: staffName || '' } : undefined)
                );
                return;
            }
        }

        setIsSubmitting(true);
        try {
            let finalCustomerId = selectedCustomer?.id;

            // Handle New Customer Creation
            if (!finalCustomerId && searchTerm.trim()) {
                const newCustomer = await customerService.createCustomer({
                    full_name: searchTerm,
                    phone: newCustomerPhone,
                    id_card: newCustomerIdCard,
                    balance: 0
                });
                if (newCustomer) {
                    finalCustomerId = newCustomer.id;
                }
            }

            if (selectedCustomer && selectedCustomer.balance < 0 && !verifiedStaff) {
                    const debt = Math.abs(selectedCustomer.balance);
                    const confirmed = await confirmDialog({
                        title: 'Cảnh báo nợ cũ',
                        message: `Khách ${selectedCustomer.full_name} đang nợ ${formatMoney(debt)}.\nKhoản nợ này sẽ được cộng vào công nợ phòng và thanh toán khi trả phòng.\n\nLễ tân đã thông báo rõ cho khách và vẫn muốn nhận phòng?`,
                        confirmLabel: 'ĐÃ THÔNG BÁO, VẪN NHẬN PHÒNG',
                        type: 'confirm'
                    });

                if (!confirmed) {
                    setIsSubmitting(false);
                    return;
                }
            }

            const payload = {
                room_id: room.id,
                rental_type: activeTab,
                customer_id: finalCustomerId,
                customer_name: !finalCustomerId ? searchTerm : undefined, 
                deposit,
                payment_method: paymentMethod,
                extra_adults: isExtraPeople ? extraAdults : 0,
                extra_children: isExtraPeople ? extraChildren : 0,
                notes,
                custom_price: isCustomPrice ? customPrice : undefined,
                custom_price_reason: isCustomPrice ? customPriceReason : undefined,
                source,
                services: selectedServices.map(s => ({
                    id: s.service.id,
                    quantity: s.quantity,
                    price: s.service.price
                })),
                verified_by_staff_id: verifiedStaff?.id,
                verified_by_staff_name: verifiedStaff?.name
            };
            
            await onCheckIn(payload);
        } catch (error: any) {
            console.error(error);
            alertDialog({
              title: 'Lỗi',
              message: error.message || 'Có lỗi xảy ra khi check-in',
              type: 'error'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Calculations ---

  const defaultRoomPrice = 
      activeTab === 'hourly' ? room.price_hourly || 0 :
      activeTab === 'daily' ? room.price_daily || 0 :
      activeTab === 'overnight' ? room.price_overnight || 0 : 0;

  const finalRoomPrice = isCustomPrice ? customPrice : defaultRoomPrice;
  
  const servicesTotal = selectedServices.reduce((sum, item) => sum + (item.service.price * item.quantity), 0);
  const servicesCount = selectedServices.reduce((sum, item) => sum + item.quantity, 0);
  
  // Debt logic
  const debt = selectedCustomer && selectedCustomer.balance < 0 ? Math.abs(selectedCustomer.balance) : 0;
  
  const extraAdultPrice = roomCategory?.price_extra_adult || 0;
  const extraChildPrice = roomCategory?.price_extra_child || 0;
  const surchargeTotal = isExtraPeople ? (extraAdults * extraAdultPrice + extraChildren * extraChildPrice) : 0;

  const totalAmount = finalRoomPrice + servicesTotal + surchargeTotal + debt;

  if (!mounted) return null;

  return createPortal(
        <div className="fixed inset-0 z-[50000] flex flex-col justify-end sm:justify-center items-center backdrop-blur-md bg-slate-900/60">
            {/* Modal Container */}
            <div className="w-full h-full sm:w-full sm:max-w-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-[40px] bg-slate-50 flex flex-col shadow-2xl overflow-hidden relative">
            
            {/* --- HEADER --- */}
            <div className="h-16 flex justify-between items-center px-6 bg-white z-50 shrink-0 shadow-sm border-b border-slate-100/50">
                <div className="flex items-center gap-3">
                    <span className="bg-slate-900 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg uppercase tracking-wider shadow-sm">Check-in</span>
                    <h2 className="text-lg font-bold text-slate-800">Phòng {room.name}</h2>
                </div>
                <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-full transition-all active:scale-95">
                    <X className="w-5 h-5 text-slate-500" />
                </button>
            </div>

            {/* --- BODY --- */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] bg-slate-50">
                
                {/* 1. SOURCE & CUSTOMER */}
                <div className="space-y-4">
                     {/* Source Icons */}
                     <div className="flex gap-4 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden px-1">
                         {SOURCES.map(src => (
                             <div 
                                key={src.id} 
                                onClick={() => setSource(src.id)} 
                                className="group flex flex-col items-center gap-2 cursor-pointer flex-none min-w-[64px]"
                             >
                                 <div className={cn(
                                     "w-14 h-14 rounded-[28px] flex items-center justify-center transition-all duration-300 shadow-sm", 
                                     source === src.id ? "bg-blue-600 text-white shadow-blue-600/30 scale-105" : "bg-white text-slate-400 hover:bg-white hover:text-blue-500 hover:shadow-md"
                                 )}>
                                     <src.icon className="w-6 h-6" strokeWidth={1.5} />
                                 </div>
                                 <span className={cn(
                                     "text-[11px] font-semibold transition-colors text-center leading-tight",
                                     source === src.id ? "text-blue-700" : "text-slate-500"
                                 )}>{src.label}</span>
                             </div>
                         ))}
                    </div>

                    {/* Customer Search */}
                    <div className="relative group bg-white rounded-[32px] shadow-sm p-1 transition-shadow hover:shadow-md" ref={searchRef}>
                        <div className="flex items-center px-4">
                            <Search className="w-5 h-5 text-slate-400 mr-3" />
                            <input
                                type="text"
                                placeholder="Tìm khách hàng..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full py-4 bg-transparent border-none text-base font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-0 outline-none"
                            />
                            {selectedCustomer && (
                                <button onClick={handleClearCustomer} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        {selectedCustomer && selectedCustomer.balance < 0 && (
                            <div className="mx-4 mb-3 p-3 bg-rose-50 rounded-2xl border border-rose-100 flex items-center gap-3 animate-in slide-in-from-top-1">
                                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                                    <AlertCircle className="w-5 h-5 text-rose-600" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-[10px] font-bold text-rose-500 uppercase tracking-tight">Cảnh báo nợ cũ</div>
                                    <div className="text-sm font-black text-rose-700">
                                        Khách đang nợ {Math.abs(selectedCustomer.balance).toLocaleString()}đ
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Dropdown Results */}
                        {customers.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-[24px] shadow-xl overflow-hidden z-50 p-1 border border-slate-100">
                                {customers.map(customer => (
                                    <div 
                                        key={customer.id}
                                        onClick={() => handleCustomerSelect(customer)}
                                        className="px-4 py-3 hover:bg-blue-50 rounded-xl cursor-pointer flex justify-between items-center group transition-colors"
                                    >
                                        <span className="font-bold text-slate-700 group-hover:text-blue-700">{customer.full_name}</span>
                                        {customer.balance !== 0 && (
                                            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", customer.balance < 0 ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600")}>
                                                {customer.balance.toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    {/* New Customer Info */}
                    {!selectedCustomer && searchTerm.length > 0 && customers.length === 0 && !isSearching && (
                        <div className="animate-in slide-in-from-top-2 fade-in duration-300 grid grid-cols-2 gap-3">
                             <input 
                                type="tel" 
                                placeholder="Số điện thoại"
                                value={newCustomerPhone}
                                onChange={(e) => setNewCustomerPhone(e.target.value)}
                                className="bg-white border-none rounded-[24px] px-5 py-4 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm placeholder:font-normal"
                             />
                             <input 
                                type="text" 
                                placeholder="CCCD/CMND"
                                value={newCustomerIdCard}
                                onChange={(e) => setNewCustomerIdCard(e.target.value)}
                                className="bg-white border-none rounded-[24px] px-5 py-4 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm placeholder:font-normal"
                             />
                        </div>
                    )}
                </div>

                {/* 2. RENTAL TYPES (Pills) - KEPT rounded-full */}
                <div className="flex bg-white rounded-full p-1.5 shadow-sm relative z-10">
                    {RENTAL_TYPES.filter(type => {
                        if (type.id === 'overnight') return roomCategory?.overnight_enabled !== false;
                        return true;
                    }).map(type => {
                         const isActive = activeTab === type.id;
                         return (
                            <button
                                key={type.id}
                                onClick={() => setActiveTab(type.id)}
                                className={cn(
                                    "flex-1 flex flex-col items-center justify-center py-3.5 rounded-full transition-all duration-300 relative overflow-hidden",
                                    isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-slate-400 hover:bg-slate-50"
                                )}
                            >
                                <type.icon className={cn("w-4 h-4 mb-1.5", isActive ? "text-white" : "text-slate-400")} />
                                <span className="text-[10px] font-bold tracking-widest uppercase">{type.label}</span>
                            </button>
                         )
                    })}
                </div>

                {/* 3. ROOM PRICE */}
                <div className="bg-white rounded-[40px] p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">Giá phòng</span>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500 font-medium">Giá tuỳ chỉnh</span>
                            <Switch checked={isCustomPrice} onCheckedChange={setIsCustomPrice} />
                        </div>
                    </div>
                    
                    <div className="relative">
                        <MoneyInput
                            value={isCustomPrice ? customPrice : defaultRoomPrice}
                            onChange={(val) => isCustomPrice && setCustomPrice(val)}
                            className={cn(
                                "text-4xl font-bold text-center w-full py-6 bg-slate-50 rounded-[32px] border-none focus:ring-0 tracking-tight transition-colors",
                                isCustomPrice ? "text-blue-600 bg-blue-50/50" : "text-slate-800 cursor-not-allowed select-none"
                            )}
                            inputClassName="text-4xl font-bold tracking-tight"
                            disabled={!isCustomPrice}
                            centered
                        />
                        {!isCustomPrice && (
                            <div className="absolute inset-0 z-10" />
                        )}
                    </div>
                    
                    {isCustomPrice && (
                        <input
                            type="text"
                            placeholder="Nhập lý do thay đổi giá..."
                            value={customPriceReason}
                            onChange={(e) => setCustomPriceReason(e.target.value)}
                            className="w-full text-sm px-4 py-3 bg-slate-50 rounded-[24px] border-none focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                        />
                    )}
                </div>

                {/* 4. SERVICES */}
                <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1">Dịch vụ</h3>
                    
                    <div className="flex gap-3 overflow-x-auto pb-4 pt-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-1 snap-x snap-mandatory">
                        {availableServices.map(service => {
                            const selected = selectedServices.find(s => s.service.id === service.id);
                            return (
                                <ServiceCard
                                    key={service.id}
                                    service={service}
                                    quantity={selected?.quantity || 0}
                                    onAdd={() => handleAddService(service)}
                                    onRemove={() => handleRemoveService(service.id)}
                                />
                            );
                        })}
                        {availableServices.length === 0 && (
                            <div className="w-full text-center py-8 text-slate-400 italic">
                                Không tìm thấy món nào
                            </div>
                        )}
                    </div>

                    <div className="mt-2 flex items-center justify-center gap-6 text-xs text-slate-400 bg-white p-2 rounded-xl border border-slate-100 mx-auto w-fit shadow-sm">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                            Chạm để thêm
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-300"></span>
                            Giữ để bớt
                        </div>
                        {selectedServices.length > 0 && (
                            <>
                                <div className="w-px h-3 bg-slate-200"></div>
                                <div className="flex items-center gap-2 font-medium text-blue-600">
                                    <span>{servicesCount} món</span>
                                    <span>•</span>
                                    <span>{servicesTotal.toLocaleString()}đ</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* 5. EXTRA PEOPLE */}
                {roomCategory?.extra_person_enabled && (
                    <div className="bg-white rounded-[40px] shadow-sm overflow-hidden">
                        <div className="p-5 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                            <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">Thêm người / Phụ thu</span>
                            <Switch checked={isExtraPeople} onCheckedChange={setIsExtraPeople} />
                        </div>
                        
                        {isExtraPeople && (
                            <div className="p-5 space-y-5 animate-in slide-in-from-top-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-base font-semibold text-slate-600">Người lớn</span>
                                    <div className="flex items-center gap-4">
                                        <button onClick={() => setExtraAdults(Math.max(0, extraAdults - 1))} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-600 transition-colors active:scale-95">
                                            <Minus className="w-5 h-5" />
                                        </button>
                                        <span className="w-8 text-center font-bold text-xl text-slate-800">{extraAdults}</span>
                                        <button onClick={() => setExtraAdults(extraAdults + 1)} className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center hover:bg-blue-100 text-blue-600 transition-colors active:scale-95">
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-base font-semibold text-slate-600">Trẻ em</span>
                                    <div className="flex items-center gap-4">
                                        <button onClick={() => setExtraChildren(Math.max(0, extraChildren - 1))} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-600 transition-colors active:scale-95">
                                            <Minus className="w-5 h-5" />
                                        </button>
                                        <span className="w-8 text-center font-bold text-xl text-slate-800">{extraChildren}</span>
                                        <button onClick={() => setExtraChildren(extraChildren + 1)} className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center hover:bg-blue-100 text-blue-600 transition-colors active:scale-95">
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 6. BILL PREVIEW */}
                <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 pb-3 border-b border-dashed border-slate-200 uppercase tracking-wide">Tạm tính</h3>
                    
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between text-slate-600">
                            <span>Tiền phòng</span>
                            <span className="font-mono font-medium">{formatMoney(finalRoomPrice)}</span>
                        </div>
                        {servicesTotal > 0 && (
                            <div className="flex justify-between text-slate-600">
                                <span>Dịch vụ</span>
                                <span className="font-mono font-medium">{formatMoney(servicesTotal)}</span>
                            </div>
                        )}
                        {surchargeTotal > 0 && (
                            <div className="flex justify-between text-slate-600">
                                <span>Phụ thu thêm người</span>
                                <span className="font-mono font-medium">{formatMoney(surchargeTotal)}</span>
                            </div>
                        )}
                        {debt > 0 && (
                            <div className="flex justify-between text-rose-500 font-medium">
                                <span>Nợ cũ</span>
                                <span className="font-mono">{formatMoney(debt)}</span>
                            </div>
                        )}
                    </div>

                    <div className="border-t border-dashed border-slate-200 pt-4 flex justify-between items-center">
                        <span className="font-bold text-slate-800">Tổng cộng</span>
                        <span className="font-bold text-2xl text-blue-700 font-mono tracking-tight">{formatMoney(totalAmount)}</span>
                    </div>
                </div>

                {/* 7. PREPAYMENT */}
                <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
                    <div className="flex flex-col gap-3">
                        <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">Thanh toán trước (Cọc)</span>
                        <div className="flex gap-2">
                            <MoneyInput
                                value={deposit}
                                onChange={setDeposit}
                                className="flex-1 py-4 px-4 bg-slate-50 rounded-[24px] font-bold text-xl text-slate-800 focus:ring-2 focus:ring-blue-500 border-none outline-none transition-all"
                                placeholder="0"
                            />
                            <button
                                onClick={() => setDeposit(totalAmount)}
                                className="px-4 bg-blue-50 text-blue-600 font-bold rounded-[24px] hover:bg-blue-100 transition-colors text-xs uppercase tracking-wide"
                            >
                                Full Cọc
                            </button>
                        </div>
                    </div>

                    {deposit > 0 && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phương thức thanh toán cọc</span>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('cash')}
                                    className={cn(
                                        "flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs transition-all",
                                        paymentMethod === 'cash'
                                            ? "bg-white text-slate-900 shadow-sm"
                                            : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    TIỀN MẶT
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPaymentMethod('bank')}
                                    className={cn(
                                        "flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs transition-all",
                                        paymentMethod === 'bank'
                                            ? "bg-white text-slate-900 shadow-sm"
                                            : "text-slate-500 hover:text-slate-700"
                                    )}
                                >
                                    CHUYỂN KHOẢN
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Notes textarea */}
                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ghi chú thêm..."
                    className="w-full h-24 rounded-[40px] bg-white p-5 text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 border-none outline-none transition-all resize-none shadow-sm"
                />
            </div>

            {/* --- FOOTER --- */}
            <div className="p-6 bg-white border-t border-slate-100 flex items-center gap-4 z-50">
                <button 
                    onClick={onClose}
                    className="flex-1 py-4 rounded-[24px] font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-wider"
                >
                    Hủy bỏ
                </button>
                <button 
                    onClick={() => handleSubmit()}
                    disabled={isSubmitting}
                    className={cn(
                        "flex-[2] py-4 rounded-[24px] font-bold text-white uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-3",
                        isSubmitting ? "bg-slate-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 active:scale-95"
                    )}
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Đang xử lý...</span>
                        </>
                    ) : (
                        <span>Nhận phòng ngay</span>
                    )}
                </button>
            </div>
            
            {/* Security Modals */}
            {SecurityModals}
            </div>
        </div>,
        document.body
    )
}
