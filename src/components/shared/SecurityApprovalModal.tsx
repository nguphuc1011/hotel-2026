'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ShieldCheck, KeyRound } from 'lucide-react';
import { securityService } from '@/services/securityService';
import { toast } from 'sonner';

interface SecurityApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string | null;
  onApproved: (staffId?: string, staffName?: string) => void;
  actionName?: string;
  onMinimize?: () => void;
}

const PIN_INPUT_LENGTH = 6;

export default function SecurityApprovalModal({
  isOpen,
  onClose,
  requestId,
  onApproved,
  actionName,
  onMinimize
}: SecurityApprovalModalProps) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [isOverrideMode, setIsOverrideMode] = useState(false);
  const [managerPin, setManagerPin] = useState('');

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setStatus('PENDING');
      setIsVerifying(false);
      setIsOverrideMode(false);
      setManagerPin('');
    }
  }, [isOpen]);

  // Polling for status changes
  useEffect(() => {
    if (!isOpen || !requestId || status !== 'PENDING' || isOverrideMode) return;

    const interval = setInterval(async () => {
      try {
        const data = await securityService.checkApprovalStatus(requestId);
        if (data?.status === 'APPROVED') {
          setStatus('APPROVED');
          toast.success('Yêu cầu đã được phê duyệt!');
          setTimeout(() => {
            onApproved(data.approved_by_id, data.approved_by_name);
            onClose();
          }, 1000);
        } else if (data?.status === 'REJECTED') {
          setStatus('REJECTED');
          toast.error('Yêu cầu đã bị từ chối.');
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isOpen, requestId, status, onApproved, onClose, isOverrideMode]);

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestId || managerPin.length < PIN_INPUT_LENGTH || isVerifying) return;

    setIsVerifying(true);
    try {
      const result = await securityService.approveRequest(requestId, managerPin);
      if (result.success) {
        setStatus('APPROVED');
        toast.success('Đã duyệt bằng mã PIN quản lý!');
        setTimeout(() => {
          onApproved(result.approved_by_id, result.approved_by_name);
          onClose();
        }, 1000);
      } else {
        toast.error(result.message || 'Mã PIN không đúng hoặc không đủ quyền');
        setManagerPin('');
      }
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleMinimize = () => {
    // Just close the modal, do not reset the request
    // The parent component needs to handle the "minimization" logic if it wants to keep tracking
    // But for now, we just close the UI.
    if (onMinimize) {
      onMinimize();
    } else {
      onClose();
    }
    toast.info('Yêu cầu đã được ẩn xuống nền. Bạn có thể tiếp tục công việc khác.');
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70000] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      {/* Click outside to minimize */}
      <div className="absolute inset-0" onClick={handleMinimize} />
      
      <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 relative z-10">
        
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Yêu cầu phê duyệt</h3>
              <p className="text-xs text-slate-500 font-medium">
                {actionName || 'Hành động nhạy cảm'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 flex flex-col items-center text-center space-y-6">
          
          {status === 'PENDING' && !isOverrideMode && (
            <>
              <div className="relative">
                <div className="w-20 h-20 border-4 border-slate-100 border-t-blue-500 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-pulse" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-xl font-bold text-slate-800">Đang chờ duyệt...</h4>
                <p className="text-sm text-slate-500">
                  Vui lòng chờ quản lý xác nhận qua Telegram
                </p>
                <div className="pt-2">
                  <span className="inline-block px-3 py-1 bg-slate-100 text-slate-500 text-xs font-mono rounded-lg">
                    ID: {requestId?.slice(0, 8)}...
                  </span>
                </div>
              </div>

              <div className="w-full pt-4 border-t border-slate-100">
                <button
                  onClick={() => setIsOverrideMode(true)}
                  className="flex items-center justify-center gap-2 mx-auto text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                  Duyệt nóng bằng PIN
                </button>
              </div>

              {/* Nút ẩn modal */}
              <button
                onClick={handleMinimize}
                className="w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all active:scale-[0.98]"
              >
                Ẩn xuống & Quay lại sơ đồ
              </button>
            </>
          )}

          {status === 'PENDING' && isOverrideMode && (
            <form onSubmit={handleOverrideSubmit} className="w-full space-y-6">
              <div className="space-y-2 text-center">
                <h4 className="text-xl font-bold text-slate-800">Duyệt bằng mã PIN</h4>
                <p className="text-sm text-slate-500">Nhập mã PIN của Quản lý / Admin</p>
              </div>

              <div className="flex justify-center">
                <input
                  type="password"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, '').slice(0, PIN_INPUT_LENGTH))}
                  placeholder="••••••"
                  autoFocus
                  className="w-48 text-center text-3xl tracking-[1em] font-bold py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-blue-500 focus:outline-none transition-all"
                />
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="submit"
                  disabled={managerPin.length < PIN_INPUT_LENGTH || isVerifying}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                >
                  {isVerifying ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>Xác nhận</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOverrideMode(false)}
                  className="w-full py-3 text-slate-500 font-bold hover:text-slate-700 transition-colors"
                >
                  Quay lại chờ Telegram
                </button>
              </div>
            </form>
          )}

          {status === 'REJECTED' && (
            <div className="space-y-4">
              <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto">
                <X className="w-10 h-10" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-slate-800">Đã từ chối</h4>
                <p className="text-sm text-slate-500">Yêu cầu này đã bị từ chối.</p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 bg-slate-100 text-slate-800 rounded-xl font-bold hover:bg-slate-200"
              >
                Đóng
              </button>
            </div>
          )}

          {status === 'APPROVED' && (
            <div className="space-y-4">
               <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck className="w-10 h-10" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-slate-800">Đã phê duyệt</h4>
                <p className="text-sm text-slate-500">Thao tác đang được thực hiện...</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
}
