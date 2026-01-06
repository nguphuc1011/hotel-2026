'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Edit,
  Printer,
  DollarSign,
  Trash2,
  ChevronDown,
  User,
  Clock,
  Plus,
  Minus,
  Search,
  Save,
  CircleCheck,
  Info,
  LogIn,
  LogOut,
  FileText,
  ShoppingCart,
  Star,
  Coffee,
  Utensils,
  Beer,
  Cigarette,
  Wine,
  Layers,
  DoorOpen,
  X
} from 'lucide-react';
import { NumericInput } from '@/components/ui/NumericInput';
import { Room, Service, Setting } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { calculateRoomPrice } from '@/lib/pricing';
import { supabase } from '@/lib/supabase';
import { useNotification } from '@/context/NotificationContext';
import { format, parseISO, differenceInMinutes, differenceInCalendarDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { EventService } from '@/services/events';
import { HotelService } from '@/services/hotel';
import { useAuth } from '@/context/AuthContext';
import { useCustomerBalance } from '@/hooks/useCustomerBalance';
import CheckoutModal, { CheckoutData } from './CheckOutModal';
import EditBookingModal from './EditBookingModal';

import { PrintableInvoice } from './PrintableInvoice';
import { PrintableDebtReceipt } from './PrintableDebtReceipt';

// Mock data for icons, will be replaced with actual icons
const Icon = ({ name, className }: { name: string; className?: string }) => {
  const icons: { [key: string]: React.ElementType } = {
    'fa-exchange-alt': ArrowRight,
    'fa-pen': Edit,
    'fa-print': Printer,
    'fa-wallet': DollarSign,
    'fa-dollar-sign': DollarSign,
    'fa-trash-alt': Trash2,
    'fa-user-circle': User,
    'fa-clock': Clock,
    'fa-save': Save,
    'fa-check-circle': CircleCheck,
    'fa-door-open': DoorOpen,
  };
  const LucideIcon = icons[name] || Info;
  return <LucideIcon className={cn('w-5 h-5', className)} />;
};

const LogIcon = ({ action }: { action: string }) => {
  const icons: { [key: string]: React.ElementType } = {
    check_in: LogIn,
    check_out: LogOut,
    add_service: ShoppingCart,
    update_booking: Edit,
    payment: DollarSign,
    audit: Star,
    cancel_booking: Trash2,
  };
  const LucideIcon = icons[action] || FileText;
  return <LucideIcon className="w-4 h-4 text-slate-500" />;
};

const ServiceIcon = ({ name }: { name: string }) => {
  const n = name.toLowerCase();
  const iconSize = 24;
  if (n.includes('cà phê') || n.includes('coffee'))
    return <Coffee size={iconSize} className="text-orange-500" />;
  if (n.includes('mì') || n.includes('ăn') || n.includes('phở'))
    return <Utensils size={iconSize} className="text-yellow-600" />;
  if (n.includes('bia') || n.includes('beer'))
    return <Beer size={iconSize} className="text-amber-500" />;
  if (n.includes('thuốc') || n.includes('cigarette'))
    return <Cigarette size={iconSize} className="text-slate-400" />;
  if (n.includes('rượu') || n.includes('wine'))
    return <Wine size={iconSize} className="text-rose-700" />;
  return <ShoppingCart size={iconSize} className="text-blue-400" />;
};

interface FolioModalProps {
  room: Room | null;
  settings: Setting[];
  services: Service[];
  isOpen: boolean;
  onClose: () => void;
  onPayment: (
    bookingId: string,
    finalAmount: number,
    paymentMethod: string,
    surcharge: number,
    auditNote?: string,
    actualPaid?: number
  ) => void;
  onUpdate: () => void;
  onCancel: (bookingId: string) => void;
  isAdmin?: boolean;
  isProcessing?: boolean;
}

export default function FolioModal({
  room,
  settings,
  services,
  isOpen,
  onClose,
  onPayment,
  onUpdate,
  onCancel,
  isAdmin,
  isProcessing = false,
}: FolioModalProps) {
  const [tempServices, setTempServices] = useState<Record<string, number>>({});
  const [isHeroCardExpanded, setIsHeroCardExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isServicesExpanded, setIsServicesExpanded] = useState(true);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositValue, setDepositValue] = useState('');
  const [showChangeRoomModal, setShowChangeRoomModal] = useState(false);
  const [showEditBookingModal, setShowEditBookingModal] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [selectedTargetRoomId, setSelectedTargetRoomId] = useState<string>('');
  const [tick, setTick] = useState(0);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [debtValue, setDebtValue] = useState('');
  const [debtMethod, setDebtMethod] = useState<'cash' | 'bank_transfer' | 'card'>('cash');
  const [debtNote, setDebtNote] = useState('');
  const [isDebtSaving, setIsDebtSaving] = useState(false);
  const [customerBalance, setCustomerBalance] = useState<number | null>(null);
  const [debtHistory, setDebtHistory] = useState<any[]>([]);
  const [printingReceipt, setPrintingReceipt] = useState<any | null>(null);
  const [ledgerChannel, setLedgerChannel] = useState<any | null>(null);

  const { showNotification } = useNotification();
  const { profile } = useAuth();

  // Handle printing debt receipt
  useEffect(() => {
    if (printingReceipt) {
      const timer = setTimeout(() => {
        window.print();
        setPrintingReceipt(null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [printingReceipt]);

  // Tự động làm mới tính toán mỗi phút
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const savedServices = useMemo(() => {
    const servicesUsed = room?.current_booking?.services_used || [];
    return servicesUsed.reduce((acc: Record<string, number>, item: any) => {
      const sid = String(item.service_id || item.id);
      if (sid) acc[sid] = item.quantity;
      return acc;
    }, {});
  }, [room?.current_booking?.services_used]);

  useEffect(() => {
    if (isOpen && room?.current_booking?.customer_id) {
      setTempServices(savedServices);
      
      // Fetch customer balance and debt history
      const fetchCustomerData = async () => {
        const cid = room.current_booking!.customer_id;
        const { data: custData } = await supabase
          .from('customers')
          .select('balance')
          .eq('id', cid)
          .single();
        setCustomerBalance(Number(custData?.balance || 0));

        const { data: transData } = await supabase
          .from('ledger')
          .select('*')
          .eq('customer_id', cid)
          .order('created_at', { ascending: false })
          .limit(5);
        setDebtHistory(transData || []);
      };
      fetchCustomerData();

      // Realtime: subscribe ledger changes for this customer
      const ch = supabase
        .channel(`ledger_folio_${room.current_booking.customer_id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger', filter: `customer_id=eq.${room.current_booking.customer_id}` }, fetchCustomerData)
        .subscribe();
      setLedgerChannel(ch);
    } else {
      setTempServices({});
      setSearchQuery('');
      setIsHeroCardExpanded(false);
      setCustomerBalance(null);
      setDebtHistory([]);
      if (ledgerChannel) {
        supabase.removeChannel(ledgerChannel);
        setLedgerChannel(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, room?.current_booking?.customer_id]); // Re-run when customer changes

  const serviceTotals = useMemo(() => {
    const calcTotal = (serviceList: Record<string, number>) =>
      Object.entries(serviceList).reduce((total, [sid, qty]) => {
        // 1. Tìm trong danh mục dịch vụ hệ thống
        const serviceInfo = services.find((s) => String(s.id) === String(sid));
        if (serviceInfo) return total + serviceInfo.price * qty;

        // 2. Nếu không có trong danh mục (ví dụ: Nợ cũ), tìm trong danh sách dịch vụ đã lưu của booking
        const savedItem = room?.current_booking?.services_used?.find(
          (s: any) => String(s.service_id || s.id) === String(sid)
        );
        return total + (savedItem?.price || 0) * qty;
      }, 0);

    const savedTotal = calcTotal(savedServices);
    const tempTotal = calcTotal(tempServices);

    return {
      saved: savedTotal,
      temp: tempTotal,
      diff: tempTotal - savedTotal,
    };
  }, [tempServices, savedServices, services, room?.current_booking?.services_used]);

  const isDirty = useMemo(() => {
    // Chỉ so sánh các dịch vụ có số lượng > 0
    const cleanTemp = Object.fromEntries(Object.entries(tempServices).filter(([_, q]) => q > 0));
    const cleanSaved = Object.fromEntries(Object.entries(savedServices).filter(([_, q]) => q > 0));
    return JSON.stringify(cleanTemp) !== JSON.stringify(cleanSaved);
  }, [tempServices, savedServices]);

  const pricingBreakdown = useMemo(() => {
    if (!room?.current_booking) return null;

    // Tạo giá ghi đè dựa trên initial_price (giá lúc vào hoặc giá đã sửa)
    const currentType = room.current_booking.rental_type;
    const pricesOverride = { ...room.prices };
    if (room.current_booking.initial_price) {
      pricesOverride[currentType as keyof typeof pricesOverride] =
        room.current_booking.initial_price;
    }

    return calculateRoomPrice(
      room.current_booking.check_in_at,
      new Date(),
      settings,
      room,
      room.current_booking.rental_type,
      serviceTotals.temp,
      room.current_booking.custom_surcharge || 0,
      pricesOverride
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, settings, serviceTotals.temp, tick]);

  const duration = useMemo(() => {
    if (pricingBreakdown?.summary?.duration_text) {
      return pricingBreakdown.summary.duration_text;
    }
    if (!room?.current_booking?.check_in_at) return '0h 0p';
    const start = parseISO(room.current_booking.check_in_at);
    const now = new Date();

    if (room.current_booking.rental_type === 'hourly') {
      const totalMinutes = differenceInMinutes(now, start);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${hours}h ${minutes}p`;
    } else {
      const days = differenceInCalendarDays(now, start);
      return `${Math.max(1, days)} ngày`;
    }
  }, [room?.current_booking?.check_in_at, room?.current_booking?.rental_type, pricingBreakdown]);

  const customerBalanceToDisplay = useMemo(() => {
    if (customerBalance !== null) return customerBalance;
    return Number(room?.current_booking?.customer?.balance || 0);
  }, [customerBalance, room?.current_booking?.customer?.balance]);

  const { isDebt, absFormattedBalance } = useCustomerBalance(customerBalanceToDisplay);
  const hasDebtWarning = isDebt;

  const handleQuantityChange = (serviceId: string | number, newQuantity: number) => {
    const sid = String(serviceId);
    const qty = Math.max(0, newQuantity);
    setTempServices((prev) => ({
      ...prev,
      [sid]: qty,
    }));
  };

  const handleSaveUpdate = async () => {
    const bookingId = room?.current_booking?.id;
    if (!bookingId || isSaving) return;

    // 1. Xác định xem có sự thay đổi giảm (xóa/giảm số lượng) không
    const isReducing = Object.entries(savedServices).some(([sid, savedQty]) => {
      const tempQty = tempServices[sid] || 0;
      return tempQty < savedQty;
    });

    // CHỐT CHẶN: Cấm xóa dịch vụ sau khi đã in nháp (Chỉ Admin/Manager mới được quyền)
    if (isReducing && room.current_booking.is_printed) {
      const canBypass = profile?.role === 'admin' || profile?.role === 'manager';
      if (!canBypass) {
        showNotification(
          'CẤM XÓA: Folio đã được in nháp. Chỉ Quản lý/Admin mới có quyền xóa/giảm dịch vụ lúc này!',
          'error'
        );
        // Reset tempServices về trạng thái đã lưu
        setTempServices(savedServices);
        return;
      }
    }

    let reason = '';
    if (isReducing) {
      reason =
        window.prompt(
          'Phát hiện hành động GIẢM số lượng dịch vụ. Vui lòng nhập lý do (bắt buộc):'
        ) || '';
      if (!reason.trim()) {
        showNotification('Bắt buộc phải có lý do khi giảm số lượng dịch vụ!', 'error');
        return;
      }
    }

    setIsSaving(true);
    try {
      const updatedServicesArray = Object.entries(tempServices)
        .filter(([_, qty]) => qty > 0)
        .map(([sid, qty]) => {
          const s = services.find((srv) => String(srv.id) === String(sid));
          const savedS = room.current_booking?.services_used?.find(
            (ss: any) => String(ss.service_id || ss.id) === String(sid)
          );

          const price = s?.price || savedS?.price || 0;
          const name = s?.name || savedS?.name || 'Dịch vụ';

          return {
            id: sid,
            service_id: sid,
            name,
            price,
            quantity: qty,
            total: price * qty,
          };
        });

      const { error } = await supabase
        .from('bookings')
        .update({ services_used: updatedServicesArray })
        .eq('id', bookingId);

      if (error) throw error;

      // 2. Ghi log sự kiện (Móng ngầm)
      await EventService.emit({
        type: 'SERVICE_UPDATE',
        entity_type: 'booking',
        entity_id: bookingId,
        action: isReducing ? 'Giảm/Xóa dịch vụ' : 'Cập nhật dịch vụ',
        old_value: savedServices,
        new_value: tempServices,
        reason: reason,
        severity: isReducing ? 'warning' : 'info',
      });

      const newTemp: Record<string, number> = {};
      updatedServicesArray.forEach((s) => {
        newTemp[String(s.id)] = s.quantity;
      });
      setTempServices(newTemp);

      showNotification('Đã lưu cập nhật dịch vụ', 'success');
      if (onUpdate) onUpdate();
      onClose(); // Đóng tất cả modal về sơ đồ phòng
    } catch (error: any) {
      showNotification(`Lỗi khi lưu: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = async () => {
    if (!room?.current_booking?.id) return;

    // Đánh dấu đã in nháp để kích hoạt chốt chặn gian lận
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ is_printed: true })
        .eq('id', room.current_booking.id);

      if (error) throw error;

      // Cập nhật local state để UI phản ứng ngay lập tức nếu cần
      if (onUpdate) onUpdate();

      window.print();
    } catch (error: any) {
      showNotification(`Lỗi khi đánh dấu in: ${error.message}`, 'error');
    }
  };

  const handleDepositSubmit = async () => {
    if (!room?.current_booking || !depositValue) return;

    const amount = parseInt(depositValue.replace(/\D/g, ''), 10);
    if (isNaN(amount) || amount <= 0) {
      showNotification('Số tiền không hợp lệ', 'error');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('handle_deposit', {
        p_booking_id: room.current_booking.id,
        p_amount: amount,
        p_method: 'CASH', // Default to cash for now
        p_notes: `Thu thêm tiền cọc tại Folio phòng ${room.room_number}`
      });

      if (error) throw error;
      if (data?.success === false) throw new Error(data.message);

      showNotification(`Đã cộng thêm ${formatCurrency(amount)} vào tiền cọc`, 'success');
      setShowDepositModal(false);
      setDepositValue('');
      if (onUpdate) onUpdate();
    } catch (error: any) {
      showNotification(`Lỗi thu cọc: ${error.message}`, 'error');
    }
  };

  const openDebtModal = async () => {
    if (!room?.current_booking?.customer_id) {
      showNotification('Khách vãng lai không thể thu nợ', 'error');
      return;
    }
    // Refresh data before opening
    const cid = room.current_booking.customer_id;
    const { data: custData } = await supabase.from('customers').select('balance').eq('id', cid).single();
    const bal = Number(custData?.balance || 0);
    setCustomerBalance(bal);
    
    const { data: transData } = await supabase.from('ledger').select('*').eq('customer_id', cid).order('created_at', { ascending: false }).limit(5);
    setDebtHistory(transData || []);

    const defaultAmount = bal < 0 ? Math.abs(bal) : 0;
    setDebtValue(String(defaultAmount));
    setDebtMethod('cash');
    setDebtNote('');
    setShowDebtModal(true);
  };

  const handleDebtSubmit = async () => {
    if (!room?.current_booking?.customer_id) return;
    const amount = parseInt(String(debtValue).replace(/\D/g, ''), 10);
    if (isNaN(amount) || amount <= 0) {
      showNotification('Số tiền không hợp lệ', 'error');
      return;
    }
    setIsDebtSaving(true);
    try {
      // Optimistic update: cập nhật số dư ngay trên UI
      const prevBalance = customerBalanceToDisplay;
      const nextBalance = prevBalance + amount;
      setCustomerBalance(nextBalance);
      setDebtHistory((hist) => [
        {
          id: 'optimistic-' + Math.random().toString(36).slice(2),
          type: 'PAYMENT',
          category: 'DEBT_COLLECTION',
          amount,
          description: debtNote || 'Thu nợ',
          created_at: new Date().toISOString(),
        },
        ...hist,
      ]);

      const methodMap: Record<string, string> = {
        cash: 'CASH',
        bank_transfer: 'BANK_TRANSFER',
        card: 'CARD'
      };
      
      const rpc = await HotelService.payDebt({
        customerId: room.current_booking.customer_id,
        amount: amount,
        method: methodMap[debtMethod] || 'CASH',
        note: debtNote || '',
        bookingId: room.current_booking.id
      });
      if (rpc?.success === false) {
        throw new Error(rpc?.message || 'Thu nợ thất bại');
      }
      
      showNotification(`Đã thu nợ ${formatCurrency(amount)}`, 'success');
      
      // Update local data immediately
      const cid = room.current_booking.customer_id;
      const { data: custData } = await supabase.from('customers').select('balance').eq('id', cid).single();
      setCustomerBalance(Number(custData?.balance || 0));

      const { data: transData } = await supabase.from('ledger').select('*').eq('customer_id', cid).order('created_at', { ascending: false }).limit(5);
      setDebtHistory(transData || []);

      setShowDebtModal(true); // Keep modal open to show history or close it? User said "Thao tác phải diễn ra trên 1 màn hình duy nhất"
      setShowDebtModal(false);
      setDebtValue('');
      setDebtNote('');
      if (onUpdate) onUpdate();
    } catch (error: any) {
      // Revert optimistic if failed
      const cid = room.current_booking.customer_id;
      const { data: custData } = await supabase.from('customers').select('balance').eq('id', cid).single();
      setCustomerBalance(Number(custData?.balance || customerBalanceToDisplay));
      setDebtHistory((hist) => hist.filter((h) => !(typeof h.id === 'string' && h.id.startsWith('optimistic-'))));
      showNotification(`Lỗi thu nợ: ${error.message}`, 'error');
    } finally {
      setIsDebtSaving(false);
    }
  };

  const handleFetchAvailableRooms = async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('status', 'available')
        .order('room_number');

      if (error) throw error;
      setAvailableRooms(data || []);
      setShowChangeRoomModal(true);
    } catch (error: any) {
      showNotification(`Lỗi tải danh sách phòng: ${error.message}`, 'error');
    }
  };

  const handleChangeRoomSubmit = async () => {
    if (!room?.current_booking || !selectedTargetRoomId) return;

    const targetRoomObj = availableRooms.find((r) => r.id === selectedTargetRoomId);
    const reason =
      window.prompt(
        `Xác nhận đổi phòng từ ${room.room_number} sang ${targetRoomObj?.room_number}. Vui lòng nhập lý do:`
      ) || '';
    if (!reason.trim()) {
      showNotification('Bắt buộc phải có lý do khi đổi phòng!', 'error');
      return;
    }

    try {
      // Check if target room is still available
      const { data: targetRoom, error: targetRoomError } = await supabase
        .from('rooms')
        .select('status')
        .eq('id', selectedTargetRoomId)
        .single();

      if (targetRoomError) throw targetRoomError;
      if (targetRoom.status !== 'available') {
        showNotification('Phòng đích không còn trống. Vui lòng chọn phòng khác.', 'error');
        handleFetchAvailableRooms(); // Refresh the list
        return;
      }

      // 1. Update booking: room_id -> new room
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({ room_id: selectedTargetRoomId })
        .eq('id', room.current_booking.id);

      if (bookingError) throw bookingError;

      // 2. Update old room: dirty, no booking
      const { error: oldRoomError } = await supabase
        .from('rooms')
        .update({
          status: 'dirty',
          current_booking_id: null,
          last_status_change: new Date().toISOString(),
        })
        .eq('id', room.id);

      if (oldRoomError) throw oldRoomError;

      // 3. Update new room: occupied, booking_id
      const { error: newRoomError } = await supabase
        .from('rooms')
        .update({
          status: 'occupied',
          current_booking_id: room.current_booking.id,
        })
        .eq('id', selectedTargetRoomId);

      if (newRoomError) throw newRoomError;

      // 4. Ghi log sự kiện (Móng ngầm)
      await EventService.emit({
        type: 'ROOM_CHANGE',
        entity_type: 'booking',
        entity_id: room.current_booking.id,
        action: 'Đổi phòng',
        reason: reason,
        old_value: { room_id: room.id, room_number: room.room_number },
        new_value: { room_id: selectedTargetRoomId, room_number: targetRoomObj?.room_number },
        severity: 'info',
      });

      showNotification('Đã đổi phòng thành công', 'success');
      setShowChangeRoomModal(false);
      onClose(); // Close folio modal as the room changed
      if (onUpdate) onUpdate();

      // Gửi thông báo hệ thống (Mắt Thần)
      // eslint-disable-next-line no-console
      HotelService.notifySystemChange('room_change', selectedTargetRoomId).catch(console.error);
    } catch (error: any) {
      showNotification(`Lỗi đổi phòng: ${error.message}`, 'error');
    }
  };

  const handleEditBookingSave = async (data: {
    check_in_at: string;
    initial_price: number;
    price_change_type: 'from_start' | 'from_today';
    customer_name: string;
  }) => {
    if (!room?.current_booking) return;

    // Kiểm tra xem có thay đổi quan trọng không
    const isPriceChanged = data.initial_price !== (room.current_booking.initial_price || 0);
    const isTimeChanged = data.check_in_at !== room.current_booking.check_in_at;

    let reason = '';
    if (isPriceChanged || isTimeChanged) {
      reason =
        window.prompt(
          `Phát hiện thay đổi ${isPriceChanged ? 'GIÁ' : ''}${isPriceChanged && isTimeChanged ? ' và ' : ''}${isTimeChanged ? 'THỜI GIAN' : ''}. Vui lòng nhập lý do (bắt buộc):`
        ) || '';
      if (!reason.trim()) {
        showNotification('Bắt buộc phải có lý do khi sửa đổi thông tin quan trọng!', 'error');
        return;
      }
    }

    try {
      const updates: any = {
        check_in_at: data.check_in_at,
        initial_price: data.initial_price,
      };

      const oldValues = {
        check_in_at: room.current_booking.check_in_at,
        initial_price: room.current_booking.initial_price,
        customer_name: room.current_booking.customer?.full_name,
      };

      // Handle "from today" logic
      if (data.price_change_type === 'from_today') {
        // ... (existing logic)
        const targetCheckIn = data.check_in_at;
        const now = new Date();
        const oldPricesOverride = { ...room.prices };
        oldPricesOverride[room.current_booking.rental_type as keyof typeof oldPricesOverride] =
          room.current_booking.initial_price || 0;

        const currentPricing = calculateRoomPrice(
          targetCheckIn,
          now,
          settings,
          room,
          room.current_booking.rental_type,
          0,
          0,
          oldPricesOverride
        );
        const newPricesOverride = { ...room.prices };
        newPricesOverride[room.current_booking.rental_type as keyof typeof newPricesOverride] =
          data.initial_price;
        const newPricing = calculateRoomPrice(
          targetCheckIn,
          now,
          settings,
          room,
          room.current_booking.rental_type,
          0,
          0,
          newPricesOverride
        );
        const diff = currentPricing.room_charge - newPricing.room_charge;
        updates.custom_surcharge = (room.current_booking.custom_surcharge || 0) + diff;
      }

      // 4. Update booking
      const { error: bookingError } = await supabase
        .from('bookings')
        .update(updates)
        .eq('id', room.current_booking.id);

      if (bookingError) throw bookingError;

      // 5. Update customer name if changed
      if (room.current_booking.customer_id) {
        await supabase
          .from('customers')
          .update({ full_name: data.customer_name })
          .eq('id', room.current_booking.customer_id);
      }

      // 6. Ghi log sự kiện (Móng ngầm)
      if (isPriceChanged || isTimeChanged) {
        await EventService.emit({
          type: 'PRICE_UPDATE',
          entity_type: 'booking',
          entity_id: room.current_booking.id,
          action: 'Sửa giá/thời gian phòng',
          old_value: oldValues,
          new_value: { ...updates, customer_name: data.customer_name },
          reason: reason,
          severity: 'warning',
        });
      }

      showNotification('Đã cập nhật thông tin và tính toán lại tiền', 'success');
      setShowEditBookingModal(false);
      if (onUpdate) onUpdate();

      // Gửi thông báo hệ thống (Mắt Thần)
      if (isPriceChanged || isTimeChanged) {
        // eslint-disable-next-line no-console
        HotelService.notifySystemChange('booking_edit', room.id).catch(console.error);
      }
    } catch (error: any) {
      showNotification(`Lỗi cập nhật: ${error.message}`, 'error');
    }
  };

  const filteredServices = useMemo(() => {
    if (!searchQuery) return services;
    return services.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery, services]);

  const deposit = room?.current_booking?.deposit_amount || 0;

  // Calculate stable display amounts to avoid flashing during recalculation
  const displayPricing = useMemo(() => {
    if (!pricingBreakdown) return { base: 0, diff: serviceTotals.diff };

    // Base amount is everything EXCEPT the current temporary services
    // This includes Room Charge, Surcharges, Saved Services, Merged Bookings, and Old Debt
    const roomAndSurcharges =
      pricingBreakdown.total_amount -
      pricingBreakdown.service_charge -
      (pricingBreakdown.tax_details?.service_tax || 0);

    const mergedTotal =
      room?.current_booking?.merged_bookings?.reduce((sum, mb) => sum + mb.amount, 0) || 0;
    
    // balance < 0: Nợ, balance > 0: Dư
    const baseAmount = roomAndSurcharges + serviceTotals.saved + mergedTotal - deposit - customerBalanceToDisplay;

    return {
      base: baseAmount,
      diff: serviceTotals.diff,
    };
  }, [
    pricingBreakdown,
    serviceTotals.saved,
    serviceTotals.diff,
    deposit,
    room?.current_booking?.merged_bookings,
    customerBalanceToDisplay,
  ]);

  const finalAmount = (pricingBreakdown?.total_amount || 0) - deposit - customerBalanceToDisplay;

  return (
    <>
      <AnimatePresence>
        {isOpen && room && room.current_booking && (
          <div
            key="folio-modal-main"
            className="fixed inset-0 z-[9999] flex items-center justify-center"
          >
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
              <header className="sticky top-0 bg-white border-b border-slate-100 pt-4 pb-4 px-4 z-10 flex items-center justify-center relative min-h-[80px]">
                <button
                  onClick={onClose}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center hover:bg-slate-100 transition-colors"
                >
                  <X size={20} className="text-slate-400" />
                </button>

                <div className="text-center">
                  <h2 className="font-black text-2xl text-slate-800 uppercase tracking-tight">
                    Chi tiết phòng
                  </h2>
                  <p className="text-slate-400 font-bold text-[10px] tracking-[0.2em] uppercase mt-1">
                    Phòng {room.room_number}
                  </p>
                </div>

                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <Printer size={18} />
                  </button>
                </div>
              </header>

              {/* Body */}
              <main className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Quick Action Grid */}
                <div className="grid grid-cols-5 gap-3 text-center print:hidden">
                  {[
                    {
                      label: 'Đổi phòng',
                      icon: 'fa-exchange-alt',
                      action: handleFetchAvailableRooms,
                    },
                    { label: 'Sửa', icon: 'fa-pen', action: () => setShowEditBookingModal(true) },
                    { label: 'In', icon: 'fa-print', action: handlePrint },
                    {
                      label: 'Cọc',
                      icon: 'fa-wallet',
                      action: () => {
                        setDepositValue('');
                        setShowDepositModal(true);
                      },
                    },
                    {
                      label: 'Hủy',
                      icon: 'fa-trash-alt',
                      action: () => onCancel(room.current_booking!.id),
                      color: 'text-rose-500',
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      onClick={item.action}
                      className="flex flex-col items-center gap-1 cursor-pointer"
                    >
                      <div
                        className={`w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm ${item.color || 'text-slate-600'}`}
                      >
                        <Icon name={item.icon} />
                      </div>
                      <span className="text-xs font-bold text-slate-500">{item.label}</span>
                    </div>
                  ))}
                </div>

                {customerBalanceToDisplay !== 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "mb-4 rounded-3xl p-4 flex items-center gap-4 shadow-lg border",
                      isDebt ? "bg-rose-600 border-rose-500 text-white" : "bg-emerald-600 border-emerald-500 text-white"
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                      {isDebt ? <AlertTriangle size={20} className="text-white animate-pulse" /> : <DollarSign size={20} className="text-white" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black uppercase tracking-widest leading-none">
                        {isDebt ? 'Nợ cũ' : 'Tiền dư'}
                      </p>
                      <p className="text-lg font-black tracking-tight">
                        {absFormattedBalance}
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Hero Summary Card */}
                <div
                  className="bg-indigo-700 text-white rounded-[2.5rem] p-6 shadow-2xl cursor-pointer"
                  onClick={() => setIsHeroCardExpanded(!isHeroCardExpanded)}
                >
                  <div className="relative z-10 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <p className="text-[10px] text-indigo-200 font-black uppercase tracking-[0.2em]">
                        Tổng phải thu
                      </p>
                      <motion.div animate={{ rotate: isHeroCardExpanded ? 180 : 0 }}>
                        <ChevronDown size={14} className="text-indigo-300" />
                      </motion.div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <p
                          className={cn(
                            'font-black tracking-tighter transition-all duration-300',
                            isDirty && displayPricing.diff !== 0
                              ? 'text-4xl opacity-90'
                              : 'text-5xl'
                          )}
                        >
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
                            <span className="font-bold">
                              {format(
                                parseISO(room.current_booking.check_in_at),
                                'HH:mm dd/MM/yyyy'
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-bold text-indigo-200">Tiền phòng</span>
                            <span className="font-bold">
                              {formatCurrency(pricingBreakdown?.room_charge || 0)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-bold text-indigo-200">Tiền dịch vụ</span>
                            <span className="font-bold">{formatCurrency(serviceTotals.temp)}</span>
                          </div>

                          {/* Customer Balance / Old Debt */}
                          {customerBalanceToDisplay !== 0 && (
                            <div className="flex justify-between">
                              <span className="font-bold text-indigo-200">
                                {customerBalanceToDisplay < 0 ? 'Nợ cũ' : 'Tiền dư'}
                              </span>
                              <span className={cn("font-bold", customerBalanceToDisplay < 0 ? "text-rose-300" : "text-emerald-300")}>
                                {customerBalanceToDisplay < 0 ? '+' : ''}{formatCurrency(Math.abs(customerBalanceToDisplay))}
                              </span>
                            </div>
                          )}

                          {/* Merged Bookings */}
                          {room.current_booking.merged_bookings &&
                            room.current_booking.merged_bookings.length > 0 && (
                              <div className="pt-2 space-y-2 border-t border-white/10">
                                <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">
                                  Tiền gộp từ phòng khác
                                </p>
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
                              <span className="font-bold text-emerald-300">
                                -{formatCurrency(deposit)}
                              </span>
                            </div>
                          )}

                          {/* Notes Boxes */}
                          <div className="grid grid-cols-2 gap-3 pt-4">
                            <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-black uppercase text-indigo-200">
                                  Khách hàng
                                </span>
                                <Edit size={10} className="text-indigo-300" />
                              </div>
                              <p className="text-xs text-white/80 line-clamp-2 italic">
                                {room.current_booking.customer?.notes || 'Không có ghi chú...'}
                              </p>
                            </div>
                            <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-black uppercase text-indigo-200">
                                  Phòng
                                </span>
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
                    <Search
                      size={20}
                      className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Tìm dịch vụ..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-14 pl-14 pr-6 bg-white rounded-full border border-slate-100 shadow-sm text-slate-900 font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>

                  {/* Catalog */}
                  <div className="flex overflow-x-auto gap-3 pb-8 pt-6 px-4 -mx-4 scrollbar-hide">
                    {filteredServices.map((service, idx) => (
                      <div
                        key={service.id || `service-${idx}`}
                        onClick={() =>
                          handleQuantityChange(
                            service.id,
                            (tempServices[String(service.id)] || 0) + 1
                          )
                        }
                        onContextMenu={(e) => {
                          e.preventDefault();
                          handleQuantityChange(
                            service.id,
                            Math.max(0, (tempServices[String(service.id)] || 0) - 1)
                          )
                        }}
                        className="relative flex-shrink-0 w-28 text-center bg-white p-4 rounded-[2rem] shadow-sm cursor-pointer hover:bg-slate-50 transition-colors border border-slate-100"
                      >
                        <div className="mb-2 flex justify-center">
                          <ServiceIcon name={service.name} />
                        </div>
                        <p className="font-bold text-[11px] text-slate-700 line-clamp-1">
                          {service.name}
                        </p>
                        <p className="font-black text-green-600 text-[10px]">
                          {formatCurrency(service.price)}
                        </p>
                        {(tempServices[String(service.id)] || 0) -
                          (savedServices[String(service.id)] || 0) >
                          0 && (
                          <div className="absolute -top-2 -right-1 min-w-[28px] h-7 px-2 bg-indigo-600 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-lg border-2 border-white z-20">
                            {(tempServices[String(service.id)] || 0) -
                              (savedServices[String(service.id)] || 0)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-center gap-4 py-2 opacity-40">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-lg bg-slate-200 flex items-center justify-center text-slate-500">
                        <Plus size={10} strokeWidth={3} />
                      </div>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Chạm để thêm</span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-slate-300" />
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-lg bg-slate-200 flex items-center justify-center text-slate-500">
                        <Trash2 size={10} strokeWidth={3} />
                      </div>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Giữ để bớt</span>
                    </div>
                  </div>

                  {/* Dịch vụ đã chọn */}
                  <div>
                    <div
                      className="flex items-center justify-between mb-2 cursor-pointer"
                      onClick={() => setIsServicesExpanded(!isServicesExpanded)}
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-500 uppercase text-xs tracking-wider">
                          Dịch vụ đã chọn
                        </h3>
                        <div className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          {Object.values(tempServices).filter((q) => q > 0).length}
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
                            .sort(([idA], [idB]) => {
                              if (idA === 'debt-carry') return -1;
                              if (idB === 'debt-carry') return 1;
                              return 0;
                            })
                            .map(([serviceId, quantity], idx) => {
                              // Chuẩn hóa so sánh ID để đảm bảo luôn tìm thấy service
                              const serviceInfo = services.find(
                                (s) => String(s.id) === String(serviceId)
                              );

                              // Nếu không tìm thấy trong danh sách services, thử tìm trong chính booking.services_used
                              const savedService = room.current_booking?.services_used?.find(
                                (s) => String(s.service_id || s.id) === String(serviceId)
                              );

                              const name = serviceInfo?.name || savedService?.name || 'Dịch vụ';
                              const price = serviceInfo?.price || savedService?.price || 0;
                              const savedQty = savedServices[serviceId] || 0;
                              const diff = quantity - savedQty;

                              return (
                                <motion.div
                                  key={serviceId || `sel-service-${idx}`}
                                  className="bg-white p-3 rounded-2xl flex items-center gap-3 shadow-sm border border-slate-100"
                                  drag="x"
                                  dragConstraints={{ left: -80, right: 80 }}
                                  onDragEnd={(_, info) => {
                                    if (info.offset.x < -60) {
                                      // Vuốt trái: Xóa/Hủy dịch vụ khỏi danh sách
                                      handleQuantityChange(serviceId, 0);
                                      handleSaveUpdate();
                                    } else if (info.offset.x > 60) {
                                      // Vuốt phải: Thanh toán nhanh -> mở Checkout
                                      setIsCheckoutOpen(true);
                                    }
                                  }}
                                >
                                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                                    <ServiceIcon name={name} />
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <p className="font-bold text-slate-800">{name}</p>
                                      {diff !== 0 && (
                                        <span
                                          className={cn(
                                            'text-[10px] font-black px-1.5 py-0.5 rounded-md',
                                            diff > 0
                                              ? 'bg-blue-50 text-blue-600'
                                              : 'bg-red-50 text-red-600'
                                          )}
                                        >
                                          {diff > 0 ? `+${diff}` : diff}
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
                                    <span className="font-black text-sm w-5 text-center">
                                      {quantity}
                                    </span>
                                    <button
                                      onClick={() => handleQuantityChange(serviceId, quantity + 1)}
                                      className="w-7 h-7 rounded-lg bg-slate-800 text-white shadow-sm flex items-center justify-center active:scale-90 transition-transform"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                </motion.div>
                              );
                            })}

                          {Object.values(tempServices).every((q) => q === 0) && (
                            <div className="text-center py-8 bg-white rounded-2xl border-2 border-dashed border-slate-100">
                              <ShoppingCart className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                              <p className="text-xs font-bold text-slate-400">
                                Chưa có dịch vụ nào
                              </p>
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
                  {room.current_booking.logs
                    ?.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
                    .map((log, index) => (
                      <div key={index} className="flex items-start gap-3 text-sm">
                        <div className="bg-slate-100 rounded-full p-2 mt-1">
                          <LogIcon action={log.action} />
                        </div>
                        <div className="flex-1">
                          <p className="text-slate-600">
                            <span className="font-bold text-slate-800">Hệ thống</span> {log.detail}
                            <span className="text-xs text-slate-400 ml-2">
                              {format(new Date(log.time), 'HH:mm dd/MM/yy')}
                            </span>
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
                    'w-full h-16 rounded-2xl font-black text-lg text-white flex items-center justify-center gap-2 transition-colors duration-300',
                    isDirty ? 'bg-indigo-600 animate-pulse' : 'bg-rose-600'
                  )}
                >
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={isDirty ? 'save' : 'pay'}
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
      </AnimatePresence>

      {room && room.current_booking && (
        <>
          <EditBookingModal
            isOpen={showEditBookingModal}
            onClose={() => setShowEditBookingModal(false)}
            booking={room.current_booking}
            room={room}
            onSave={handleEditBookingSave}
          />

          <CheckoutModal
            key="checkout-modal"
            isOpen={isCheckoutOpen}
            onClose={() => setIsCheckoutOpen(false)}
            room={room}
            pricingBreakdown={pricingBreakdown}
            isAdmin={isAdmin}
            isProcessing={isProcessing}
            onConfirm={(data: CheckoutData) => {
              const auditParts = [
                `Thanh toán: ${data.paymentMethod.toUpperCase()}`,
                `Phụ thu: ${formatCurrency(data.surcharge)}`,
                `Giảm giá: ${formatCurrency(data.discount)} ${data.discountReason ? `(${data.discountReason})` : ''}`,
                `VAT: ${data.isTaxEnabled ? data.taxPercent + '%' : 'Không'}`,
                data.note ? `Ghi chú: ${data.note}` : '',
              ].filter(Boolean);
              const auditNote = auditParts.join(' | ');
              onPayment(
                room.current_booking!.id,
                data.totalToCollect,
                data.paymentMethod,
                data.surcharge,
                auditNote,
                data.actualPaid
              );
              setIsCheckoutOpen(false);
            }}
          />

          {/* Deposit Modal */}
          {showDepositModal && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-black text-xl text-slate-800 uppercase tracking-tight">
                    Cập nhật cọc
                  </h3>
                  <button
                    onClick={() => setShowDepositModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-slate-400" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                      Số tiền cọc
                    </p>
                    <div className="flex items-baseline gap-1">
                      <NumericInput
                        value={parseInt(depositValue.replace(/\D/g, '') || '0')}
                        onChange={(val) => setDepositValue(String(val))}
                        className="w-full text-3xl font-black text-emerald-600 border-none p-0 focus:ring-0 bg-transparent"
                        suffix="đ"
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleDepositSubmit}
                    disabled={isSaving}
                    className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-wider shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isSaving ? 'ĐANG LƯU...' : 'XÁC NHẬN'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showDebtModal && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-black text-xl text-slate-800 uppercase tracking-tight">
                    Thu nợ
                  </h3>
                  <button
                    onClick={() => setShowDebtModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-slate-400" />
                  </button>
                </div>
                <div className="space-y-6">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                      Số tiền thu
                    </p>
                    <div className="flex items-baseline gap-1">
                      <NumericInput
                        value={parseInt(String(debtValue).replace(/\D/g, '') || '0')}
                        onChange={(val) => setDebtValue(String(val))}
                        className="w-full text-3xl font-black text-emerald-600 border-none p-0 focus:ring-0 bg-transparent"
                        suffix="đ"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                      Phương thức
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setDebtMethod('cash')}
                        className={cn(
                          'py-2 rounded-xl font-bold text-sm',
                          debtMethod === 'cash' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'
                        )}
                      >
                        Tiền mặt
                      </button>
                      <button
                        onClick={() => setDebtMethod('bank_transfer')}
                        className={cn(
                          'py-2 rounded-xl font-bold text-sm',
                          debtMethod === 'bank_transfer' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'
                        )}
                      >
                        Chuyển khoản
                      </button>
                      <button
                        onClick={() => setDebtMethod('card')}
                        className={cn(
                          'py-2 rounded-xl font-bold text-sm',
                          debtMethod === 'card' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'
                        )}
                      >
                        Thẻ
                      </button>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">
                      Ghi chú
                    </p>
                    <input
                      value={debtNote}
                      onChange={(e) => setDebtNote(e.target.value)}
                      placeholder="Ví dụ: Thu nợ kỳ trước"
                      className="w-full h-12 px-3 bg-white rounded-xl border border-slate-200 text-slate-900 font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                  <button
                    onClick={handleDebtSubmit}
                    disabled={isDebtSaving}
                    className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-wider shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {isDebtSaving ? 'ĐANG LƯU...' : 'XÁC NHẬN'}
                  </button>

                  {debtHistory.length > 0 && (
                    <div className="pt-6 border-t border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">
                        Lịch sử thanh toán gần đây
                      </p>
                      <div className="space-y-2">
                        {debtHistory.map((trans) => (
                          <div key={trans.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                            <div>
                               <p className="text-xs font-bold text-slate-700">{formatCurrency(trans.amount)}</p>
                               <p className="text-[10px] text-slate-400">{format(new Date(trans.created_at), 'HH:mm dd/MM/yyyy')}</p>
                            </div>
                            <div className="flex items-center gap-2">
                               <span className="text-[10px] font-bold text-slate-500 uppercase">{trans.method}</span>
                               <button 
                                  onClick={() => setPrintingReceipt(trans)} 
                                  className="p-1.5 hover:bg-slate-200 rounded-full text-slate-500"
                                  title="In biên lai"
                               >
                                  <Printer size={14} />
                               </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Change Room Modal */}
          {showChangeRoomModal && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-in fade-in zoom-in duration-200 max-h-[80vh] flex flex-col">
                <h3 className="text-lg font-bold text-slate-800 mb-4 text-center">
                  Chọn phòng mới
                </h3>

                <div className="flex-1 overflow-y-auto min-h-0 space-y-2 mb-6">
                  {availableRooms.length === 0 ? (
                    <p className="text-center text-slate-500 italic py-4">Không có phòng trống</p>
                  ) : (
                    availableRooms.map((r) => (
                      <div
                        key={r.id}
                        onClick={() => setSelectedTargetRoomId(r.id)}
                        className={cn(
                          'p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between',
                          selectedTargetRoomId === r.id
                            ? 'border-indigo-600 bg-indigo-50'
                            : 'border-slate-100 hover:border-slate-300'
                        )}
                      >
                        <span className="font-bold text-slate-700">Phòng {r.room_number}</span>
                        {selectedTargetRoomId === r.id && (
                          <CircleCheck className="text-indigo-600" size={20} />
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-3 mt-auto">
                  <button
                    onClick={() => {
                      setShowChangeRoomModal(false);
                      setSelectedTargetRoomId('');
                    }}
                    className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleChangeRoomSubmit}
                    disabled={!selectedTargetRoomId}
                    className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Xác nhận
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Hidden Printable Area */}
          <div className="hidden print:block fixed inset-0 bg-white z-[99999]">
            {printingReceipt ? (
            <PrintableDebtReceipt 
              customerName={room.current_booking.customer?.full_name || 'Khách hàng'}
              amount={printingReceipt.amount}
              paymentMethod={printingReceipt.method}
              note={printingReceipt.notes}
              transactionId={printingReceipt.id}
              transactionDate={printingReceipt.created_at}
              cashierName={printingReceipt.cashier}
            />
          ) : (
            <PrintableInvoice
              room={room}
              booking={room.current_booking}
              services={room.current_booking.services_used}
              pricing={pricingBreakdown}
              totalServiceCost={serviceTotals.temp}
              totalAmount={finalAmount}
            />
          )}
          </div>
        </>
      )}
    </>
  );
}
