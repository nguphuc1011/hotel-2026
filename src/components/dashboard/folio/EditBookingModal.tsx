import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Edit3, Calendar, DollarSign, User, Search, AlertCircle, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { bookingService, UpdateBookingDetailsParams } from '@/services/bookingService';
import { customerService, Customer } from '@/services/customerService';
import { Booking, Room } from '@/types/dashboard';
import { formatMoney } from '@/utils/format';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { cn } from '@/lib/utils';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';

interface EditBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null | undefined;
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
  const [notes, setNotes] = useState('');

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
    if (isOpen && booking) {
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
      setNotes(booking.notes || '');
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
      if (!booking) return;

      let finalCustomerId = selectedCustomer?.id;

      // Handle New Customer Creation (Same as CheckInModal)
      // Logic: If no customer selected AND name is typed AND name is different from original
      const isNewName = searchTerm.trim() && searchTerm !== booking.customer_name;
      
      if (!finalCustomerId && isNewName && !selectedCustomer) {
          console.log('Creating new customer for name:', searchTerm);
          const newCustomer = await customerService.createCustomer({
              full_name: searchTerm,
              balance: 0
          });
          if (newCustomer) {
              finalCustomerId = newCustomer.id;
              toast.success(`Đã tạo khách hàng mới: ${newCustomer.full_name}`);
          } else {
              console.error('Failed to create new customer');
          }
      }

      const payload: UpdateBookingDetailsParams = {
        bookingId: booking.id,
        customerName: finalCustomerId ? undefined : searchTerm || customerName,
        checkInAt: new Date(checkInAt).toISOString(),
        customPrice,
        priceApplyMode,
        reason,
        notes,
        customerId: finalCustomerId,
        verifiedStaff
      };
      
      console.log('Updating booking with payload:', payload);
      
      const result = await bookingService.updateBookingDetails(payload);
      
      if (result && result.success === false) {
        throw new Error(result.message || 'Lỗi từ hệ thống');
      }
      
      toast.success('Cập nhật thông tin thành công');
      onSuccess();
    } catch (error: any) {
      console.error('Update booking error:', error);
      toast.error(error.message || 'Lỗi khi cập nhật');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !booking) return null;

  const debt = selectedCustomer && selectedCustomer.balance < 0 ? Math.abs(selectedCustomer.balance) : 0;

  return createPortal(
    <div 
      className="fixed inset-0 z-[70000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className={cn(
          "w-full bg-white shadow-2xl overflow-hidden flex flex-col animate-in duration-300",
          "h-[92vh] mt-auto rounded-t-[40px] slide-in-from-bottom-full md:h-auto md:max-w-lg md:rounded-[32px] md:zoom-in-95 md:max-h-[90vh] md:mt-0"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* --- HEADER --- */}
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
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full transition-all active:scale-95 border border-slate-200 shadow-sm"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* --- BODY --- */}
        <div className="flex-1 p-6 space-y-6 bg-slate-50 relative overflow-y-auto custom-scrollbar">
          
          {/* 1. CUSTOMER SEARCH */}
          <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4 relative z-50" ref={searchRef}>
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1 flex items-center gap-2">
              <User className="w-4 h-4" /> Tên khách hàng
            </label>
            <div className="relative group bg-slate-50 rounded-[24px] p-1 transition-shadow hover:shadow-md border border-slate-100">
                <div className="flex items-center px-4">
                    <Search className="w-5 h-5 text-slate-400 mr-3" />
                    <input
                        type="text"
                        value={customerName}
                        onChange={(e) => {
                            setCustomerName(e.target.value);
                            setSearchTerm(e.target.value);
                        }}
                        onFocus={() => {
                            if (customers.length > 0 && searchTerm) setShowSearchResults(true);
                        }}
                        className="w-full py-4 bg-transparent border-none text-base font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-0 outline-none"
                        placeholder="Tìm hoặc nhập tên khách..."
                    />
                    {searchTerm && (
                        <button 
                            onClick={handleClearSearch}
                            className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                        >
                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-5 h-5" />}
                        </button>
                    )}
                </div>

                {/* Dropdown Results */}
                {showSearchResults && customers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-[24px] shadow-xl overflow-hidden z-[102] p-1 border border-slate-100">
                        {customers.map(cust => (
                            <div 
                                key={cust.id}
                                onClick={() => handleSelectCustomer(cust)}
                                className="px-4 py-3 hover:bg-amber-50 rounded-xl cursor-pointer flex justify-between items-center group transition-colors"
                            >
                                <div>
                                    <div className="font-bold text-slate-700 group-hover:text-amber-700">{cust.full_name}</div>
                                    <div className="text-xs text-slate-400">{cust.phone || 'Không có SĐT'}</div>
                                </div>
                                {cust.balance < 0 && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-600">
                                        Nợ: {formatMoney(Math.abs(cust.balance))}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            {/* Debt Warning */}
            {debt > 0 && (
                <div className="flex items-center gap-4 p-5 bg-rose-50 text-rose-700 rounded-[32px] border border-rose-100 shadow-sm animate-in slide-in-from-top-2">
                    <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                        <AlertCircle className="w-6 h-6 text-rose-600" />
                    </div>
                    <div className="flex-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">Cảnh báo nợ cũ</span>
                        <div className="text-sm font-bold leading-tight">
                            Khách đang nợ <span className="font-black text-rose-800 text-lg">{formatMoney(debt)}</span>
                        </div>
                    </div>
                </div>
            )}
          </div>

          {/* 2. CHECK-IN TIME */}
          <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Thời gian nhận phòng
            </label>
            <div className="relative group bg-slate-50 rounded-[24px] p-1 border border-slate-100">
                <input
                    type="datetime-local"
                    value={checkInAt}
                    onChange={(e) => setCheckInAt(e.target.value)}
                    className="w-full py-4 px-5 bg-transparent border-none text-base font-bold text-slate-800 focus:ring-0 outline-none"
                />
            </div>
          </div>

          {/* 3. ROOM PRICE */}
          <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
            <label className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1 flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Đơn giá phòng mới
            </label>
            <div className="relative">
                <MoneyInput
                    value={customPrice || 0}
                    onChange={setCustomPrice}
                    className="w-full py-6 px-4 bg-slate-50 rounded-[32px] text-4xl font-bold text-amber-600 focus:ring-0 border-none outline-none transition-all tracking-tight"
                    inputClassName="text-4xl font-bold tracking-tight text-center"
                    centered
                    align="center"
                />
            </div>
            <div className="flex bg-slate-50 rounded-full p-1.5 shadow-sm border border-slate-100 mt-2">
                {[
                    { id: 'all', label: 'ÁP DỤNG TỪ ĐẦU' },
                    { id: 'future', label: 'CHỈ TỪ HÔM NAY' },
                ].map((mode) => {
                    const isActive = priceApplyMode === mode.id;
                    return (
                        <button 
                            key={mode.id}
                            type="button"
                            onClick={() => {
                                if (mode.id === 'future') {
                                    toast.info("Tính năng đang phát triển, tạm thời áp dụng từ đầu");
                                    setPriceApplyMode('all');
                                } else {
                                    setPriceApplyMode('all');
                                }
                            }}
                            className={cn(
                                "flex-1 py-3.5 rounded-full transition-all duration-300 font-black text-[10px] tracking-widest uppercase",
                                isActive ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30" : "text-slate-400 hover:bg-slate-100"
                            )}
                        >
                            {mode.label}
                        </button>
                    );
                })}
            </div>
          </div>

          {/* 4. NOTES & REASON */}
          <div className="space-y-6">
            <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wide px-1">Ghi chú phòng</label>
                <textarea
                    className="w-full h-24 rounded-[32px] bg-white p-5 text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 border-none outline-none transition-all resize-none shadow-sm"
                    rows={2}
                    placeholder="Nhập ghi chú phòng..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>

            <div className="space-y-3">
                <label className="text-sm font-bold text-rose-600 uppercase tracking-wide px-1 flex items-center gap-2">
                    Lý do thay đổi <span className="text-[10px] bg-rose-100 px-2 py-0.5 rounded-full font-black">BẮT BUỘC</span>
                </label>
                <textarea
                    className="w-full h-24 rounded-[32px] bg-white p-5 text-sm font-bold text-slate-800 placeholder:text-slate-300 focus:ring-2 focus:ring-rose-500 border-2 border-rose-100 outline-none transition-all resize-none shadow-sm"
                    rows={2}
                    placeholder="Vì sao bạn thay đổi các thông tin nhạy cảm này?"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                />
            </div>
          </div>

        </div>

        {/* --- FOOTER --- */}
        <div className="p-6 bg-white border-t border-slate-100 flex items-center gap-4 shrink-0">
          <button 
            onClick={onClose}
            className="flex-1 py-4 rounded-[24px] font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-wider"
          >
            Hủy bỏ
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !reason}
            className={cn(
                "flex-[2] py-4 rounded-[24px] font-bold text-white uppercase tracking-wider shadow-lg shadow-amber-600/30 transition-all flex items-center justify-center gap-3",
                isSubmitting || !reason ? "bg-slate-300 cursor-not-allowed shadow-none" : "bg-amber-500 hover:bg-amber-600 active:scale-95"
            )}
          >
            {isSubmitting ? 'Đang lưu...' : 'Xác nhận thay đổi'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
