import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Edit3, Calendar, DollarSign, User, Search, AlertCircle, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { bookingService } from '@/services/bookingService';
import { customerService, Customer } from '@/services/customerService';
import { Booking, Room } from '@/types/dashboard';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { cn } from '@/lib/utils';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

interface EditBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking;
  room: Room;
  onSuccess: () => void;
  verifiedStaff?: { id: string, name: string };
}

// Helper to convert UTC date string to Local ISO string for datetime-local input
const toLocalISOString = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const tzOffset = d.getTimezoneOffset() * 60000; // offset in milliseconds
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
};

export default function EditBookingModal({ isOpen, onClose, booking, room, onSuccess, verifiedStaff }: EditBookingModalProps) {
  // State initialization
  const [customerName, setCustomerName] = useState('');
  const [checkInAt, setCheckInAt] = useState('');
  const [customPrice, setCustomPrice] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [priceApplyMode, setPriceApplyMode] = useState<'all' | 'future'>('all');

  // Customer Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const ignoreSearchRef = useRef(false);

  // Close search results when clicking outside
  useOnClickOutside(searchRef as any, () => setShowSearchResults(false));

  // Initialize data when modal opens
  useEffect(() => {
    if (isOpen) {
      // Customer
      setCustomerName(booking.customer_name || '');
      // Don't trigger search immediately on open
      ignoreSearchRef.current = true;
      setSearchTerm(booking.customer_name || '');
      
      setSelectedCustomer(null);
      
      // Fetch current customer details if exists
      if (booking.customer_id) {
        customerService.getCustomerById(booking.customer_id).then(cust => {
            if (cust) {
                setSelectedCustomer(cust);
                setCustomerName(cust.full_name);
                ignoreSearchRef.current = true;
                setSearchTerm(cust.full_name);
            }
        }).catch(console.error);
      }

      // Check In Time - Prefer actual, fallback to scheduled
      const checkInTime = booking.check_in_actual || booking.check_in_at;
      setCheckInAt(toLocalISOString(checkInTime));

      // Price - Prefer custom_price, fallback to Room Price based on booking type
      let defaultPrice = booking.custom_price;
      if (defaultPrice === undefined || defaultPrice === null) {
          switch (booking.booking_type) {
              case 'hourly': defaultPrice = room.price_hourly; break;
              case 'daily': defaultPrice = room.price_daily; break;
              case 'overnight': defaultPrice = room.price_overnight; break;
          }
      }
      setCustomPrice(defaultPrice);

      setReason('');
      setPriceApplyMode('all');
    }
  }, [isOpen, booking, room]);

  // Search Effect
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      // Check if we should ignore this search (e.g. from selection or initial load)
      if (ignoreSearchRef.current) {
          ignoreSearchRef.current = false;
          return;
      }

      if (!searchTerm) {
          setCustomers([]);
          setShowSearchResults(false);
          return;
      }
      
      if (searchTerm.length > 0) {
        setIsSearching(true);
        try {
          const { data } = await customerService.getCustomers({ 
            search: searchTerm, 
            limit: 5 
          });
          setCustomers(data);
          if (data.length > 0) {
             setShowSearchResults(true);
          }
        } catch (error) {
          console.error(error);
        } finally {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const handleSelectCustomer = (customer: Customer) => {
      ignoreSearchRef.current = true; // Prevent search trigger
      setSelectedCustomer(customer);
      setCustomerName(customer.full_name);
      setSearchTerm(customer.full_name);
      setShowSearchResults(false);
      toast.success(`Đã chọn khách: ${customer.full_name}`);
  };

  const handleClearSearch = () => {
      setCustomerName('');
      setSearchTerm('');
      setSelectedCustomer(null);
      setCustomers([]);
      setShowSearchResults(false);
  };

  const handleSubmit = async () => {
    if (!reason) {
      toast.error('Vui lòng nhập lý do thay đổi');
      return;
    }

    setIsSubmitting(true);
    try {
      await bookingService.updateBookingDetails({
        bookingId: booking.id,
        customerName,
        checkInAt: new Date(checkInAt).toISOString(),
        customPrice,
        priceApplyMode,
        reason,
        customerId: selectedCustomer?.id,
        verifiedStaff
      });
      toast.success('Cập nhật thông tin thành công');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi cập nhật');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const debt = selectedCustomer && selectedCustomer.balance < 0 ? Math.abs(selectedCustomer.balance) : 0;

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-200">
              <Edit3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-800 leading-none">Sửa thông tin</h3>
                <span className="px-2 py-0.5 bg-rose-100 text-rose-600 text-[10px] font-bold rounded-full border border-rose-200 uppercase tracking-wide">
                  Nhạy cảm
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 font-medium">Booking #{booking.id.slice(0, 8)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Search Section - Fixed at top of body to avoid clipping */}
        <div className="px-6 pt-6 pb-2 shrink-0 z-50 relative" ref={searchRef}>
             <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2">
              <User className="w-4 h-4" /> Tên khách hàng
            </label>
            <div className="relative">
                <input
                    type="text"
                    value={customerName}
                    onChange={(e) => {
                        setCustomerName(e.target.value);
                        setSearchTerm(e.target.value);
                        // If clearing manually, don't show results? No, typing empty means clear.
                        // But if typing something, show results.
                        // We rely on effect for showing results, but we can optimistically show if we have them?
                        // Better rely on effect to keep state consistent.
                    }}
                    onFocus={() => {
                        if (customers.length > 0 && searchTerm) setShowSearchResults(true);
                    }}
                    className="w-full p-3 pl-10 pr-10 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 outline-none font-medium"
                    placeholder="Nhập tên để tìm kiếm..."
                />
                <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                
                {searchTerm && (
                    <button 
                        onClick={handleClearSearch}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600"
                    >
                        {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    </button>
                )}
            </div>

            {/* Search Results Dropdown - Absolute but relative to this container */}
            {showSearchResults && customers.length > 0 && (
                <div className="absolute top-full left-6 right-6 mt-1 bg-white rounded-xl shadow-2xl border border-slate-100 max-h-48 overflow-y-auto z-[100]">
                    {customers.map(cust => (
                        <div 
                            key={cust.id}
                            onClick={() => handleSelectCustomer(cust)}
                            className="p-3 hover:bg-amber-50 cursor-pointer border-b border-slate-50 last:border-none flex justify-between items-center"
                        >
                            <div>
                                <div className="font-bold text-slate-800">{cust.full_name}</div>
                                <div className="text-xs text-slate-500">{cust.phone || 'Không có SĐT'}</div>
                            </div>
                            {cust.balance < 0 && (
                                <span className="text-xs font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded-lg">
                                    Nợ: {Math.abs(cust.balance).toLocaleString()}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
            
            {/* Debt Warning */}
            {debt > 0 && (
                <div className="flex items-center gap-3 p-3 mt-2 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 animate-in slide-in-from-top-2">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <div className="text-xs">
                        <span className="font-bold block">Cảnh báo nợ xấu</span>
                        Khách đang nợ <span className="font-black text-rose-800">{debt.toLocaleString()}đ</span>
                    </div>
                </div>
            )}
        </div>

        {/* Scrollable Form Content */}
        <div className="p-6 pt-2 space-y-5 overflow-y-auto">
          {/* Check-in Time */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Giờ vào
            </label>
            <input
              type="datetime-local"
              value={checkInAt}
              onChange={(e) => setCheckInAt(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 outline-none font-medium"
            />
          </div>

          {/* Price */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Giá phòng
            </label>
            <MoneyInput
              value={customPrice || 0}
              onChange={setCustomPrice}
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 outline-none font-bold text-amber-600"
            />
            <div className="flex gap-2 mt-2">
                <button 
                    onClick={() => setPriceApplyMode('all')}
                    className={cn(
                        "flex-1 py-2 text-xs font-bold rounded-lg border transition-all",
                        priceApplyMode === 'all' 
                        ? 'bg-amber-50 border-amber-500 text-amber-700' 
                        : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300'
                    )}
                >
                    Áp dụng từ đầu
                </button>
                <button 
                    onClick={() => {
                        setPriceApplyMode('future');
                        toast.info("Tính năng đang phát triển, tạm thời áp dụng từ đầu");
                    }}
                    className={cn(
                        "flex-1 py-2 text-xs font-bold rounded-lg border transition-all",
                        priceApplyMode === 'future' 
                        ? 'bg-amber-50 border-amber-500 text-amber-700' 
                        : 'bg-white border-slate-200 text-slate-500 hover:border-amber-300'
                    )}
                >
                    Áp dụng từ hôm nay
                </button>
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Lý do thay đổi (Bắt buộc)</label>
            <textarea
              className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 outline-none resize-none"
              rows={2}
              placeholder="Nhập lý do..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !reason}
            className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl shadow-lg shadow-amber-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
