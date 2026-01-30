import React, { useState, useCallback } from 'react';
import { securityService, SecurityAction, PolicyType } from '@/services/securityService';
import { telegramService } from '@/services/telegramService';
import PinValidationModal from '@/components/shared/PinValidationModal';
import SecurityApprovalModal from '@/components/shared/SecurityApprovalModal';
import { toast } from 'sonner';

interface UseSecurityReturn {
  /**
   * Check policy and execute action if allowed, or trigger appropriate security flow.
   * @param action The security action key (e.g., 'checkout_discount')
   * @param onSuccess Callback function to execute when verified/approved. Passes staffId and staffName if available.
   * @param requestData Optional data to attach to approval request (e.g., { amount: 50000 })
   * @param options Additional options
   */
  verify: (
    action: SecurityAction, 
    onSuccess: (staffId?: string, staffName?: string) => void, 
    requestData?: any,
    options?: { skipWaitingModal?: boolean }
  ) => Promise<void>;
  
  /**
   * Component containing the necessary modals. 
   * Must be rendered in the component tree.
   */
  SecurityModals: React.ReactNode;
}

export function useSecurity(hookOptions?: { onMinimize?: () => void }): UseSecurityReturn {
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  
  const [currentAction, setCurrentAction] = useState<SecurityAction | null>(null);
  const [pendingCallback, setPendingCallback] = useState<((staffId?: string, staffName?: string) => void) | null>(null);
  const [approvalRequestId, setApprovalRequestId] = useState<string | null>(null);

  const verify = useCallback(async (
    action: SecurityAction, 
    onSuccess: (staffId?: string, staffName?: string) => void, 
    requestData?: any,
    options?: { skipWaitingModal?: boolean }
  ) => {
    try {
      const policy = await securityService.getPolicy(action);
      
      console.log(`Security Check: ${action} -> ${policy}`);

      if (policy === 'ALLOW') {
        onSuccess();
        return;
      }

      if (policy === 'DENY') {
        toast.error('Bạn không có quyền thực hiện hành động này.');
        return;
      }

      // Store context for later execution
      setCurrentAction(action);
      setPendingCallback(() => onSuccess);

      if (policy === 'PIN') {
        setPinModalOpen(true);
      } 
      else if (policy === 'APPROVAL') {
        // Create request immediately
        const toastId = toast.loading('Đang tạo yêu cầu phê duyệt...');
        try {
          const result = await securityService.createApprovalRequest(action, requestData);
          toast.dismiss(toastId);
          
          if (result && result.request_id) {
            setApprovalRequestId(result.request_id);

            // Send Telegram Notification
            let staffName = 'Nhân viên';
            try {
              const storedUser = localStorage.getItem('1hotel_user');
              if (storedUser) {
                const user = JSON.parse(storedUser);
                staffName = user.full_name || user.username || 'Nhân viên';
              }
            } catch (e) {}
            
            telegramService.sendApprovalRequest(result.request_id, action, staffName, requestData);
            
            if (options?.skipWaitingModal) {
                toast.success("Đã gửi yêu cầu phê duyệt. Hệ thống sẽ tự động xử lý khi được duyệt.");
                // Execute onMinimize callback if exists to close parent modals
                if (hookOptions?.onMinimize) {
                    hookOptions.onMinimize();
                }
            } else {
                setApprovalModalOpen(true);
            }
            
          } else {
            toast.error(result?.message || 'Không thể tạo yêu cầu phê duyệt.');
          }
        } catch (error: any) {
          toast.dismiss(toastId);
          toast.error('Lỗi: ' + error.message);
        }
      }

    } catch (error) {
      console.error('Security verify error:', error);
      toast.error('Có lỗi xảy ra khi kiểm tra bảo mật.');
    }
  }, [hookOptions]);

  const handlePinSuccess = (staffId?: string, staffName?: string) => {
    setPinModalOpen(false);
    if (pendingCallback) {
      pendingCallback(staffId, staffName);
      setPendingCallback(null);
    }
    setCurrentAction(null);
  };

  const handleApprovalSuccess = (staffId?: string, staffName?: string) => {
    // Modal will close itself or we close it here
    setApprovalModalOpen(false);
    if (pendingCallback) {
      pendingCallback(staffId, staffName);
      setPendingCallback(null);
    }
    setCurrentAction(null);
    setApprovalRequestId(null);
  };

  const handleClose = () => {
    setPinModalOpen(false);
    setApprovalModalOpen(false);
    setPendingCallback(null);
    setCurrentAction(null);
    setApprovalRequestId(null);
  };

  const handleMinimize = () => {
    setApprovalModalOpen(false);
    if (hookOptions?.onMinimize) {
      hookOptions.onMinimize();
    }
  };

  const SecurityModals = (
    <>
      <PinValidationModal
        isOpen={pinModalOpen}
        onClose={handleClose}
        onSuccess={(id, name) => handlePinSuccess(id, name)}
        actionName={currentAction || 'Xác thực bảo mật'}
      />
      <SecurityApprovalModal
        isOpen={approvalModalOpen}
        onClose={handleClose}
        requestId={approvalRequestId}
        onApproved={handleApprovalSuccess}
        actionName={currentAction || undefined}
        onMinimize={handleMinimize}
      />
    </>
  );

  return { verify, SecurityModals };
}
