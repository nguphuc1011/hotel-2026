'use client';

import React, { useEffect, useState } from 'react';
import { 
  X, 
  FileWarning,
  Search,
  Calendar,
  CreditCard
} from 'lucide-react';
import { cashFlowService } from '@/services/cashFlowService';
import { formatMoney } from '@/utils/format';

interface ExternalPayable {
  id: string;
  creditor_name: string;
  amount: number;
  description: string | null;
  created_at: string;
  status: string;
}

interface ExternalDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExternalDebtModal({ isOpen, onClose }: ExternalDebtModalProps) {
  const [payables, setPayables] = useState<ExternalPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchPayables();
    }
  }, [isOpen]);

  const fetchPayables = async () => {
    setLoading(true);
    try {
      const data = await cashFlowService.getExternalPayables();
      setPayables(data as ExternalPayable[]);
    } catch (error) {
      console.error('Error fetching external payables:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPayables = payables.filter(p => 
    p.creditor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalDebt = payables.reduce((sum, p) => sum + p.amount, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-amber-100 flex justify-between items-center bg-amber-50/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-200">
              <FileWarning size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tight">Danh sách Nợ ngoài</h3>
              <p className="text-xs font-bold text-amber-600 uppercase tracking-widest">Tổng nợ: {formatMoney(totalDebt)}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-amber-100 text-amber-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Tìm theo tên chủ nợ hoặc nội dung..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Đang tải dữ liệu...</p>
            </div>
          ) : filteredPayables.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
              <FileWarning size={48} strokeWidth={1} />
              <p>Không có khoản nợ nào</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredPayables.map((payable) => (
                <div key={payable.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-sm">
                      {payable.creditor_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">{payable.creditor_name}</h4>
                      <p className="text-xs text-slate-500 line-clamp-1">{payable.description || 'Không có mô tả'}</p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium mt-1">
                        <Calendar size={10} />
                        {new Date(payable.created_at).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <span className="block text-amber-600 font-black text-lg">
                      {formatMoney(payable.amount)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Phải trả
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-400 font-medium">
          Hiển thị {filteredPayables.length} khoản nợ
        </div>
      </div>
    </div>
  );
}
