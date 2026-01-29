'use client';

import React, { useEffect, useState } from 'react';
import { 
  X, 
  Users,
  Search,
  Phone,
  AlertCircle
} from 'lucide-react';
import { customerService, Customer } from '@/services/customerService';
import { formatMoney } from '@/utils/format';

interface CustomerDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CustomerDebtModal({ isOpen, onClose }: CustomerDebtModalProps) {
  const [debtors, setDebtors] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchDebtors();
    }
  }, [isOpen]);

  const fetchDebtors = async () => {
    setLoading(true);
    try {
      const data = await customerService.getDebtors();
      setDebtors(data);
    } catch (error) {
      console.error('Error fetching debtors:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDebtors = debtors.filter(d => 
    d.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.phone && d.phone.includes(searchTerm))
  );

  const totalDebt = debtors.reduce((sum, d) => sum + Math.abs(d.balance), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-rose-100 flex justify-between items-center bg-rose-50/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-rose-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-200">
              <Users size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 uppercase italic tracking-tight">Danh sách Khách nợ</h3>
              <p className="text-xs font-bold text-rose-500 uppercase tracking-widest">Tổng nợ: {formatMoney(totalDebt)}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-rose-100 text-rose-400 transition-colors"
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
              placeholder="Tìm theo tên hoặc số điện thoại..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Đang tải dữ liệu...</p>
            </div>
          ) : filteredDebtors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
              <Users size={48} strokeWidth={1} />
              <p>Không tìm thấy khách hàng nào</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredDebtors.map((customer) => (
                <div key={customer.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-sm">
                      {customer.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800">{customer.full_name}</h4>
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                        {customer.phone && (
                          <span className="flex items-center gap-1">
                            <Phone size={12} />
                            {customer.phone}
                          </span>
                        )}
                        {customer.notes && (
                          <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] uppercase">
                            Note
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <span className="block text-rose-600 font-black text-lg">
                      {formatMoney(customer.balance)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Dư nợ hiện tại
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-400 font-medium">
          Hiển thị {filteredDebtors.length} khách hàng
        </div>
      </div>
    </div>
  );
}
