import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, LogOut, Edit3, DollarSign, Printer, Search, Coffee, Trash2, ChevronDown, ChevronUp, ChevronRight, Clock, Plus, Minus, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Room, Booking } from '@/types/dashboard';
import { bookingService, BookingBill } from '@/services/bookingService';
import { serviceService, Service, BookingServiceItem } from '@/services/serviceService';
import PaymentModal from './PaymentModal';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';
import { toast } from 'sonner';

interface RoomFolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  booking: Booking;
  onUpdate: () => void;
}

// Hook for Long Press
function useLongPress(
    onLongPress: () => void, 
    onClick: () => void, 
    { shouldPreventDefault = true, delay = 500 } = {}
) {
    const [longPressTriggered, setLongPressTriggered] = useState(false);
    const timeout = useRef<NodeJS.Timeout | null>(null);
    const target = useRef<EventTarget | null>(null);
    const lastTouchTime = useRef<number>(0);

    const start = (event: React.MouseEvent | React.TouchEvent) => {
        if (event.type === 'mousedown' && Date.now() - lastTouchTime.current < 500) return;
        if (event.type === 'touchstart') lastTouchTime.current = Date.now();

        if (shouldPreventDefault && event.target) {
            target.current = event.target;
        }
        timeout.current = setTimeout(() => {
            onLongPress();
            setLongPressTriggered(true);
        }, delay);
    };

    const clear = (event: React.MouseEvent | React.TouchEvent, shouldTriggerClick = true) => {
        if (event.type === 'mouseup' && Date.now() - lastTouchTime.current < 500) return;
        if (event.type === 'touchend') lastTouchTime.current = Date.now();

        if (timeout.current) {
            clearTimeout(timeout.current);
        }
        if (shouldTriggerClick && !longPressTriggered) {
            onClick();
        }
        setLongPressTriggered(false);
        target.current = null;
    };

    return {
        onMouseDown: (e: React.MouseEvent) => start(e),
        onTouchStart: (e: React.TouchEvent) => start(e),
        onMouseUp: (e: React.MouseEvent) => clear(e),
        onMouseLeave: (e: React.MouseEvent) => clear(e, false),
        onTouchEnd: (e: React.TouchEvent) => clear(e)
    };
}

export default function RoomFolioModal({ isOpen, onClose, room, booking, onUpdate }: RoomFolioModalProps) {
  const { confirm, alert } = useGlobalDialog();
  const [bill, setBill] = useState<BookingBill | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Service State
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [bookingServices, setBookingServices] = useState<BookingServiceItem[]>([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [processingServiceId, setProcessingServiceId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [pendingServices, setPendingServices] = useState<BookingServiceItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Load bill details on open
  useEffect(() => {
    if (isOpen && booking) {
      loadBill();
      loadServices();
    }
  }, [isOpen, booking]);

  const loadBill = async () => {
    setIsLoading(true);
    // NOW: Single Source of Truth from Backend
    // The service handles calling the RPC 'get_full_booking_bill'
    const data = await bookingService.calculateBill(booking.id);
    
    setBill(data);
    setIsLoading(false);
  };

  const loadServices = async () => {
      const [services, currentServices] = await Promise.all([
          serviceService.getServices(),
          serviceService.getBookingServices(booking.id)
      ]);
      setAvailableServices(services);
      setBookingServices(currentServices);
  };

  const handleAddService = async (service: Service) => {
      // Just add to pending list
      const tempId = 'pending-' + Date.now() + Math.random();
      const newItem: BookingServiceItem = {
          id: tempId,
          booking_id: booking.id,
          service_id: service.id,
          quantity: 1,
          price_at_time: service.price,
          total_price: service.price,
          service: service
      };
      
      setPendingServices(prev => [...prev, newItem]);
  };

  const handleSaveServices = async () => {
      if (pendingServices.length === 0) return;
      
      setIsSaving(true);
      try {
          // Process sequentially to ensure order
          for (const item of pendingServices) {
             await serviceService.addServiceToBooking(booking.id, item.service_id, 1, item.price_at_time);
          }
          
          setPendingServices([]);
          await Promise.all([loadServices(), loadBill()]);
      } catch (error) {
          console.error("Failed to save services", error);
          toast.error("Lỗi khi lưu dịch vụ");
      } finally {
          setIsSaving(false);
      }
  };

  const handleRemoveService = async (serviceId: string) => {
      // Check if it's in pending list first
      const pendingIndex = pendingServices.findIndex(item => item.service_id === serviceId);
      if (pendingIndex !== -1) {
          // Remove one instance from pending
          const newPending = [...pendingServices];
          newPending.splice(pendingIndex, 1);
          setPendingServices(newPending);
          return;
      }

      if (processingServiceId) return;

      // Find the most recent item of this service
      const itemToRemove = bookingServices.find(item => item.service_id === serviceId);
      if (!itemToRemove) return;

      setProcessingServiceId(serviceId);
      try {
          await serviceService.removeServiceFromBooking(itemToRemove.id);
          await Promise.all([loadServices(), loadBill()]);
      } catch (error) {
          console.error("Failed to remove service", error);
      } finally {
          setProcessingServiceId(null);
      }
  };

  // Group booking services by ID to count quantity
  const getServiceQuantity = (serviceId: string) => {
      // Chỉ tính số lượng đang chờ thêm (phiên hiện tại)
      // Không cộng dồn với dịch vụ đã dùng (theo yêu cầu user)
      const pendingQty = pendingServices
        .filter(s => s.service_id === serviceId)
        .reduce((sum, s) => sum + s.quantity, 0);
        
      return pendingQty;
  };

  const handleCancelBooking = async () => {
    const confirmed = await confirm({
      title: 'Huỷ phòng',
      message: "Bạn có chắc chắn muốn huỷ phòng này không? Hành động này không thể hoàn tác.",
      type: 'error',
      confirmLabel: 'Huỷ phòng',
      destructive: true
    });

    if (!confirmed) {
      return;
    }

    setIsLoading(true);
    try {
      await bookingService.cancelBooking(booking.id);
      onUpdate(); // Refresh dashboard
      onClose(); // Close modal
      toast.success("Huỷ phòng thành công");
    } catch (error) {
      console.error("Cancel failed", error);
      toast.error("Lỗi khi huỷ phòng");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredServices = availableServices.filter(s => 
      s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4">
      <div className="w-full h-full sm:max-w-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-[40px] bg-slate-50 shadow-2xl overflow-hidden flex flex-col">
        <div className="h-16 flex justify-between items-center px-4 bg-white z-10 shrink-0 shadow-sm border-b border-slate-100">
            <div className="flex items-center gap-3">
                <span className="bg-slate-900 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg uppercase tracking-wider shadow-sm">Folio</span>
                <h2 className="text-lg font-bold text-slate-800">Phòng {room.name}</h2>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-full transition-all active:scale-95">
                    <X className="w-5 h-5 text-slate-500" />
                </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-4">
            {/* Quick Actions - Scrollable */}
            <div className="flex gap-4 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden px-1 mb-6">
                <QuickActionButton icon={LogOut} label="Đổi phòng" onClick={() => {}} />
                <QuickActionButton icon={Edit3} label="Sửa giờ" onClick={() => {}} />
                <QuickActionButton icon={DollarSign} label="Nạp tiền" onClick={() => {}} />
                <QuickActionButton icon={Printer} label="In phiếu" onClick={() => {}} />
                <QuickActionButton icon={Trash2} label="Huỷ phòng" onClick={handleCancelBooking} variant="danger" />
            </div>

            {/* Main Blue Toggle Card */}
            <div 
                onClick={() => setShowDetails(!showDetails)}
                className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white shadow-lg shadow-blue-900/20 cursor-pointer transition-all duration-300"
            >
                {/* Decorative background */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
                
                <div className="relative z-10">
                    <div className="flex justify-center items-center mb-1 relative">
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-100">Cần thanh toán</span>
                        <div className={cn(
                            "absolute right-0 w-8 h-8 flex items-center justify-center bg-white/20 rounded-full transition-all duration-300 backdrop-blur-md",
                            showDetails ? "bg-white text-blue-600" : "text-white"
                        )}>
                            {showDetails ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                    </div>

                    <div className="flex justify-center items-center gap-3 mb-6 h-10">
                        <div className="text-4xl font-bold tracking-tight flex items-center h-full">
                            {bill ? bill.amount_to_pay.toLocaleString() : '---'}
                            <span className="text-2xl font-medium text-blue-200 ml-1">đ</span>
                        </div>
                        <div className="h-full flex items-center justify-center px-3 rounded-lg border border-white/50 text-xs font-bold text-white uppercase tracking-wider">
                            {bill?.rental_type === 'hourly' ? 'Theo Giờ' : 
                             bill?.rental_type === 'overnight' ? 'Qua Đêm' : 
                             bill?.rental_type === 'daily' ? 'Theo Ngày' : 
                             booking.booking_type === 'hourly' ? 'Theo Giờ' :
                             booking.booking_type === 'overnight' ? 'Qua Đêm' : 'Theo Ngày'}
                        </div>
                    </div>

                    <div className="flex items-center border-t border-white/20 pt-4 mb-2">
                        <div className="flex-1 text-center">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-200 mb-0.5">Khách hàng</div>
                            <div className="font-bold text-lg leading-tight line-clamp-1">
                                {bill?.customer_name || booking.customer_name || 'Khách lẻ'}
                            </div>
                        </div>
                        <div className="w-px h-8 bg-white/20 mx-4" />
                        <div className="flex-1 text-center">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-200 mb-0.5">Thời gian</div>
                            <div className="font-bold text-lg leading-tight">
                                {bill?.duration_text || '--'}
                            </div>
                        </div>
                    </div>

                    {/* Expandable Details Section - Inside Card */}
                    <div className={cn(
                        "grid transition-all duration-300 ease-in-out overflow-hidden",
                        showDetails ? "grid-rows-[1fr] opacity-100 mt-4 border-t border-white/20 pt-4" : "grid-rows-[0fr] opacity-0"
                    )}>
                        <div className="min-h-0 space-y-2 text-sm">
                            <div className="flex justify-between text-blue-50">
                                <span>Tiền phòng</span>
                                <span className="font-mono font-medium">{bill?.room_charge?.toLocaleString() ?? 0}đ</span>
                            </div>
                            <div className="flex justify-between text-blue-50">
                                <span>Dịch vụ</span>
                                <span className="font-mono font-medium">{bill?.service_total?.toLocaleString() ?? 0}đ</span>
                            </div>
                            {(bill?.late_surcharge || 0) > 0 && (
                                <div className="flex justify-between text-blue-50">
                                    <span>Phụ thu</span>
                                    <span className="font-mono font-medium">{bill?.late_surcharge?.toLocaleString()}đ</span>
                                </div>
                            )}
                            {(bill?.service_fee_amount || 0) > 0 && (
                                <div className="flex justify-between text-blue-50">
                                    <span>Phí phục vụ</span>
                                    <span className="font-mono font-medium">{bill?.service_fee_amount?.toLocaleString()}đ</span>
                                </div>
                            )}
                            {(bill?.vat_amount || 0) > 0 && (
                                <div className="flex justify-between text-blue-50">
                                    <span>VAT</span>
                                    <span className="font-mono font-medium">{bill?.vat_amount?.toLocaleString()}đ</span>
                                </div>
                            )}
                            {(bill?.customer_balance || 0) > 0 && (
                                <div className="flex justify-between text-blue-50">
                                    <span>Nợ cũ</span>
                                    <span className="font-mono font-medium">{bill?.customer_balance?.toLocaleString()}đ</span>
                                </div>
                            )}
                            
                            {/* Divider for Deductions */}
                            {((bill?.deposit_amount || 0) > 0 || (bill?.discount_amount || 0) > 0) && (
                                <div className="my-2 border-t border-white/10" />
                            )}

                            {(bill?.deposit_amount || 0) > 0 && (
                                <div className="flex justify-between text-blue-200">
                                    <span>Đã cọc</span>
                                    <span className="font-mono font-medium">- {bill?.deposit_amount?.toLocaleString()}đ</span>
                                </div>
                            )}
                            {(bill?.discount_amount || 0) > 0 && (
                                <div className="flex justify-between text-blue-200">
                                    <span>Giảm giá</span>
                                    <span className="font-mono font-medium">- {bill?.discount_amount?.toLocaleString()}đ</span>
                                </div>
                            )}

                            <div className="my-2 border-t border-white/20" />
                            
                            <div className="flex justify-between font-bold text-white text-base">
                                <span>Tổng cần thu</span>
                                <span className="font-mono">{bill?.amount_to_pay?.toLocaleString() ?? 0}đ</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-3 pt-2">
                <div className="flex overflow-x-auto pb-4 pt-2 gap-3 snap-x hide-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {filteredServices.map(service => {
                        const qty = getServiceQuantity(service.id);
                        const isOutOfStock = (service.stock_quantity || 0) <= 0;
                        
                        return (
                            <ServiceCard 
                                key={service.id}
                                service={service}
                                quantity={qty}
                                isProcessing={processingServiceId === service.id}
                                onAdd={() => !isOutOfStock && handleAddService(service)}
                                onRemove={() => handleRemoveService(service.id)}
                            />
                        );
                    })}
                    {filteredServices.length === 0 && (
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
                    {pendingServices.length > 0 && (
                        <>
                            <div className="w-px h-3 bg-slate-200"></div>
                            <div className="flex items-center gap-2 font-medium text-blue-600">
                                <span>{pendingServices.length} món</span>
                                <span>•</span>
                                <span>{pendingServices.reduce((sum, item) => sum + (item.quantity * item.price_at_time), 0).toLocaleString()}đ</span>
                            </div>
                        </>
                    )}
                </div>

                <div className="mt-4">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Dịch vụ đã dùng</h3>
                    <div className="bg-white rounded-[24px] border border-slate-200 divide-y divide-slate-100 shadow-sm">
                        {bookingServices.length === 0 && pendingServices.length === 0 ? (
                            <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                                <Coffee className="w-8 h-8 opacity-20" />
                                <span>Chưa dùng dịch vụ nào</span>
                            </div>
                        ) : (
                            <>
                            {/* Pending Services */}
                            {Object.values(pendingServices.reduce((acc, item) => {
                                if (!acc[item.service_id]) {
                                    acc[item.service_id] = { ...item, quantity: 0, total_price: 0 };
                                }
                                acc[item.service_id].quantity += item.quantity;
                                acc[item.service_id].total_price += item.quantity * item.price_at_time;
                                return acc;
                            }, {} as Record<string, BookingServiceItem>)).map((item) => (
                                <div key={`pending-${item.service_id}`} className="p-3 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors border-l-4 border-transparent">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                                            {item.quantity}x
                                        </div>
                                        <div>
                                            <div className="font-medium text-slate-900">{item.service?.name}</div>
                                            <div className="text-xs text-blue-600 font-medium">Chờ lưu...</div>
                                        </div>
                                    </div>
                                    <div className="font-bold text-blue-600">
                                        {item.total_price.toLocaleString()}đ
                                    </div>
                                </div>
                            ))}

                            {/* Existing Services */}
                            {Object.values(bookingServices.reduce((acc, item) => {
                                if (!acc[item.service_id]) {
                                    acc[item.service_id] = { ...item, quantity: 0, total_price: 0 };
                                }
                                acc[item.service_id].quantity += item.quantity;
                                acc[item.service_id].total_price += item.quantity * item.price_at_time;
                                return acc;
                            }, {} as Record<string, BookingServiceItem>)).map((item) => (
                                <div key={item.service_id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm">
                                            {item.quantity}x
                                        </div>
                                        <div>
                                            <div className="font-medium text-slate-900">{item.service?.name}</div>
                                            <div className="text-xs text-slate-500">{item.price_at_time.toLocaleString()}đ</div>
                                        </div>
                                    </div>
                                    <div className="font-bold text-slate-700">
                                        {item.total_price.toLocaleString()}đ
                                    </div>
                                </div>
                            ))}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>

        <div className="bg-white border-t border-slate-100 px-4 py-4 shrink-0">
            {pendingServices.length > 0 ? (
                <button 
                    onClick={handleSaveServices}
                    disabled={isSaving}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white h-14 rounded-[28px] font-bold text-lg shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 animate-pulse"
                >
                    {isSaving ? (
                        <span>Đang lưu...</span>
                    ) : (
                        <>
                            <span>LƯU CẬP NHẬT</span>
                            <div className="bg-white text-blue-600 text-xs px-2 py-0.5 rounded-full font-bold">
                                {pendingServices.length}
                            </div>
                        </>
                    )}
                </button>
            ) : (
                <button 
                    onClick={() => setShowPaymentModal(true)}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white h-14 rounded-[28px] font-bold text-lg shadow-lg shadow-slate-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                    <span>THANH TOÁN</span>
                    <ChevronRight className="w-5 h-5" />
                </button>
            )}
        </div>

        {bill && (
            <PaymentModal 
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                bill={bill}
                onSuccess={() => {
                    onUpdate();
                    onClose();
                }}
            />
        )}
      </div>
    </div>,
    document.body
  );
}

// --- Helper Components ---

function ServiceCard({ service, quantity, isProcessing, onAdd, onRemove }: { 
    service: Service, 
    quantity: number,
    isProcessing: boolean,
    onAdd: () => void,
    onRemove: () => void
}) {
    const longPressEvent = useLongPress(onRemove, onAdd, { delay: 400 });
    const isOutOfStock = (service.track_inventory ? (service.stock_quantity || 0) <= 0 : false);
    const isLowStock = service.track_inventory ? (service.stock_quantity || 0) <= (service.min_stock_level || 0) : false;

    return (
        <div 
            {...longPressEvent}
            className={cn(
                "min-w-[150px] w-[150px] h-[170px] rounded-[32px] flex flex-col items-center justify-center p-4 relative select-none transition-all snap-start",
                isOutOfStock ? "opacity-60 grayscale cursor-not-allowed bg-slate-50" : "cursor-pointer bg-white hover:shadow-lg hover:-translate-y-1",
                quantity > 0 ? "shadow-lg ring-2 ring-slate-400 ring-offset-2" : "shadow-sm border border-slate-100",
                isProcessing && "animate-pulse"
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
                <Coffee className="w-7 h-7" />
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
                    {service.price.toLocaleString()}đ
                </div>
                <p className="text-xs text-slate-400">{service.unit_sell || service.unit}</p>
            </div>
            
            {/* Loading Overlay */}
            {isProcessing && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-xl z-20">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
        </div>
    )
}

function QuickActionButton({ 
    icon: Icon, 
    label, 
    onClick, 
    variant = 'default' 
}: { 
    icon: any, 
    label: string, 
    onClick: () => void,
    variant?: 'default' | 'danger'
}) {
    return (
        <div 
            onClick={onClick}
            className="group flex flex-col items-center gap-2 cursor-pointer flex-none min-w-[64px]"
        >
            <div className={cn(
                "w-14 h-14 rounded-[28px] flex items-center justify-center transition-all duration-300 shadow-sm",
                variant === 'danger' 
                    ? "bg-white text-rose-500 hover:bg-rose-50 hover:text-rose-600 hover:shadow-md"
                    : "bg-white text-slate-400 hover:bg-white hover:text-blue-500 hover:shadow-md"
            )}>
                <Icon className="w-6 h-6" strokeWidth={1.5} />
            </div>
            <span className={cn(
                "text-[11px] font-semibold transition-colors text-center leading-tight",
                variant === 'danger' ? "text-rose-600" : "text-slate-500"
            )}>
                {label}
            </span>
        </div>
    )
}
