'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Wallet, ArrowUpRight, CheckCircle, AlertCircle, Building, User, FileText, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cashFlowService } from '@/services/cashFlowService';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { useAuth } from '@/providers/AuthProvider';
import PinValidationModal from '@/components/shared/PinValidationModal';

interface OwnerDebtSectionProps {
  onUpdate: () => void;
}

export default function OwnerDebtSection({ onUpdate }: OwnerDebtSectionProps) {
  const { user } = useAuth();
  const [debts, setDebts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<any>(null);
  
  // PIN Verification State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  // Create Form State
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const [creditorName, setCreditorName] = useState('Chủ đầu tư');
  const [evidenceUrl, setEvidenceUrl] = useState('');

  // Repay Form State
  const [repayMethod, setRepayMethod] = useState<'cash' | 'transfer'>('cash');

  const fetchDebts = async () => {
    try {
      setLoading(true);
      const data = await cashFlowService.getExternalPayables();
      setDebts(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDebts();
  }, []);

  const handleCreateExpense = async () => {
    if (amount <= 0) {
      toast.error('Vui lòng nhập số tiền hợp lệ');
      return;
    }
    if (!description) {
      toast.error('Vui lòng nhập nội dung chi');
      return;
    }
    if (!evidenceUrl) {
      toast.error('Bắt buộc phải có bằng chứng (Link ảnh/hóa đơn)');
      return;
    }

    try {
      await cashFlowService.createOwnerExpense({
        amount,
        description,
        creditorName,
        evidenceUrl
      });
      toast.success('Đã ghi nhận Chủ Chi thành công');
      setIsCreateModalOpen(false);
      setAmount(0);
      setDescription('');
      setEvidenceUrl('');
      fetchDebts();
      onUpdate(); // Refresh parent stats
    } catch (error) {
      toast.error('Có lỗi xảy ra');
      console.error(error);
    }
  };

  // Triggered after selecting debt and clicking Repay
  const initiateRepay = (debt: any) => {
    if (user?.role !== 'OWNER') {
      toast.error('Chỉ Owner mới được thực hiện chức năng này');
      return;
    }
    setSelectedDebt(debt);
    setIsRepayModalOpen(true);
  };

  // Called when user confirms payment method in Repay Modal -> Opens PIN Modal
  const requestPinVerification = () => {
    setIsRepayModalOpen(false);
    setIsPinModalOpen(true);
  };

  // Called after PIN is verified successfully
  const handleRepayConfirmed = async (staffId: string) => {
    if (!selectedDebt) return;

    try {
      // Note: We need the PIN to send to backend, but PinValidationModal handles verification internally
      // and returns success. However, our new RPC requires the PIN to be sent for double verification 
      // OR we trust the client side verification (which is insecure).
      // The RPC `repay_owner_debt` takes `p_pin`. 
      // Issue: `PinValidationModal` verifies but doesn't return the PIN to the parent callback usually?
      // Let's check PinValidationModal. It calls onSuccess(staffId, staffName). It does NOT return the PIN.
      // 
      // CRITICAL FIX: The RPC requires the PIN. I cannot get the PIN from PinValidationModal's onSuccess.
      // Option A: Modify PinValidationModal to return PIN.
      // Option B: Trust the FE verification and remove PIN check from RPC (Violates "Cưỡng chế quyền chủ").
      // Option C: Re-ask for PIN or Modify PinValidationModal.
      //
      // I will Modify PinValidationModal to return the PIN in onSuccess, OR simply capture it here if I could.
      // But I can't modify PinValidationModal easily without breaking other usages?
      // Let's check usages. It's used in `TransactionModal` and `BookingHistoryModal` maybe?
      // I'll modify `PinValidationModal` to pass `pin` as 3rd arg.
      // For now, I'll assume I can modify it.
      
      // WAIT: If I modify PinValidationModal, I need to update it.
      // Let's modify PinValidationModal first? No, I'll modify it in this same turn.
      
      // Actually, for now, since I can't easily change the modal signature without checking all usages,
      // I will implement a local PIN input inside the Repay Modal or just use the PinModal but I need the PIN value.
      // 
      // Alternative: The RPC checks `auth.uid()`. `PinValidationModal` verifies `auth.uid()`.
      // If `PinValidationModal` succeeds, it means the user knows the PIN.
      // BUT the RPC `repay_owner_debt` *requires* `p_pin` as a parameter to do the check INSIDE the DB transaction.
      // This is the "Iron Rule".
      // So I MUST send the PIN.
      //
      // Plan: I will clone logic of PinValidationModal into this file temporarily OR modify PinValidationModal.
      // Modifying PinValidationModal is cleaner.
      // `onSuccess: (staffId: string, staffName: string) => void;` -> `(staffId: string, staffName: string, pin?: string) => void;`
      // This is backward compatible.
    } catch (error) {
       // ...
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const totalDebt = debts.reduce((sum, d) => sum + parseFloat(d.amount), 0);

  return (
    <div className="bg-white p-6 rounded-xl border border-rose-100 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-bold text-rose-700 flex items-center gap-2">
            <Building className="w-5 h-5" />
            Sổ Nợ Ngoài (External Payables)
          </h3>
          <p className="text-sm text-rose-500">
            Các khoản khách sạn đang nợ Chủ đầu tư & NCC
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Tổng nợ phải trả</div>
          <div className="text-2xl font-bold text-rose-600">{formatMoney(totalDebt)}</div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 py-3 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors border border-rose-200"
        >
          <Plus size={18} />
          Ghi nhận Chủ chi
        </button>
      </div>

      {/* Debt List */}
      <div className="space-y-3">
        {debts.length === 0 ? (
          <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
            Không có khoản nợ nào cần thanh toán
          </div>
        ) : (
          debts.map((debt) => (
            <div key={debt.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-rose-200 transition-colors group">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-rose-100 rounded-full text-rose-600">
                  <User size={20} />
                </div>
                <div>
                  <div className="font-medium text-gray-900">{debt.creditor_name}</div>
                  <div className="text-sm text-gray-500">{debt.description}</div>
                  <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    {new Date(debt.created_at).toLocaleDateString('vi-VN')}
                    {debt.evidence_url && (
                        <a href={debt.evidence_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-0.5 ml-2">
                            <FileText size={10} /> Bằng chứng
                        </a>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-bold text-gray-900">{formatMoney(debt.amount)}</div>
                  <div className="text-xs text-rose-500 font-medium bg-rose-50 px-2 py-0.5 rounded-full inline-block">
                    Chưa thanh toán
                  </div>
                </div>
                
                {/* Secure Action: Repay (Owner Only) */}
                {user?.role === 'OWNER' && (
                  <button
                    onClick={() => initiateRepay(debt)}
                    className="p-2 bg-white border border-gray-200 text-gray-400 hover:text-rose-600 hover:border-rose-200 rounded-lg transition-all shadow-sm opacity-0 group-hover:opacity-100"
                    title="Trả nợ"
                  >
                    <ArrowUpRight size={18} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Ghi nhận Chủ chi (Nợ mới)</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <Plus className="rotate-45" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Người chi (Chủ nợ)</label>
                <input
                  type="text"
                  value={creditorName}
                  onChange={(e) => setCreditorName(e.target.value)}
                  className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền chi hộ</label>
                <MoneyInput
                  value={amount}
                  onChange={setAmount}
                  className="text-lg font-bold text-rose-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung chi</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="VD: Mua tivi mới, Trả tiền điện..."
                  className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bằng chứng thép (Link ảnh/Drive)</label>
                <input
                  type="text"
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full p-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <p className="text-xs text-gray-400 mt-1">Bắt buộc phải có ảnh hóa đơn để đối soát.</p>
              </div>
              <button
                onClick={handleCreateExpense}
                className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-lg shadow-rose-200 transition-all mt-4"
              >
                Xác nhận Ghi Nợ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Repay Modal Step 1: Method Selection */}
      {isRepayModalOpen && selectedDebt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Thanh toán khoản nợ</h3>
              <p className="text-sm text-gray-500">Trả cho: {selectedDebt.creditor_name}</p>
            </div>
            <div className="p-6 space-y-6">
              <div className="bg-gray-50 p-4 rounded-xl text-center">
                <div className="text-sm text-gray-500 mb-1">Số tiền thanh toán</div>
                <div className="text-3xl font-black text-rose-600">{formatMoney(selectedDebt.amount)}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Nguồn tiền chi trả</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setRepayMethod('cash')}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                      repayMethod === 'cash'
                        ? 'border-rose-600 bg-rose-50 text-rose-700'
                        : 'border-gray-100 hover:border-rose-200 text-gray-600'
                    }`}
                  >
                    <Wallet size={24} />
                    <span className="font-bold">Tiền mặt</span>
                  </button>
                  <button
                    onClick={() => setRepayMethod('transfer')}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                      repayMethod === 'transfer'
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-100 hover:border-blue-200 text-gray-600'
                    }`}
                  >
                    <Building size={24} />
                    <span className="font-bold">Chuyển khoản</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsRepayModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={requestPinVerification}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2"
                >
                  <Lock size={18} />
                  Xác thực & Trả nợ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Repay Modal Step 2: PIN Verification */}
      <PinValidationModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={async (staffId, staffName, pin) => {
          // IMPORTANT: Need to update PinValidationModal to pass pin back
          // Assuming we updated it or use a workaround.
          // Since I can't guarantee PinValidationModal update in this single file write,
          // I will fetch the PIN from the modal if possible, but I can't.
          // 
          // WORKAROUND: For this specific file, I'll trust the validation for now 
          // BUT this breaks the RPC contract requiring `p_pin`.
          // 
          // So I MUST update PinValidationModal. I'll do that in the next tool call.
          // Here I assume `pin` is passed.
          
          if (!pin) {
             // Fallback if modal not updated yet (should not happen if I update both)
             toast.error('Lỗi hệ thống: Không lấy được mã PIN');
             return;
          }

          try {
            await cashFlowService.repayOwnerDebt({
              payableId: selectedDebt.id,
              paymentMethod: repayMethod,
              pin: pin
            });
            toast.success('Đã trả nợ thành công');
            setIsPinModalOpen(false);
            setSelectedDebt(null);
            fetchDebts();
            onUpdate();
          } catch (error: any) {
            toast.error(error.message || 'Có lỗi xảy ra');
          }
        }}
        actionName="Xác nhận Trả Nợ"
        description={`Xác nhận chi ${formatMoney(selectedDebt?.amount || 0)} từ quỹ ${repayMethod === 'cash' ? 'Tiền mặt' : 'Ngân hàng'}`}
      />
    </div>
  );
}
