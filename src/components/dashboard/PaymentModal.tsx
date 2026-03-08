'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Banknote, 
  CreditCard, 
  Wallet, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Calculator,
  MessageSquare,
  TicketPercent,
  PlusCircle,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';
import { BookingBill, bookingService } from '@/services/bookingService';
import { customerService, Customer } from '@/services/customerService';
import BillBreakdown from './BillBreakdown';
import CustomerSelectionModal from './CustomerSelectionModal';
import { useGlobalDialog } from '@/providers/GlobalDialogProvider';
import { toast } from 'sonner';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { securityService, SecurityAction } from '@/services/securityService';
import { useSecurity } from '@/hooks/useSecurity';
import { groupBookingService, GroupMember } from '@/services/groupBookingService';

import { usePermission } from '@/hooks/usePermission';
import { PERMISSION_KEYS } from '@/services/permissionService';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: BookingBill;
  onSuccess: () => void;
}

export default function PaymentModal({ isOpen, onClose, bill, onSuccess }: PaymentModalProps) {
  const [mounted, setMounted] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const customerBalance = bill.customer_balance ?? 0;
  const oldDebt = customerBalance < 0 ? Math.abs(customerBalance) : 0;

  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER' | 'DEBT'>('CASH');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [surcharge, setSurcharge] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefundConfirmed, setIsRefundConfirmed] = useState(false);

  // Security
  const { verify, SecurityModals } = useSecurity();
  const { can } = usePermission();
  const [walkInCustomerId, setWalkInCustomerId] = useState<string | null>(null);
  
  // Customer selection for walk-in debt
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [overriddenCustomer, setOverriddenCustomer] = useState<Customer | null>(null);
  const [groupChildren, setGroupChildren] = useState<GroupMember[]>([]);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [selectedGroupPayableTotal, setSelectedGroupPayableTotal] = useState<number>(0);
  const [isGroupLoading, setIsGroupLoading] = useState(false);

  const handleCustomerSelect = async (customer: Customer) => {
    try {
      await bookingService.updateBookingDetails({
        bookingId: bill.booking_id,
        customerName: customer.full_name,
        checkInAt: bill.check_in_at,
        priceApplyMode: 'all',
        reason: 'Cập nhật khách hàng khi thanh toán (Khách vãng lai nợ)',
        customerId: customer.id
      });
      setOverriddenCustomer(customer);
      setShowCustomerModal(false);
      toast.success('Đã cập nhật khách hàng thành công');
    } catch (e: any) {
      toast.error(e.message || 'Lỗi cập nhật khách hàng');
    }
  };

  // Calculate dynamic totals
  const payableForCurrentBooking = bill.amount_to_pay;
  const totalBeforeModalAdjustments = payableForCurrentBooking + oldDebt + (bill.is_group_bill && !bill.master_booking_id ? selectedGroupPayableTotal : 0);
  const finalTotalToPay = totalBeforeModalAdjustments - discount + surcharge;
  
  const balanceDiff = amountPaid - finalTotalToPay;
  const isDebt = balanceDiff < 0;

  // Hydration safety
  useEffect(() => {
    setMounted(true);
    // Fetch Walk-in Customer ID
    const fetchWalkInId = async () => {
      const walkIn = await customerService.getOrCreateWalkInCustomer();
      if (walkIn) {
        setWalkInCustomerId(walkIn.id);
      }
    };
    fetchWalkInId();
  }, []);

  const canPayment = can(PERMISSION_KEYS.CREATE_TRANSACTION);
  const disablePayment = !canPayment;

  // Auto-fill debt reason
  useEffect(() => {
    if (isDebt && !notes) {
      setNotes(`Khách nợ lại ${formatMoney(Math.abs(balanceDiff))}`);
    } else if (!isDebt && notes.startsWith('Khách nợ lại')) {
      setNotes('');
    }
  }, [isDebt, balanceDiff]);

  // Update amountPaid, discount, surcharge if bill or selectedGroupPayableTotal changes
  useEffect(() => {
    setDiscount(bill.discount_amount || 0);
    setSurcharge(bill.custom_surcharge || 0);

    const initialPayableForCurrentBooking = bill.amount_to_pay;
    const initialTotalBeforeModalAdjustments = initialPayableForCurrentBooking + oldDebt + selectedGroupPayableTotal;
    const initialFinalTotalToPay = initialTotalBeforeModalAdjustments - (bill.discount_amount || 0) + (bill.custom_surcharge || 0);
    setAmountPaid(initialFinalTotalToPay);
  }, [bill, oldDebt, selectedGroupPayableTotal]);

  useEffect(() => {
    const loadGroup = async () => {
      setIsGroupLoading(true);
      try {
        const details = await groupBookingService.getGroupDetails(bill.booking_id);
        
        if (!details.is_group) {
          setGroupChildren([]);
          setSelectedChildIds([]);
          setSelectedGroupPayableTotal(0);
          return;
        }

        const rawList = details.rooms || details.children || details.members || [];
        const children = rawList
          .filter(m => !m.is_master)
          .map((m) => ({
            ...m,
            total_amount: Number((m as any).total_amount || (m as any).bill_details?.total_amount || 0),
            deposit_amount: Number((m as any).deposit_amount || (m as any).bill_details?.deposit_amount || 0),
            payable_amount: Number((m as any).payable_amount || (m as any).bill_details?.amount_to_pay || 0),
          }));
        
        const allChildIds = children.map(m => m.booking_id);
        const initialSelectedTotal = children.reduce((sum, c) => sum + (c.payable_amount || 0), 0);

        setGroupChildren(children);
        setSelectedChildIds(allChildIds);
        setSelectedGroupPayableTotal(initialSelectedTotal);
      } catch (e: any) {
        console.error('Error loading group details:', JSON.stringify({
          message: e.message,
          stack: e.stack,
          bookingId: bill.booking_id,
          isGroupBill: bill.is_group_bill,
          originalError: e
        }, null, 2));
        setError(e.message || 'Lỗi khi tải chi tiết nhóm phòng.');
        setGroupChildren([]);
        setSelectedChildIds([]);
        setSelectedGroupPayableTotal(0);
      } finally {
        setIsGroupLoading(false);
      }
    };

    if (isOpen) {
      // Only load group details if this bill is for a group master booking
      if (bill.is_group_bill && !bill.master_booking_id) {
        loadGroup();
      } else { // If it's not a group master bill, ensure group states are cleared
        setGroupChildren([]);
        setSelectedChildIds([]);
        setSelectedGroupPayableTotal(0);
      }
    }
  }, [isOpen, bill.booking_id, bill.is_group_bill, bill.master_booking_id]);

  useEffect(() => {
    const refreshSelectedTotal = async () => {
      if (!bill.is_group_bill) return;
      if (selectedChildIds.length === 0) {
        setSelectedGroupPayableTotal(0);
        return;
      }

      setIsGroupLoading(true);
      try {
        const details = await groupBookingService.getGroupDetails(bill.booking_id, selectedChildIds);
        const selectedTotal = Number(details.selected_payable_total ?? 0);
        setSelectedGroupPayableTotal(selectedTotal);
      } catch (e: any) {
        setSelectedGroupPayableTotal(0);
      } finally {
        setIsGroupLoading(false);
      }
    };

    if (isOpen) {
      refreshSelectedTotal();
    }
  }, [isOpen, bill.booking_id, bill.is_group_bill, selectedChildIds.join('|')]);

  useEffect(() => {
    if (isOpen && scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = 0; // Cuộn lên đầu khi modal mở
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  if (isSuccess) {
    return createPortal(
      <div className="fixed inset-0 z-[60000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300 p-4">
        <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
          <div className="p-10 text-center space-y-8">
            <div className="w-24 h-24 bg-emerald-500 text-white rounded-[32px] flex items-center justify-center mx-auto shadow-xl shadow-emerald-200 rotate-3">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">Thành công!</h2>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Phòng {bill.room_number} • {bill.customer_name}</p>
            </div>

            <div className="bg-slate-50 rounded-[32px] p-8 space-y-6 border border-slate-100 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
              
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Tổng cộng</span>
                <span className="font-black text-slate-900 text-xl tracking-tight">{formatMoney(finalTotalToPay)}</span>
              </div>
              
              {bill.is_group_bill && (
                <div className="flex justify-between items-center text-sm text-indigo-600 bg-indigo-50 p-2 rounded-lg">
                  <span className="font-bold">Gộp {bill.group_members?.length} phòng</span>
                  <span>+{formatMoney(bill.group_total || 0)}</span>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Khách trả</span>
                <span className="font-black text-blue-600 text-xl tracking-tight">{formatMoney(amountPaid)}</span>
              </div>
              
              <div className="h-px bg-slate-200" />
              
              {balanceDiff < 0 ? (
                <div className="flex justify-between items-center p-4 bg-rose-500 text-white rounded-2xl shadow-lg shadow-rose-100">
                  <span className="font-black text-[10px] uppercase tracking-widest opacity-80">Ghi nợ</span>
                  <span className="font-black text-2xl tracking-tight">{formatMoney(Math.abs(balanceDiff))}</span>
                </div>
              ) : balanceDiff > 0 ? (
                <div className="flex justify-between items-center p-4 bg-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-100">
                  <span className="font-black text-[10px] uppercase tracking-widest opacity-80">Tiền thừa</span>
                  <span className="font-black text-2xl tracking-tight">{formatMoney(balanceDiff)}</span>
                </div>
              ) : (
                <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-lg shadow-slate-100 text-center">
                  <span className="font-black text-sm uppercase tracking-widest">Đã thanh toán đủ</span>
                </div>
              )}

              {notes && (
                <div className="text-left space-y-2">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ghi chú</span>
                   <div className="text-sm font-bold text-slate-600 bg-white p-4 rounded-2xl border border-slate-100 italic leading-relaxed">
                      "{notes}"
                   </div>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="w-full h-16 bg-slate-900 hover:bg-black text-white rounded-[24px] font-black text-lg transition-all active:scale-[0.98] shadow-xl shadow-slate-200"
            >
              HOÀN TẤT
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  const processPayment = async (staffId?: string, staffName?: string) => {
    setIsProcessing(true);
    setError(null);
    try {
      const result = await bookingService.processCheckout({
        bill, // Pass full bill
        paymentMethod,
        amountPaid,
        discount,
        surcharge,
        notes,
        verifiedStaff: staffId ? { id: staffId, name: staffName || '' } : undefined,
        selectedChildBookingIds: bill.is_group_bill ? selectedChildIds : undefined,
      });

      if (result.success) {
        setIsSuccess(true);
        onSuccess();
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi xử lý thanh toán');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckout = () => {
    // Validate: If debt, require notes
    if (isDebt && !notes.trim()) {
        setError('Vui lòng ghi chú lý do nợ (Ví dụ: Khách quen, Thiếu tiền mặt...)');
        return;
    }

    // Validate: Block Walk-in Debt (Check ID and Name)
    // Check if we have an overridden customer or fallback to bill
    const currentCustomerId = overriddenCustomer?.id || bill.customer_id;
    const currentCustomerName = overriddenCustomer?.full_name || bill.customer_name;
    
    const isWalkIn = (walkInCustomerId && currentCustomerId === walkInCustomerId) || 
                     currentCustomerName?.toLowerCase().includes('khách vãng lai') ||
                     currentCustomerName?.toLowerCase().includes('khach vang lai');

    if (isDebt && isWalkIn) {
        // Instead of error, open customer selection modal
        setShowCustomerModal(true);
        toast.info('Khách vãng lai không được phép nợ. Vui lòng chọn khách hàng.');
        return;
    }

    // Chain of Responsibility for Security Checks
    
    // 4. Standard Payment Check (Final Step)
    const step4_Payment = () => {
      if (!isDebt) {
        verify('checkout_payment', processPayment, {
          amount: amountPaid,
          room_number: bill.room_number,
          customer_name: currentCustomerName
        });
      } else {
        processPayment(); // Skip payment check if it's a debt case (handled by step 3)
      }
    };

    // 3. Debt Check
    const step3_Debt = () => {
      if (isDebt) {
        verify('checkout_mark_as_debt', processPayment, {
          debt_amount: Math.abs(balanceDiff),
          room_number: bill.room_number,
          customer_name: currentCustomerName,
          reason: notes
        });
      } else {
        step4_Payment();
      }
    };

    // 2. Custom Surcharge Check
    const step2_Surcharge = () => {
      if (surcharge > 0 && surcharge !== (bill.custom_surcharge || 0)) {
        verify('checkout_custom_surcharge', step3_Debt, {
          surcharge_amount: surcharge,
          room_number: bill.room_number,
          customer_name: currentCustomerName
        });
      } else {
        step3_Debt();
      }
    };

    // 1. Discount Check (Start)
    if (discount > 0) {
      verify('checkout_discount', step2_Surcharge, {
        discount_amount: discount,
        room_number: bill.room_number,
        customer_name: currentCustomerName
      });
    } else {
      step2_Surcharge();
    }
  };

    // --- Payment Methods (Aligned with CheckInModal) ---
    // const PAYMENT_METHODS = [
    //     { id: 'CASH', label: 'TIỀN MẶT' },
    //     { id: 'TRANSFER', label: 'CHUYỂN KHOẢN' },
    // ];

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex flex-col justify-end sm:justify-center items-center backdrop-blur-md bg-slate-900/60">
      {SecurityModals}
      
      {/* Modal Container - Matches CheckInModal rounded-[40px] */}
      <div className="w-full h-full sm:w-full sm:max-w-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-[40px] bg-slate-50 flex flex-col shadow-2xl overflow-hidden relative transition-all duration-300">
        
        {/* --- HEADER --- */}
        <div className="h-16 flex justify-between items-center px-6 bg-white z-50 shrink-0 shadow-sm border-b border-slate-100/50">
          <div className="flex items-center gap-3">
            <span className="bg-slate-900 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg uppercase tracking-wider shadow-sm">Thanh toán</span>
            <h2 className="text-lg font-bold text-slate-800">Phòng {bill.room_number}</h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-full transition-all active:scale-95">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* --- BODY --- */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 relative" ref={scrollAreaRef}>
          
          {/* 1. TOTAL AMOUNT & BREAKDOWN */}
          <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4 relative z-20">
               <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">Tổng thanh toán</span>
                  {bill.is_group_bill && (
                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full uppercase tracking-wider">
                      Nhóm {groupChildren.length || bill.group_members?.length || 0} phòng
                    </span>
                  )}
               </div>

              <div className="text-center py-2 relative flex items-center justify-center gap-3">
                   <div className="text-4xl font-black text-slate-800 tracking-tight">
                      {formatMoney(finalTotalToPay)}
                   </div>
                   {/* Breakdown Toggle Button (Inline with Amount) */}
                   <div className="relative">
                       <button
                          onClick={() => setShowBreakdown(!showBreakdown)}
                          className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm",
                              showBreakdown ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                          )}
                       >
                          <span className="font-black font-serif text-lg leading-none">!</span>
                       </button>

                       {/* Breakdown Tooltip (Popover Style) */}
                       {showBreakdown && (
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 z-[100] w-[320px] animate-in fade-in zoom-in-95 duration-200">
                              <div className="bg-white rounded-[24px] p-5 shadow-2xl border border-slate-100 ring-4 ring-slate-50/50 flex flex-col gap-4 relative">
                                  {/* Arrow */}
                                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45 border-t border-l border-slate-100"></div>
                                  
                                  <div className="flex justify-between items-center pb-3 border-b border-slate-50 relative z-10">
                                      <span className="text-xs font-bold text-slate-400 uppercase">Chi tiết tính tiền</span>
                                      <button onClick={() => setShowBreakdown(false)} className="p-1 hover:bg-slate-100 rounded-full">
                                          <X className="w-4 h-4 text-slate-400" />
                                      </button>
                                  </div>
                                  
                                  <div className="max-h-[40vh] overflow-y-auto pr-1 relative z-10">
                                      <BillBreakdown 
                                        bill={bill} 
                                        hideSummary={true}
                                      />
                                  </div>

                                  <div className="pt-2 border-t border-slate-50 relative z-10">
                                      <button 
                                        onClick={() => setShowBreakdown(false)}
                                        className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-colors"
                                      >
                                          Đóng
                                      </button>
                                  </div>
                              </div>
                          </div>
                      )}
                   </div>
              </div>
              
               {discount > 0 && (
                  <div className="text-center text-sm font-medium text-emerald-600 -mt-2">
                      Đã giảm: {formatMoney(discount)}
                  </div>
               )}

                {/* GROUP BILL DETAILS */}
                {(bill.is_group_bill && !bill.master_booking_id) && (bill.is_group_bill || groupChildren.length > 0) && (
                  <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 text-left space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                        Chọn phòng trong đoàn
                      </h4>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedChildIds(groupChildren.map(m => m.booking_id))}
                          disabled={isGroupLoading || groupChildren.length === 0}
                          className="text-[10px] font-bold px-2 py-1 rounded-full bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          Chọn tất cả
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedChildIds([])}
                          disabled={isGroupLoading}
                          className="text-[10px] font-bold px-2 py-1 rounded-full bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Bỏ chọn
                        </button>
                      </div>
                    </div>

                    {isGroupLoading ? (
                      <div className="text-xs text-slate-500 py-4 flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Đang tải danh sách phòng...
                      </div>
                    ) : groupChildren.length === 0 ? (
                      <div className="text-xs text-slate-500">
                        Không có phòng con trong đoàn.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {groupChildren.map((member) => {
                          const isChecked = selectedChildIds.includes(member.booking_id);
                          return (
                            <button
                              key={member.booking_id}
                              type="button"
                              onClick={() => {
                                setSelectedChildIds(prev =>
                                  prev.includes(member.booking_id)
                                    ? prev.filter(id => id !== member.booking_id)
                                    : [...prev, member.booking_id]
                                );
                              }}
                              className={cn(
                                "w-full flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors",
                                isChecked
                                  ? "bg-white border-indigo-200"
                                  : "bg-white/60 border-slate-200 opacity-70 hover:opacity-100"
                              )}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={cn(
                                    "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-none",
                                    isChecked ? "bg-indigo-600 border-indigo-600" : "bg-white border-slate-300"
                                  )}
                                >
                                  {isChecked && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-bold text-slate-800 truncate">{member.room_name}</div>
                                </div>
                              </div>
                              <div className="text-sm font-black text-slate-800 flex-none">
                                {formatMoney(Number((member as any).payable_amount || 0))}
                              </div>
                            </button>
                          );
                        })}

                        <div className="border-t border-indigo-200 pt-2 flex items-center justify-between font-bold text-indigo-700">
                          <span className="text-xs uppercase tracking-wider">Tổng chọn</span>
                          <span>{formatMoney(selectedGroupPayableTotal || 0)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {/* Summary Breakdown (Visible) */}
              <div className="px-4 pb-2 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                      <span className="font-medium text-slate-600">Tiền phòng</span>
                      <span className="font-bold text-slate-800">{formatMoney(bill.total_amount || 0)}</span>
                  </div>
                  { (bill.group_total || 0) > 0 && (
                      <div className="flex justify-between items-center text-sm">
                          <span className="font-medium text-slate-600">Tổng gộp</span>
                          <span className="font-bold text-slate-800">{formatMoney(bill.group_total || 0)}</span>
                      </div>
                  )}
                  {surcharge > 0 && (
                      <div className="flex justify-between items-center text-sm">
                          <span className="font-medium text-slate-600">Phụ phí khác</span>
                          <span className="font-bold text-slate-800">{formatMoney(surcharge)}</span>
                      </div>
                  )}
                  {discount > 0 && (
                      <div className="flex justify-between items-center text-sm">
                          <span className="font-medium text-rose-600">Giảm giá</span>
                          <span className="font-bold text-rose-600">-{formatMoney(discount)}</span>
                      </div>
                  )}
                  {oldDebt > 0 && (
                      <div className="flex justify-between items-center text-sm">
                          <span className="font-medium text-rose-600">Nợ cũ</span>
                          <span className="font-bold text-rose-600">{formatMoney(oldDebt)}</span>
                      </div>
                  )}
                  <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                      <span className="text-base font-bold text-slate-800">Tổng cộng</span>
                      <span className="text-xl font-black text-blue-600">{formatMoney(finalTotalToPay)}</span>
                  </div>
              </div>
          </div>

          {/* 2. PAYMENT METHODS (Pill Style like CheckInModal) */}
          <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
              <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">Phương thức thanh toán</span>
              
              <div className="flex bg-slate-100/50 rounded-full p-1.5 shadow-sm relative z-10">
                  {[
                      { id: 'CASH', label: 'TIỀN MẶT', icon: Banknote },
                      { id: 'TRANSFER', label: 'CHUYỂN KHOẢN', icon: CreditCard },
                  ].map((m) => {
                      const isActive = paymentMethod === m.id;
                      const Icon = m.icon;
                      return (
                          <button
                              key={m.id}
                              onClick={() => setPaymentMethod(m.id as any)}
                              className={cn(
                                  "flex-1 flex flex-col items-center justify-center py-3.5 rounded-full transition-all duration-300 relative overflow-hidden",
                                  isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-slate-400 hover:bg-slate-50"
                              )}
                          >
                              <Icon className={cn("w-4 h-4 mb-1.5", isActive ? "text-white" : "text-slate-400")} />
                              <span className="text-[10px] font-bold tracking-widest uppercase">{m.label}</span>
                          </button>
                      );
                  })}
              </div>
          </div>

          {/* 3. AMOUNT PAID INPUT */}
          <div className="bg-white rounded-[40px] shadow-sm p-6 space-y-4">
               <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">Khách đưa</span>
               
               <div className="relative">
                  <MoneyInput
                      value={amountPaid}
                      onChange={setAmountPaid}
                      className="w-full py-4 px-4 bg-slate-50 rounded-xl text-3xl font-bold text-slate-800 focus:ring-2 focus:ring-slate-200 border-none outline-none transition-all text-center placeholder:text-slate-300"
                      inputClassName="text-3xl font-bold"
                      placeholder="0"
                      autoFocus
                      centered
                      align="center"
                  />
                  {amountPaid < finalTotalToPay && amountPaid > 0 && (
                      <div className="absolute top-1/2 -translate-y-1/2 right-4 text-xs font-bold text-rose-500 animate-in fade-in bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100 shadow-sm">
                          Thiếu {formatMoney(finalTotalToPay - amountPaid)}
                      </div>
                  )}
               </div>
               
               <div className="flex gap-2 mt-2 overflow-x-auto pb-1 no-scrollbar">
                   {[0, 100000, 200000, 500000].map(val => (
                       <button
                          key={val}
                          onClick={() => setAmountPaid(val)}
                          className="flex-1 py-3 rounded-xl bg-slate-50 text-slate-500 font-bold text-xs hover:bg-slate-100 transition-colors whitespace-nowrap px-2"
                       >
                          {val === 0 ? '0đ' : `${val/1000}k`}
                       </button>
                   ))}
                   <button
                      onClick={() => setAmountPaid(finalTotalToPay)}
                      className="flex-1 py-3 rounded-xl bg-blue-50 text-blue-600 font-bold text-xs hover:bg-blue-100 transition-colors whitespace-nowrap px-2"
                   >
                      Đủ
                   </button>
               </div>
          </div>

          {/* 4. BALANCE / DEBT STATUS */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             {balanceDiff < 0 ? (
                <div className="p-6 bg-rose-50 rounded-[32px] border border-rose-100 space-y-4">
                  <div className="flex items-center gap-4 text-rose-600">
                    <AlertCircle className="w-8 h-8" />
                    <div>
                      <h4 className="font-bold">Khách còn thiếu</h4>
                      <p className="text-xs opacity-80">Sẽ được ghi vào công nợ khách hàng</p>
                    </div>
                  </div>
                  <div className="text-3xl font-black text-rose-600 text-center">
                    {formatMoney(Math.abs(balanceDiff))}
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Nhập lý do nợ (Bắt buộc)..."
                    className="w-full bg-white border-2 border-rose-100 rounded-[24px] p-4 text-sm font-medium focus:border-rose-400 focus:ring-4 focus:ring-rose-100 outline-none transition-all"
                    rows={2}
                  />
                </div>
              ) : balanceDiff > 0 ? (
                 <div className="p-6 bg-emerald-50 rounded-[32px] border border-emerald-100 space-y-4">
                  <div className="flex items-center gap-4 text-emerald-600">
                    <Wallet className="w-8 h-8" />
                    <div>
                      <h4 className="font-bold">Tiền thừa trả khách</h4>
                      <p className="text-xs opacity-80">Vui lòng trả lại tiền thừa cho khách</p>
                    </div>
                  </div>
                  <div className="text-3xl font-black text-emerald-600 text-center">
                    {formatMoney(balanceDiff)}
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-white rounded-[32px] border border-slate-100 text-center shadow-sm">
                    <span className="font-bold text-slate-400">Đã thanh toán đủ</span>
                </div>
              )}
          </div>
          
           {/* Notes if not debt */}
           {!isDebt && (
             <div className="space-y-3">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-4">Ghi chú thêm</span>
                <div className="bg-white rounded-[24px] p-2 shadow-sm border border-slate-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                        <MessageSquare className="w-5 h-5" />
                    </div>
                    <input 
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ghi chú hóa đơn (tùy chọn)..."
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 placeholder:text-slate-300"
                    />
                </div>
             </div>
           )}

        </div>

        {/* --- FOOTER --- */}
        <div className="p-4 sm:p-6 bg-white border-t border-slate-100 shrink-0 z-50">
          {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold flex items-center gap-3 animate-in slide-in-from-bottom-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
            </div>
          )}
          
          <div className="flex items-center gap-4">
            <button 
                onClick={onClose}
                className="flex-1 py-4 rounded-[24px] font-bold text-slate-500 hover:bg-slate-50 transition-colors uppercase tracking-wider"
            >
                Hủy bỏ
            </button>
            <button
                onClick={handleCheckout}
                disabled={isProcessing}
                className={cn(
                    "flex-[2] py-4 rounded-[24px] font-bold text-white uppercase tracking-wider shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-3",
                    isProcessing ? "bg-slate-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 active:scale-95"
                )}
            >
                {isProcessing ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Đang xử lý...</span>
                    </>
                ) : (
                    <span>Thanh toán ngay</span>
                )}
            </button>
          </div>
        </div>

      </div>
      
      <CustomerSelectionModal 
        isOpen={showCustomerModal} 
        onClose={() => setShowCustomerModal(false)}
        onSelect={handleCustomerSelect}
      />
    </div>,
    document.body
  );
}
