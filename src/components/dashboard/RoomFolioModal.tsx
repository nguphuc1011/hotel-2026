import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, LogOut, Edit3, DollarSign, Printer, Search, Coffee, Trash2, ChevronDown, ChevronUp, ChevronRight, Clock, Calendar, Plus, Minus, AlertCircle, MessageSquare, User, Users, ShieldCheck, KeyRound, Link, Unlink, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { formatMoney, getContrastTextColor } from '@/utils/format';
import { Room, Booking } from '@/types/dashboard';
import { DashboardRoom } from '@/types/dashboard';
import { bookingService, BookingBill } from '@/services/bookingService';
import { serviceService, Service, BookingServiceItem } from '@/services/serviceService';
import PaymentModal from './PaymentModal';
import BillBreakdown from './BillBreakdown';
import CancellationPenaltyModal from './CancellationPenaltyModal';
import EditBookingModal from './folio/EditBookingModal';
import ChangeRoomModal from './folio/ChangeRoomModal';
import DepositModal from './folio/DepositModal';
import LiveTimer from './LiveTimer';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import TransferGroupMasterModal from './TransferGroupMasterModal';
import { SecurityAction } from '@/services/securityService';
import { useSecurity } from '@/hooks/useSecurity';
import { groupBookingService } from '@/services/groupBookingService';

interface RoomFolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: DashboardRoom;
  booking?: Booking;
  onUpdate: () => void;
  onGroupRoom?: () => void;
  pendingApproval?: {
    id: string;
    action: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    request_data?: any;
  };
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
    const startCoord = useRef<{x: number, y: number} | null>(null);
    const isSwipe = useRef(false);

    const start = (event: React.MouseEvent | React.TouchEvent) => {
        if (event.type === 'mousedown' && Date.now() - lastTouchTime.current < 500) return;
        
        isSwipe.current = false;
        if (event.type === 'touchstart') {
            lastTouchTime.current = Date.now();
            const touch = (event as React.TouchEvent).touches[0];
            startCoord.current = { x: touch.clientX, y: touch.clientY };
        } else {
            startCoord.current = null;
        }

        if (shouldPreventDefault && event.target) {
            target.current = event.target;
        }
        timeout.current = setTimeout(() => {
            onLongPress();
            setLongPressTriggered(true);
        }, delay);
    };

    const move = (event: React.TouchEvent) => {
        if (!startCoord.current) return;
        const touch = event.touches[0];
        const moveX = Math.abs(touch.clientX - startCoord.current.x);
        const moveY = Math.abs(touch.clientY - startCoord.current.y);
        
        if (moveX > 10 || moveY > 10) {
            isSwipe.current = true;
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
        if (shouldTriggerClick && !longPressTriggered && !isSwipe.current) {
            onClick();
        }
        setLongPressTriggered(false);
        isSwipe.current = false;
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

export default function RoomFolioModal({ isOpen, onClose, room, booking, onUpdate, onGroupRoom, pendingApproval }: RoomFolioModalProps) {
  const { confirm: confirmDialog, alert: alertDialog } = useGlobalDialog();
  const [isTransferGroupMasterModalOpen, setIsTransferGroupMasterModalOpen] = useState(false);

  // --- PERSISTENCE LOGIC (Anti-Flicker) ---
  const [lastData, setLastData] = useState<{room: DashboardRoom, booking: Booking | undefined} | null>(null);

  useEffect(() => {
    if (isOpen && room) {
      setLastData({ room, booking });
    }
  }, [isOpen, room, booking]);

  // Use cached data during closing animation
  const activeRoom = room || lastData?.room;
  const activeBooking = booking || lastData?.booking;
  // ----------------------------------------

  const handleTransferGroupMaster = () => {
    if (!activeRoom || !activeBooking) return;
    verify('folio_transfer_master', () => {
      setIsTransferGroupMasterModalOpen(true);
    }, {
      room_id: activeRoom.id,
      room_number: activeRoom.name,
      booking_id: activeBooking?.id?.slice(0, 8)
    });
  };

  const handleUngroupRoom = async (bookingId: string) => {
    if (!activeRoom) return;
    verify('folio_ungroup_room', async () => {
      try {
        const { groupBookingService } = await import('@/services/groupBookingService');
        await groupBookingService.ungroupRoom(bookingId);
        toast.success('Đã tách phòng khỏi nhóm thành công');
        onUpdate(); // Refresh dashboard data
        onClose();  // Close the current folio modal
      } catch (error) {
        console.error('Ungroup error:', error);
        toast.error('Tách phòng thất bại');
      }
    }, {
      room_id: activeRoom.id,
      room_number: activeRoom.name,
      customer_name: activeBooking?.customer_name || 'Khách lẻ',
      booking_id: bookingId?.slice(0, 8)
    });
  };
  const [mounted, setMounted] = useState(false);
  const [bill, setBill] = useState<BookingBill | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [internalPendingApproval] = useState<any>(null);
  const [groupDetails, setGroupDetails] = useState<any>(null); // State mới cho chi tiết nhóm
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [bookingServices, setBookingServices] = useState<BookingServiceItem[]>([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [processingServiceId, setProcessingServiceId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [pendingServices, setPendingServices] = useState<BookingServiceItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPenaltyModal, setShowPenaltyModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showChangeRoomModal, setShowChangeRoomModal] = useState(false);
  const [showGroupRooms, setShowGroupRooms] = useState(false);
  const [editStaff, setEditStaff] = useState<{ id: string, name: string } | undefined>(undefined);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [cancellationStaff, setCancellationStaff] = useState<{ id: string, name: string } | undefined>(undefined);
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  const { verify, SecurityModals } = useSecurity();

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Load bill details on open
  useEffect(() => {
    if (isOpen && activeBooking?.id) {
      loadBill(true); // Force snapshot update when opening Folio
      loadServices();
      if (activeRoom?.is_group_master || activeBooking.is_group_member) {
        loadGroupDetails();
      }
    }
  }, [isOpen, activeBooking?.id]); // Only trigger on ID change, not object reference change

  // Real-time listener for this specific booking
  useEffect(() => {
    if (!isOpen || !activeBooking?.id) return;

    const channel = supabase
      .channel(`folio-${activeBooking.id}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'booking_services',
          filter: `booking_id=eq.${activeBooking.id}`
        }, 
        () => {
          console.log('Real-time Folio Update: Services changed');
          loadServices();
          loadBill();
        }
      )
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${activeBooking.id}`
        },
        () => {
          console.log('Real-time Folio Update: Booking changed');
          loadBill();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, activeBooking?.id]);

  // Use booking prop as source of truth for the big number
  // It's calculated by the parent (Dashboard) and updated via timer/real-time
  const displayAmountToPay = bill?.amount_to_pay ?? activeBooking?.amount_to_pay ?? 0;
  const displayCustomerBalance = bill?.customer_balance ?? activeBooking?.customer_balance ?? 0;
  const isCustomerInDebt = displayCustomerBalance < 0;

  // Tạm tính tổng tiền bao gồm cả dịch vụ chưa lưu
  const pendingServicesTotal = pendingServices.reduce((sum, item) => sum + (item.quantity * item.price_at_time), 0);
  
  // Tổng tiền ĐÃ LƯU vào Folio (bao gồm nợ cũ nếu có)
  // Logic: Lấy số tiền còn lại của Booking + Nợ cũ khách hàng
  const officialAmountToPay = displayAmountToPay + (isCustomerInDebt ? Math.abs(displayCustomerBalance) : 0);
  
  // Tổng tiền DỰ KIẾN (bao gồm cả dịch vụ đang chờ lưu)
  const projectedAmountToPay = officialAmountToPay + pendingServicesTotal;

  const loadBill = async (force: boolean = false) => {
    if (!activeBooking) return;
    
    // Only show full loading spinner if we don't have any bill data yet
    if (!bill) {
      setIsLoading(true);
    }

    try {
      if (force) {
        await bookingService.forceUpdateSnapshot(activeBooking.id);
      }
      const data = await bookingService.calculateBill(activeBooking.id);
      console.log('Folio Bill Data (after loadBill):', data);
      setBill(data);
    } catch (error) {
      console.error('Error loading bill:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadGroupDetails = async () => {
    if (!activeBooking) return;
    try {
      const data = await groupBookingService.getGroupDetails(activeBooking.id);
      if (data.is_group) {
        console.log('Group Details loaded:', data); // Thêm log để kiểm tra dữ liệu
        setGroupDetails(data);
      } else {
        // If data.is_group is false, it means this booking is not part of a group.
        // This is not an error, so we just set groupDetails to null.
        setGroupDetails(null);
      }
    } catch (error) {
      console.error('Error loading group details:', error);
      setGroupDetails(null);
    }
  };

  const loadServices = async () => {
      if (!activeBooking) return;
      const [services, currentServices] = await Promise.all([
          serviceService.getServices(),
          serviceService.getBookingServices(activeBooking.id)
      ]);
      setAvailableServices(services);
      setBookingServices(currentServices);
  };

  const handleAddService = async (service: Service) => {
      if (!activeBooking) return;
      // Just add to pending list
      const tempId = 'pending-' + Date.now() + Math.random();
      const newItem: BookingServiceItem = {
          id: tempId,
          booking_id: activeBooking.id,
          service_id: service.id,
          quantity: 1,
          price_at_time: service.price,
          total_price: service.price,
          service: service
      };
      
      setPendingServices(prev => [...prev, newItem]);
  };

  const handleSaveServices = async () => {
      if (!activeBooking || pendingServices.length === 0) return;
      
      // Security Check
      verify('folio_add_service', async (staffId, staffName) => {
        setIsSaving(true);
        try {
            // Process sequentially to ensure order
            for (const item of pendingServices) {
               await serviceService.addServiceToBooking(activeBooking.id, item.service_id, 1, item.price_at_time);
            }
            
            setPendingServices([]);
            await Promise.all([loadServices(), loadBill()]);
            onUpdate();
            toast.success("Đã cập nhật dịch vụ");
        } catch (error) {
            console.error("Failed to save services", error);
            toast.error("Lỗi khi lưu dịch vụ");
        } finally {
            setIsSaving(false);
        }
      });
  };

  const handleRemoveService = async (serviceId: string, verifiedStaff?: { id: string, name: string }) => {
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

      // Security Check for DB removal
      verify('folio_remove_service', async (staffId, staffName) => {
        setProcessingServiceId(serviceId);
        try {
            if (itemToRemove.quantity > 1) {
                await serviceService.updateBookingServiceQuantity(itemToRemove.id, itemToRemove.quantity - 1);
                toast.success("Đã giảm số lượng");
            } else {
                await serviceService.removeServiceFromBooking(itemToRemove.id);
                toast.success("Đã xóa dịch vụ");
            }
            await Promise.all([loadServices(), loadBill()]);
            onUpdate();
        } catch (error) {
            console.error("Failed to remove service", error);
            toast.error("Lỗi khi xóa dịch vụ");
        } finally {
            setProcessingServiceId(null);
        }
      });
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
    // Step 1: Show Penalty Modal FIRST to get reason and amount
    setShowPenaltyModal(true);
  };

  const handleConfirmCancelWithPenalty = async (penaltyAmount: number, paymentMethod: string, reason: string) => {
    if (!activeBooking) return;
    // Step 2: Verify permission with full data
    verify('checkin_cancel_booking', async (staffId, staffName) => {
      // Step 3: Execute Cancellation after Approval
      setIsLoading(true);
      try {
        const result = await bookingService.cancelBooking(
          activeBooking?.id, 
          staffId ? { id: staffId, name: staffName || 'Nhân viên' } : undefined,
          penaltyAmount,
          paymentMethod,
          reason
        );

        if (result.is_master_booking) {
          alertDialog({
            title: 'Không thể hủy phòng chủ',
            message: 'Phòng chủ không thể hủy trực tiếp. Vui lòng tách các phòng con ra trước hoặc chuyển quyền chủ nhóm sang phòng khác.'
          });
        } else if (result.success) {
          onUpdate(); // Refresh dashboard
          onClose(); // Close folio
          toast.success(result.message || "Huỷ phòng thành công");
        } else {
          toast.error(result.message || "Lỗi khi huỷ phòng");
        }
      } catch (error: any) {
        console.error("Cancel failed", error);
        toast.error(error.message || "Lỗi khi huỷ phòng");
      } finally {
        setIsLoading(false);
        setShowPenaltyModal(false);
        setCancellationStaff(undefined);
      }
    }, {
      room_id: activeRoom?.id, // Critical for dashboard matching
      room_number: activeRoom?.name || 'N/A',
      customer_name: activeBooking?.customer_name || 'Khách vãng lai',
      booking_id: activeBooking?.id?.slice(0, 8),
      full_booking_id: activeBooking?.id, // For auto-finalize execution
      reason: reason,
      penalty_amount: penaltyAmount,
      payment_method: paymentMethod
    }, {
      skipWaitingModal: true
    });
  };

  const handleChangeRoom = async () => {
    if (!activeRoom || !activeBooking) return;
    verify('folio_change_room', (staffId, staffName) => {
      setEditStaff(staffId ? { id: staffId, name: staffName || 'Nhân viên' } : undefined);
      setShowChangeRoomModal(true);
    }, {
      room_id: activeRoom.id,
      room_number: activeRoom.name,
      customer_name: activeBooking?.customer_name || 'Khách vãng lai',
      booking_id: activeBooking?.id?.slice(0, 8)
    });
  };

  const handleEditBooking = async () => {
    if (!activeRoom || !activeBooking) return;
    verify('folio_edit_booking', (staffId, staffName) => {
      setEditStaff(staffId ? { id: staffId, name: staffName || 'Nhân viên' } : undefined);
      setShowEditModal(true);
    }, {
      room_id: activeRoom.id,
      room_number: activeRoom.name,
      customer_name: activeBooking?.customer_name || 'Khách vãng lai',
      booking_id: activeBooking?.id?.slice(0, 8)
    });
  };

  const filteredServices = availableServices.filter(s => 
      s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  // Load Initial DataModal Component for Audit Trail
  const AuditTrailModal = () => {
    if (!showAuditTrail || !bill) return null;
    return createPortal(
      <div className="fixed inset-0 z-[60000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 leading-none">Chi tiết tính tiền</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">Lá sớ hệ thống</p>
              </div>
            </div>
            <button
              onClick={() => setShowAuditTrail(false)}
              className="w-10 h-10 flex items-center justify-center bg-white hover:bg-slate-100 rounded-full transition-all active:scale-95 border border-slate-200 shadow-sm"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <div className="p-6 max-h-[70vh] overflow-y-auto bg-white">
            <BillBreakdown bill={bill} />
          </div>
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => setShowAuditTrail(false)}
              className="px-6 py-3 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const ModalContent = (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 overflow-hidden relative">
      {/* Header */}
      <div className="h-14 flex justify-between items-center px-6 bg-white shrink-0 border-b border-slate-100 z-10">
          <div className="flex items-center gap-3">
              <span className="bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider shadow-sm">Folio</span>
              <h2 className="text-base font-bold text-slate-800">Phòng {activeRoom?.name}</h2>
          </div>
          <div className="flex items-center gap-2">
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-full transition-all active:scale-95">
                  <X className="w-4 h-4 text-slate-500" />
              </button>
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Quick Actions - Scrollable */}
          <div className="flex gap-4 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden px-1 mb-2">
              <QuickActionButton icon={LogOut} label="Đổi phòng" onClick={() => handleChangeRoom()} />
              <QuickActionButton icon={Edit3} label="Sửa thông tin" onClick={() => handleEditBooking()} />
              <QuickActionButton icon={Users} label="Gộp phòng" onClick={() => onGroupRoom?.()} />
              {groupDetails && groupDetails.is_group && groupDetails.master_id === activeBooking?.id && groupDetails.rooms && groupDetails.rooms.length > 1 && (
                <QuickActionButton icon={KeyRound} label="Chuyển chủ nhóm" onClick={handleTransferGroupMaster} />
              )}
              <QuickActionButton icon={DollarSign} label="Thu trước" onClick={() => {
                verify('folio_deposit', (staffId, staffName) => {
                  setEditStaff(staffId ? { id: staffId, name: staffName || 'Nhân viên' } : undefined);
                  setShowDepositModal(true);
                }, {
                  room_id: activeRoom?.id,
                  room_number: activeRoom?.name,
                  customer_name: activeBooking?.customer_name || 'Khách lẻ',
                  booking_id: activeBooking?.id?.slice(0, 8)
                });
              }} />
              <QuickActionButton icon={Printer} label="In phiếu" onClick={() => {}} />
              
              <QuickActionButton 
                icon={Trash2} 
                label="Huỷ phòng" 
                onClick={() => handleCancelBooking()} 
                variant="danger" 
              />
          </div>

          {/* Main Toggle Card */}
          <div 
              onClick={() => setShowDetails(!showDetails)}
              className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white shadow-lg shadow-blue-900/20 cursor-pointer transition-all duration-300"
          >
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

                  <div className="flex flex-col items-center gap-1 mb-6">
                      <div className="flex justify-center items-center gap-3 h-10">
                          <button 
                              onClick={(e) => {
                                  e.stopPropagation();
                                  loadBill();
                                  loadServices();
                                  onUpdate();
                              }}
                              className={cn(
                                  "p-2 rounded-full hover:bg-white/10 transition-colors active:scale-90",
                                  isLoading && "animate-spin"
                              )}
                              title="Làm mới"
                          >
                              <RefreshCw className="w-5 h-5 opacity-50" />
                          </button>
                          <div className="text-4xl font-bold tracking-tight flex items-center h-full">
                              {bill || (activeBooking && activeBooking.total_amount !== undefined) ? formatMoney(officialAmountToPay) : '---'}
                          </div>
                          <button 
                              onClick={(e) => {
                                  e.stopPropagation();
                                  setShowAuditTrail(true);
                              }}
                              className="w-8 h-8 flex items-center justify-center rounded-full border border-white/50 text-lg font-black text-white hover:bg-white/10 transition-all"
                          >
                              !
                          </button>
                      </div>
                      
                      {pendingServicesTotal > 0 && (
                          <div className="flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full backdrop-blur-md animate-in slide-in-from-top-2 duration-300">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-100">Dự kiến:</span>
                              <span className="text-sm font-black text-yellow-300">
                                  {formatMoney(projectedAmountToPay)}
                              </span>
                          </div>
                      )}
                  </div>

                  <div className="flex items-center border-t border-white/20 pt-4 mb-2">
                      <div className="flex-1 text-center border-r border-white/20 pr-2">
                          <div className="font-bold text-lg leading-tight mb-1 flex items-center justify-center gap-2">
                              <div className="bg-blue-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold text-blue-100 uppercase tracking-wider border border-blue-400/30">
                                  Vào
                              </div>
                              {(() => {
                                  if (!bill?.check_in_at) return '--';
                                  const date = new Date(bill.check_in_at);
                                  const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                                  const dateStr = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
                                  const isHourly = bill.rental_type === 'hourly';
                                  
                                  const primary = isHourly ? timeStr : dateStr;
                                  const secondary = isHourly ? dateStr : timeStr;

                                  return (
                                      <span>
                                          <span className="font-bold text-xl text-yellow-300">
                                              {primary}
                                          </span>
                                          <span className="font-bold text-white/80 text-sm ml-1">
                                              {secondary}
                                          </span>
                                      </span>
                                  );
                              })()}
                          </div>
                          <div className="flex items-center justify-center gap-1.5 min-h-[20px]">
                              <User className="w-3.5 h-3.5 text-blue-200" />
                              <div className="text-sm font-bold text-white">
                                  {bill?.customer_name || 'Khách lẻ'}
                              </div>
                          </div>
                      </div>
                      <div className="flex-1 text-center pl-2">
                          <div className="flex items-center justify-center gap-2 mb-1">
                              <div className="text-xs font-bold uppercase tracking-wider text-blue-200">Đã ở</div>
                              <div className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white border border-white/40 bg-white/10 uppercase tracking-wider whitespace-nowrap">
                                  {bill?.rental_type === 'hourly' ? 'Theo Giờ' : 
                                   bill?.rental_type === 'overnight' ? 'Qua Đêm' : 
                                   bill?.rental_type === 'daily' ? 'Theo Ngày' : 
                                   (activeBooking ? (activeBooking.booking_type === 'hourly' ? 'Theo Giờ' : activeBooking.booking_type === 'overnight' ? 'Qua Đêm' : 'Theo Ngày') : '---')}
                              </div>
                          </div>
                          <div className="font-bold text-lg leading-tight">
                              {(() => {
                                  if (!bill?.check_in_at) return '--';
                                  
                                  // Prefer business-logic duration from DB for Daily/Overnight
                                  if (bill.duration_text && (bill.rental_type === 'daily' || bill.rental_type === 'overnight')) {
                                      return (
                                          <div className="flex items-center justify-center gap-1.5">
                                              <Calendar className="w-4 h-4 text-white/60" />
                                              <span className="text-xl text-yellow-300">{bill.duration_text}</span>
                                          </div>
                                      );
                                  }

                                  const mode = bill.rental_type === 'hourly' ? 'hourly' : 
                                               bill.rental_type === 'overnight' ? 'overnight' : 'daily';
                                  
                                  return (
                                      <div className="flex items-center justify-center gap-1.5">
                                          {mode === 'hourly' ? <Clock className="w-4 h-4 text-white/60" /> : <Calendar className="w-4 h-4 text-white/60" />}
                                          <LiveTimer 
                                              checkInAt={bill.check_in_at} 
                                              mode={mode} 
                                          />
                                      </div>
                                  );
                              })()}
                          </div>
                      </div>
                  </div>

                  {/* Expandable Details Section - Inside Card */}
                  <div className={cn(
                      "grid transition-all duration-300 ease-in-out overflow-hidden",
                      showDetails ? "grid-rows-[1fr] opacity-100 mt-4 border-t border-white/20 pt-4" : "grid-rows-[0fr] opacity-0"
                  )}>
                      <div className="min-h-0 space-y-4">
                          {bill && (
                              <BillBreakdown 
                                  bill={bill} 
                                  isDark={true}
                                  className="pt-2"
                                  hideAuditLog={true}
                                  pendingServicesTotal={pendingServicesTotal}
                              />
                          )}
                      </div>
                  </div>
              </div>
          </div>

          {/* Unified Group Room Info */}
          {(groupDetails && groupDetails.is_group && groupDetails.rooms && groupDetails.rooms.length > 0) || activeBooking?.is_group_member ? (
              <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-4 space-y-3">
                  {groupDetails && groupDetails.is_group && groupDetails.rooms && groupDetails.rooms.length > 0 ? (
                      <>
                          <button 
                              className="flex items-center justify-between w-full group"
                              onClick={() => setShowGroupRooms(!showGroupRooms)}
                          >
                              <div className="flex items-center gap-2">
                                  <Users className="w-5 h-5 text-blue-600" />
                                  <h3 className="text-lg font-bold text-slate-800">
                                      Phòng gộp ({groupDetails.rooms.length})
                                  </h3>
                              </div>
                              <div className="flex items-center gap-2">
                                  <span className="text-base font-bold text-blue-600">
                                      {formatMoney(groupDetails.total_group_amount || 0)}
                                  </span>
                                  <ChevronDown 
                                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showGroupRooms ? 'rotate-180' : ''}`}
                                  />
                              </div>
                          </button>
                          
                          {showGroupRooms && (
                              <div className="animate-in fade-in duration-200">
                                  <div className="grid grid-cols-2 gap-3 mt-3">
                                      {groupDetails.rooms.map((member: any) => (
                                          <GroupedRoomMemberCard 
                                              key={member.booking_id} 
                                              member={member} 
                                              groupColor={activeRoom?.group_color || '#4A5568'}
                                              isMaster={member.is_master}
                                              onUngroup={handleUngroupRoom}
                                          />
                                      ))}
                                  </div>
                              </div>
                          )}
                      </>
                  ) : activeBooking?.is_group_member ? (
                      <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                                  <Link className="w-5 h-5" />
                              </div>
                              <div>
                                  <div className="font-bold text-blue-700 text-base">
                                      Đã gộp vào phòng {groupDetails?.master_room_name || groupDetails?.rooms?.find((r: any) => r.is_master)?.room_name || 'chính'}
                                  </div>
                              </div>
                          </div>
                          
                          <button
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                              onClick={() => handleUngroupRoom(activeBooking?.id!)}
                          >
                              <Unlink className="w-3 h-3" />
                              Tách nhóm
                          </button>
                      </div>
                  ) : null}
              </div>
          ) : null}

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
              </div>

              <div className="mt-2 flex items-center justify-center gap-6 text-[10px] text-slate-400 bg-white p-2 rounded-xl border border-slate-100 mx-auto w-fit shadow-sm">
                  <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                      Chạm: thêm
                  </div>
                  <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-300"></span>
                      Giữ: bớt
                  </div>
                  {pendingServices.length > 0 && (
                      <>
                          <div className="w-px h-3 bg-slate-200"></div>
                          <div className="flex items-center gap-2 font-medium text-blue-600">
                              <span>{pendingServices.length} món</span>
                              <span>•</span>
                              <span>{formatMoney(pendingServices.reduce((sum, item) => sum + (item.quantity * item.price_at_time), 0))}</span>
                          </div>
                      </>
                  )}
              </div>

              <div className="mt-4">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Dịch vụ đã dùng</h3>
                  <div className="bg-white rounded-[24px] border border-slate-100 divide-y divide-slate-100 shadow-sm">
                      {bookingServices.length === 0 && pendingServices.length === 0 ? (
                          <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                              <Coffee className="w-6 h-6 opacity-20" />
                              <span className="text-xs">Chưa dùng dịch vụ nào</span>
                          </div>
                      ) : (
                          <>
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
                                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
                                          {item.quantity}x
                                      </div>
                                      <div>
                                          <div className="font-medium text-slate-900 text-sm">{item.service?.name}</div>
                                          <div className="text-[10px] text-blue-600 font-medium">Chờ lưu...</div>
                                      </div>
                                  </div>
                                  <div className="font-bold text-blue-600 text-sm">
                                      {formatMoney(item.total_price)}
                                  </div>
                              </div>
                          ))}

                          {Object.values(bookingServices.reduce((acc, item) => {
                              if (!acc[item.service_id]) {
                                  acc[item.service_id] = { ...item, quantity: 0, total_price: 0 };
                              }
                              acc[item.service_id].quantity += item.quantity;
                              acc[item.service_id].total_price += item.quantity * item.price_at_time;
                              return acc;
                          }, {} as Record<string, BookingServiceItem>)).map((item) => (
                              <div key={item.service_id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                                  <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs">
                                          {item.quantity}x
                                      </div>
                                      <div>
                                          <div className="font-medium text-slate-900 text-sm">{item.service?.name}</div>
                                          <div className="text-[10px] text-slate-500">{formatMoney(item.price_at_time)}</div>
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                      <div className="font-bold text-slate-700 text-sm">
                                          {formatMoney(item.total_price)}
                                      </div>
                                      <button 
                                          onClick={() => handleRemoveService(item.id)}
                                          disabled={!!processingServiceId}
                                          className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500 flex items-center justify-center transition-colors active:scale-90"
                                      >
                                          <Minus className="w-3.5 h-3.5" />
                                      </button>
                                  </div>
                              </div>
                          ))}
                          </>
                      )}
                  </div>
              </div>
          </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 bg-white border-t border-slate-100 px-6 py-6 z-10 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          {pendingServices.length > 0 ? (
              <div className="flex gap-3">
                  <button 
                      type="button"
                      onClick={() => setPendingServices([])}
                      disabled={isSaving}
                      className="w-20 bg-slate-100 hover:bg-slate-200 text-slate-600 h-12 rounded-2xl font-bold text-xs shadow-sm active:scale-[0.98] transition-all"
                  >
                      HỦY
                  </button>
                  <button 
                      type="button"
                      onClick={() => handleSaveServices()}
                      disabled={isSaving}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-2xl font-bold text-base shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 animate-pulse"
                  >
                      {isSaving ? (
                          <span>Đang lưu...</span>
                      ) : (
                          <>
                              <span>LƯU CẬP NHẬT</span>
                              <div className="bg-white text-blue-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                  {pendingServices.length}
                              </div>
                          </>
                      )}
                  </button>
              </div>
          ) : (
              <div className="flex gap-3">
                  <button
                      type="button"
                      onClick={onClose}
                      className="w-24 bg-slate-100 hover:bg-slate-200 text-slate-700 h-12 rounded-2xl font-bold text-xs shadow-sm active:scale-[0.98] transition-all"
                  >
                      ĐÓNG
                  </button>
                  <button 
                      type="button"
                      onClick={() => setShowPaymentModal(true)}
                      className="flex-1 bg-slate-900 hover:bg-slate-800 text-white h-12 rounded-2xl font-bold text-base shadow-lg shadow-slate-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                      <span>THANH TOÁN</span>
                      <ChevronRight className="w-5 h-5" />
                  </button>
              </div>
          )}
      </div>

      <AuditTrailModal />
      <CancellationPenaltyModal 
        isOpen={showPenaltyModal}
        onClose={() => setShowPenaltyModal(false)}
        roomName={activeRoom?.name || 'N/A'}
        customerName={bill?.customer_name || 'Khách lẻ'}
        bill={bill}
        onConfirm={handleConfirmCancelWithPenalty}
        isLoading={isLoading}
      />
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

      <EditBookingModal 
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditStaff(undefined);
        }}
        booking={activeBooking!}
        room={activeRoom!}
        verifiedStaff={editStaff}
        onSuccess={() => {
          setShowEditModal(false); // Close sub-modal first
          loadBill();
          onUpdate();
          onClose(); // Then close Folio
        }}
      />

      <ChangeRoomModal 
        isOpen={showChangeRoomModal}
        onClose={() => {
          setShowChangeRoomModal(false);
          setEditStaff(undefined);
        }}
        bookingId={activeBooking?.id!} 
        currentRoomName={activeRoom?.name || 'N/A'} 
        verifiedStaff={editStaff} 
        onSuccess={() => { 
          setShowChangeRoomModal(false); // Close sub-modal first
          onUpdate();
          onClose(); // Then close Folio
        }}
      />

      <DepositModal 
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        bookingId={activeBooking?.id!} 
        customerId={activeBooking?.customer_id}
        bill={bill}
        verifiedStaff={editStaff}
        onSuccess={() => {
          setShowDepositModal(false); // Close sub-modal first
          loadBill();
          onUpdate();
          onClose(); // Then close Folio
        }}
      />

      {groupDetails && groupDetails.is_group && groupDetails.master_id === activeBooking?.id && (
        <TransferGroupMasterModal
          isOpen={isTransferGroupMasterModalOpen}
          onClose={() => setIsTransferGroupMasterModalOpen(false)}
          onSuccess={() => {
            setIsTransferGroupMasterModalOpen(false); // Close sub-modal first
            onUpdate();
            onClose(); // Then close Folio
          }}
          oldMasterBooking={{
            id: activeBooking?.id!,
            room_name: activeRoom?.name,
            customer_name: bill?.customer_name || 'Khách lẻ'
          } as any}
          childBookings={groupDetails.rooms
            .filter((m: any) => m.booking_id !== activeBooking?.id)
            .map((m: any) => ({
              id: m.booking_id,
              room_name: m.room_name,
              customer_name: m.customer_name
            })) as any}
        />
      )}
    </div>
  );

  // --- FINAL RENDER LOGIC (Anti-Flicker) ---
  if (!mounted || (!isOpen && !lastData)) return null;
  if (!activeRoom || !activeBooking) return null;

  return createPortal(
    <div className={cn(
      "fixed inset-0 z-[60000] flex items-center justify-center p-0 md:p-4 transition-all duration-300",
      isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
    )}>
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />
      
      <div className={cn(
        "relative w-full h-full md:h-auto md:max-h-[95vh] md:max-w-[800px] bg-white md:rounded-[48px] shadow-2xl overflow-hidden flex flex-col transition-all duration-300 transform",
        isOpen ? "translate-y-0 opacity-100 scale-100" : "translate-y-10 md:translate-y-0 md:scale-95 opacity-0"
      )}>
        {SecurityModals}
        {ModalContent}
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

// --- Grouped Room Member Card Component ---
interface GroupedRoomMemberCardProps {
  member: any; // Type should be more specific, e.g., GroupMember
  groupColor: string;
  onSelect?: (memberId: string) => void;
  isSelected?: boolean;
  isMaster?: boolean;
  onOpenFolio?: (member: any) => void;
  onUngroup?: (memberId: string) => void;
}

const GroupedRoomMemberCard: React.FC<GroupedRoomMemberCardProps> = ({ 
  member, 
  groupColor, 
  onSelect, 
  isSelected,
  isMaster,
  onOpenFolio,
  onUngroup
}) => {
  const textColor = getContrastTextColor(groupColor);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelect) {
      onSelect(member.booking_id);
    }
  };

  return (
    <div
      className={cn(
        "rounded-[24px] p-4 bg-blue-600 text-white shadow-sm hover:shadow-md transition-all",
        "cursor-pointer",
        isSelected && "ring-2 ring-white ring-offset-2"
      )}
      onClick={handleClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl font-black">{member.room_name}</span>
          {isMaster && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full border border-white/50">
              CHỦ NHÓM
            </span>
          )}
        </div>
        {onSelect && (
          <Checkbox checked={isSelected} className="w-4 h-4 rounded-full border-white" />
        )}
      </div>
      <div className="text-sm">
        {member.customer_name || "Khách lẻ"}
      </div>
      <div className="mt-2 text-lg font-bold">
        {formatMoney(member.payable_amount || 0)}
      </div>
      
      {/* Tách nhóm button for child rooms */}
      {!isMaster && onUngroup && (
        <button
          className="mt-3 w-full py-1.5 px-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
          onClick={(e) => {
            e.stopPropagation();
            onUngroup(member.booking_id);
          }}
        >
          <Unlink className="w-3 h-3" />
          Tách nhóm
        </button>
      )}
    </div>
  );
};

function QuickActionButton({ 
    icon: Icon, 
    label, 
    onClick, 
    variant = 'default',
    disabled = false
}: { 
    icon: any, 
    label: string, 
    onClick: () => void,
    variant?: 'default' | 'danger',
    disabled?: boolean
}) {
    return (
        <div 
            onClick={() => !disabled && onClick()}
            className={cn(
                "group flex flex-col items-center gap-2 flex-none min-w-[64px]",
                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            )}
        >
            <div className={cn(
                "w-14 h-14 rounded-[28px] flex items-center justify-center transition-all duration-300 shadow-sm",
                variant === 'danger' 
                    ? "bg-white text-rose-500 hover:bg-rose-50 hover:text-rose-600 hover:shadow-md"
                    : "bg-white text-slate-400 hover:bg-white hover:text-blue-500 hover:shadow-md",
                disabled && "hover:bg-white hover:text-inherit hover:shadow-sm"
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
