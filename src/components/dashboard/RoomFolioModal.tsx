import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, LogOut, Edit3, DollarSign, Printer, Search, Coffee, Trash2, ChevronDown, ChevronUp, ChevronRight, Clock, Plus, Minus, AlertCircle, MessageSquare, User, ShieldCheck, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';
import { Room, Booking } from '@/types/dashboard';
import { bookingService, BookingBill } from '@/services/bookingService';
import { serviceService, Service, BookingServiceItem } from '@/services/serviceService';
import PaymentModal from './PaymentModal';
import BillBreakdown from './BillBreakdown';
import CancellationPenaltyModal from './CancellationPenaltyModal';
import EditBookingModal from './folio/EditBookingModal';
import DepositModal from './folio/DepositModal';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import { securityService, SecurityAction } from '@/services/securityService';
import { useSecurity } from '@/hooks/useSecurity';
import SecurityApprovalModal from '@/components/shared/SecurityApprovalModal';

interface RoomFolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: Room;
  booking: Booking;
  onUpdate: () => void;
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

import { supabase } from '@/lib/supabase';

export default function RoomFolioModal({ isOpen, onClose, room, booking, onUpdate, pendingApproval }: RoomFolioModalProps) {
  const { confirm: confirmDialog, alert } = useGlobalDialog();
  const [bill, setBill] = useState<BookingBill | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<any>(null); // New state for full approval details
  const [internalPendingApproval, setInternalPendingApproval] = useState<any>(pendingApproval);

  // Sync internal state with props, but allow internal updates
  useEffect(() => {
    setInternalPendingApproval(pendingApproval);
  }, [pendingApproval]);

  // Real-time listener for THIS specific request inside the modal
  useEffect(() => {
    if (!isOpen || !internalPendingApproval?.id) return;

    const channel = supabase
        .channel(`folio_approval_${internalPendingApproval.id}`)
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'pending_approvals',
            filter: `id=eq.${internalPendingApproval.id}`
        }, (payload) => {
            const newRec = payload.new as any;
            if (newRec.status !== internalPendingApproval.status) {
                setInternalPendingApproval((prev: any) => ({
                    ...prev,
                    status: newRec.status,
                    request_data: newRec.request_data
                }));
                
                // If approved, trigger onUpdate to refresh parent dashboard
                if (newRec.status === 'APPROVED') {
                    onUpdate();
                }
            }
        })
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isOpen, internalPendingApproval?.id]);

  const customerBalance = bill?.customer_balance ?? 0;
  const hasCustomerBalance = customerBalance !== 0;
  const isCustomerInDebt = customerBalance < 0;
  
  // Tổng cộng cần thanh toán bao gồm cả nợ cũ
  const amountToPayWithDebt = bill ? (bill.amount_to_pay + (isCustomerInDebt ? Math.abs(customerBalance) : 0)) : 0;
  
  // Service State
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
  const [editStaff, setEditStaff] = useState<{ id: string, name: string } | undefined>(undefined);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [cancellationStaff, setCancellationStaff] = useState<{ id: string, name: string } | undefined>(undefined);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [showResumeSecurityModal, setShowResumeSecurityModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { verify, SecurityModals } = useSecurity({
    onMinimize: () => {
      // User clicked "Minimize" on the Security Modal
      // 1. Close the Security Modal (handled by useSecurity)
      // 2. Close the Penalty Modal (if open)
      setShowPenaltyModal(false);
      // 3. Close the Folio Modal (return to dashboard)
      onClose();
      // 4. Trigger update to show "Pending" status on dashboard
      onUpdate();
    }
  });

  // Handle Pending Approval
  useEffect(() => {
    if (isOpen && internalPendingApproval) {
      if (internalPendingApproval.status === 'APPROVED') {
        // If approved, we might want to fetch who approved it
        // Or we can just use the status to enable the "Finish" button
        securityService.checkApprovalStatus(internalPendingApproval.id).then(data => {
            setApprovalStatus(data);
        });
      } else {
        setApprovalStatus(null);
      }
    } else {
        setApprovalStatus(null);
    }
  }, [isOpen, internalPendingApproval]);

  // Execute Finish Cancellation (Post-Approval)
  const handleFinishCancellation = async () => {
    // If we have pendingApproval but no approvalStatus, try to fetch it first
    let currentStatus = approvalStatus;
    if (!currentStatus && internalPendingApproval?.id) {
        try {
            currentStatus = await securityService.checkApprovalStatus(internalPendingApproval.id);
            setApprovalStatus(currentStatus);
        } catch (e) {
            console.error("Failed to fetch approval status", e);
        }
    }

    if (!internalPendingApproval || !currentStatus) {
        toast.error("Thiếu thông tin phê duyệt");
        return;
    }

    // Reuse logic
    executeCancellation({
        id: currentStatus.approved_by_id,
        name: currentStatus.approved_by_name
    });
  };

  // Resume Approval Flow (Open Security Modal manually)
  const handleResumeApproval = () => {
    if (internalPendingApproval?.id) {
        setShowResumeSecurityModal(true);
    }
  };

  // Handle Resume Success
  const handleResumeSuccess = (staffId?: string, staffName?: string) => {
    setShowResumeSecurityModal(false);
    toast.success("Đã duyệt thành công! Vui lòng bấm Hoàn tất để xử lý.");
    // We do NOT execute cancellation automatically anymore.
    // The user must click "Hoàn tất" manually.
  };

  const executeCancellation = async (approver: any) => {
     setIsLoading(true);
     try {
         const reason = internalPendingApproval?.request_data?.reason || 'Hủy phòng (Đã duyệt)';
         const penaltyAmount = internalPendingApproval?.request_data?.penalty_amount || 0;
         const paymentMethod = internalPendingApproval?.request_data?.payment_method || 'cash';

         const result = await bookingService.cancelBooking(
             booking.id, 
             approver,
             penaltyAmount,
             paymentMethod,
             reason
         );

         if (result.success) {
             onUpdate();
             onClose();
             toast.success(result.message || "Huỷ phòng hoàn tất");
         } else {
             toast.error(result.message || "Lỗi khi huỷ phòng");
         }
     } catch (error: any) {
         console.error("Finish cancel failed", error);
         toast.error(error.message);
     } finally {
         setIsLoading(false);
     }
  };

  // --- Search for PaymentModal usage ---

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
    try {
      const data = await bookingService.calculateBill(booking.id);
      setBill(data);
    } catch (error) {
      console.error('Error loading bill:', error);
    } finally {
      setIsLoading(false);
    }
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
      
      // Security Check
      verify('folio_add_service', async (staffId, staffName) => {
        setIsSaving(true);
        try {
            // Process sequentially to ensure order
            for (const item of pendingServices) {
               await serviceService.addServiceToBooking(booking.id, item.service_id, 1, item.price_at_time);
            }
            
            setPendingServices([]);
            await Promise.all([loadServices(), loadBill()]);
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
    // Step 2: Verify permission with full data
    verify('checkin_cancel_booking', async (staffId, staffName) => {
      // Step 3: Execute Cancellation after Approval
      setIsLoading(true);
      try {
        const result = await bookingService.cancelBooking(
          booking.id, 
          staffId ? { id: staffId, name: staffName || 'Nhân viên' } : undefined,
          penaltyAmount,
          paymentMethod,
          reason
        );

        if (result.success) {
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
      room_id: room.id, // Critical for dashboard matching
      room_number: room.name || 'N/A',
      customer_name: booking.customer_name || 'Khách vãng lai',
      booking_id: booking.id.slice(0, 8),
      full_booking_id: booking.id, // For auto-finalize execution
      reason: reason,
      penalty_amount: penaltyAmount,
      payment_method: paymentMethod
    }, {
      skipWaitingModal: true
    });
  };

  const handleChangeRoom = async () => {
    verify('folio_change_room', () => {
      toast.info("Tính năng đổi phòng đang được phát triển");
    });
  };

  const filteredServices = availableServices.filter(s => 
      s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200 p-0 sm:p-4">
      {SecurityModals}

      {/* Manual Resume Security Modal */}
      <SecurityApprovalModal
        isOpen={showResumeSecurityModal}
        onClose={() => setShowResumeSecurityModal(false)}
        requestId={pendingApproval?.id || null}
        onApproved={handleResumeSuccess}
        actionName="Hủy phòng (Tiếp tục)"
        onMinimize={() => setShowResumeSecurityModal(false)}
      />

      <div className="w-full h-full sm:w-full sm:max-w-6xl sm:h-[90vh] bg-slate-50 sm:rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        <div className="h-16 flex justify-between items-center px-4 bg-white z-10 shrink-0 shadow-sm border-b border-slate-100">
            <div className="flex items-center gap-3">
                <span className="bg-slate-900 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg uppercase tracking-wider shadow-sm">Folio</span>
                <h2 className="text-lg font-bold text-slate-800">Phòng {room.name}</h2>
                
                {/* Approval Status Banner */}
                {internalPendingApproval && (
                  <div className={cn(
                    "px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold uppercase tracking-wide ml-2 animate-in fade-in slide-in-from-left-4",
                    internalPendingApproval.status === 'APPROVED' ? "bg-green-100 text-green-700 border border-green-200" : "bg-yellow-100 text-yellow-700 border border-yellow-200"
                  )}>
                    {internalPendingApproval.status === 'APPROVED' ? (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Đã được duyệt hủy
                      </>
                    ) : (
                      <>
                        <Clock className="w-4 h-4 animate-pulse" />
                        Đang chờ duyệt hủy
                      </>
                    )}
                  </div>
                )}
            </div>
            <div className="flex items-center gap-2">
                <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-full transition-all active:scale-95">
                    <X className="w-5 h-5 text-slate-500" />
                </button>
            </div>
        </div>

        {/* Approval Status Banner - Fixed at Top */}
        {internalPendingApproval && (
            <div className={cn(
                "mx-4 mt-4 mb-0 p-4 rounded-2xl flex items-center justify-between shadow-sm border animate-in slide-in-from-top-4 duration-300",
                internalPendingApproval.status === 'APPROVED' 
                    ? "bg-green-50 border-green-200" 
                    : "bg-amber-50 border-amber-200"
            )}>
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        internalPendingApproval.status === 'APPROVED' ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
                    )}>
                        {internalPendingApproval.status === 'APPROVED' ? <ShieldCheck className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                    </div>
                    <div>
                        <h4 className={cn("font-bold text-sm", internalPendingApproval.status === 'APPROVED' ? "text-green-800" : "text-amber-800")}>
                            {internalPendingApproval.status === 'APPROVED' ? 'Yêu cầu hủy đã được duyệt' : 'Đang chờ duyệt hủy phòng'}
                        </h4>
                        <p className={cn("text-xs font-medium", internalPendingApproval.status === 'APPROVED' ? "text-green-600" : "text-amber-600")}>
                            {internalPendingApproval.status === 'APPROVED' ? 'Vui lòng bấm hoàn tất bên dưới' : 'Vui lòng đợi quản lý xác nhận'}
                        </p>
                    </div>
                </div>
                
                {internalPendingApproval.status === 'APPROVED' ? (
                    <button 
                        onClick={handleFinishCancellation}
                        disabled={isLoading}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-green-200 active:scale-95 transition-all animate-pulse whitespace-nowrap"
                    >
                        Hoàn tất ngay
                    </button>
                ) : (
                    <button 
                        onClick={handleResumeApproval}
                        className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-bold rounded-lg transition-all active:scale-95 whitespace-nowrap flex items-center gap-1.5"
                    >
                        <KeyRound className="w-3.5 h-3.5" />
                        Nhập PIN
                    </button>
                )}
            </div>
        )}

        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-4">


            {/* Quick Actions - Scrollable */}
            <div className="flex gap-4 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden px-1 mb-6">
                <QuickActionButton icon={LogOut} label="Đổi phòng" onClick={() => handleChangeRoom()} />
                <QuickActionButton icon={Edit3} label="Sửa giờ" onClick={() => setShowEditModal(true)} />
                <QuickActionButton icon={DollarSign} label="Nạp tiền" onClick={() => setShowDepositModal(true)} />
                <QuickActionButton icon={Printer} label="In phiếu" onClick={() => {}} />
                
                {/* Cancel Button Logic */}
                {internalPendingApproval && internalPendingApproval.status === 'APPROVED' ? (
                  <button 
                    onClick={handleFinishCancellation}
                    disabled={isLoading}
                    className={cn(
                        "flex flex-col items-center justify-center gap-2 min-w-[80px] h-[80px] rounded-2xl transition-all active:scale-95 shadow-sm border group",
                        "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-white group-hover:text-green-600 transition-colors">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wide">Hoàn tất Hủy</span>
                  </button>
                ) : (
                  <QuickActionButton 
                    icon={Trash2} 
                    label="Huỷ phòng" 
                    onClick={() => handleCancelBooking()} 
                    variant="danger" 
                    disabled={!!internalPendingApproval} // Disable if pending
                  />
                )}
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

                    <div className="flex justify-center items-center gap-3 mb-6 h-10">
                        <div className="text-4xl font-bold tracking-tight flex items-center h-full">
                            {bill ? formatMoney(amountToPayWithDebt) : '---'}
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
                                     booking.booking_type === 'hourly' ? 'Theo Giờ' :
                                     booking.booking_type === 'overnight' ? 'Qua Đêm' : 'Theo Ngày'}
                                </div>
                            </div>
                            <div className="font-bold text-lg leading-tight">
                                {(() => {
                                    if (!bill) return '--';
                                    
                                    // Priority 1: Check explanation for explicit unit (fixes auto-switch cases)
                                    const hasDay = bill.explanation?.some(e => e.includes('ngày') && (e.includes('x') || e.includes('Tính')));
                                    const hasNight = bill.explanation?.some(e => e.includes('đêm') && (e.includes('x') || e.includes('Tính')));
                                    
                                    if (hasDay || hasNight || bill.rental_type === 'daily' || bill.rental_type === 'overnight') {
                                        const unit = hasNight || bill.rental_type === 'overnight' ? 'đêm' : 'ngày';
                                        const exp = bill.explanation?.find(e => e.includes(` ${unit}`) && (e.includes('x') || e.includes('Tính')));
                                        if (exp) {
                                            const match = exp.match(/(\d+)\s+(?:ngày|đêm)/);
                                            if (match) return `${match[1]} ${unit}`;
                                        }
                                        // Fallback if no explicit number found but type is daily/overnight
                                        return `1 ${unit}`;
                                    }
                                    
                                    return bill.duration_text;
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
                            {/* 2. Detailed Breakdown (Re-using BillBreakdown logic but inline/cleaner) */}
                            {bill && (
                                <BillBreakdown 
                                    bill={bill} 
                                    isDark={true}
                                    className="pt-2"
                                    hideAuditLog={true}
                                />
                            )}
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
                                <span>{formatMoney(pendingServices.reduce((sum, item) => sum + (item.quantity * item.price_at_time), 0))}</span>
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
                                        {formatMoney(item.total_price)}
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
                                <div key={item.service_id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm">
                                            {item.quantity}x
                                        </div>
                                        <div>
                                            <div className="font-medium text-slate-900">{item.service?.name}</div>
                                            <div className="text-xs text-slate-500">{formatMoney(item.price_at_time)}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="font-bold text-slate-700">
                                            {formatMoney(item.total_price)}
                                        </div>
                                        <button 
                                            onClick={() => handleRemoveService(item.service_id)}
                                            disabled={!!processingServiceId}
                                            className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-500 flex items-center justify-center transition-colors active:scale-90"
                                            title="Giảm số lượng / Xóa"
                                        >
                                            <Minus className="w-4 h-4" />
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

        <div className="bg-white border-t border-slate-100 px-4 py-4 shrink-0">
            {pendingServices.length > 0 ? (
                <div className="flex gap-2">
                    <button 
                        onClick={() => setPendingServices([])}
                        disabled={isSaving}
                        className="w-24 bg-slate-100 hover:bg-slate-200 text-slate-600 h-14 rounded-[28px] font-bold text-sm shadow-sm active:scale-[0.98] transition-all flex items-center justify-center"
                    >
                        HỦY
                    </button>
                    <button 
                        onClick={() => handleSaveServices()}
                        disabled={isSaving}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white h-14 rounded-[28px] font-bold text-lg shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 animate-pulse"
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
                </div>
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

        <AuditTrailModal />
        <CancellationPenaltyModal 
          isOpen={showPenaltyModal}
          onClose={() => setShowPenaltyModal(false)}
          roomName={room.name}
          customerName={bill?.customer_name || 'Khách lẻ'}
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
          booking={booking}
          room={room}
          verifiedStaff={editStaff}
          onSuccess={() => {
            loadBill();
            onUpdate();
          }}
        />

        <DepositModal 
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          bookingId={booking.id}
          bill={bill}
          onSuccess={() => {
            loadBill();
            onUpdate();
          }}
        />
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
