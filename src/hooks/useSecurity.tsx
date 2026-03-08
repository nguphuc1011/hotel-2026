import React, { useState, useCallback } from 'react';
import { securityService } from '@/services/securityService';
import type { SecurityAction } from '@/services/securityService';
import PinValidationModal from '@/components/shared/PinValidationModal';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';

interface UseSecurityReturn {
  verify: (
    action: SecurityAction, 
    onSuccess: (staffId?: string, staffName?: string) => void, 
    requestData?: any,
    options?: { skipWaitingModal?: boolean }
  ) => Promise<void>;
  
  SecurityModals: React.ReactNode;
}

export function useSecurity(hookOptions?: { onMinimize?: () => void }): UseSecurityReturn {
  const user = useAuthStore(state => state.user);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [currentAction, setCurrentAction] = useState<SecurityAction | null>(null);
  const [pendingCallback, setPendingCallback] = useState<((staffId?: string, staffName?: string) => void) | null>(null);

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
        onSuccess(user?.id || 'system_allow', user?.full_name || 'System Allow');
        return;
      }

      if (policy === 'DENY') {
        toast.error('Bạn không có quyền thực hiện hành động này.');
        return;
      }

      setCurrentAction(action);
      setPendingCallback(() => onSuccess);
      setPinModalOpen(true);

    } catch (error) {
      console.error('Security verify error:', error);
      toast.error('Có lỗi xảy ra khi kiểm tra bảo mật.');
    }
  }, [user]);

  const handlePinSuccess = (staffId?: string, staffName?: string) => {
    setPinModalOpen(false);
    if (pendingCallback) {
      pendingCallback(staffId, staffName);
      setPendingCallback(null);
    }
    setCurrentAction(null);
  };

  const handleClose = () => {
    setPinModalOpen(false);
    setPendingCallback(null);
    setCurrentAction(null);
  };

  const SecurityModals = (
    <>
      <PinValidationModal
        isOpen={pinModalOpen}
        onClose={handleClose}
        onSuccess={(id, name) => handlePinSuccess(id, name)}
        actionName={currentAction || 'Xác thực bảo mật'}
      />
    </>
  );

  return { verify, SecurityModals };
}
