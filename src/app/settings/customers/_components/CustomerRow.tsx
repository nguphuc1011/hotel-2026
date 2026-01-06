
import { motion } from 'framer-motion';
import { 
  User, 
  Phone, 
  CreditCard, 
  Edit2, 
  Trash2, 
  History, 
  DollarSign, 
  FileText 
} from 'lucide-react';
import { Customer } from '@/types';
import { formatCurrency, cn } from '@/lib/utils';
import { useCustomerBalance } from '@/hooks/useCustomerBalance';

export function CustomerRow({ 
  customer, 
  onEdit, 
  onDelete, 
  onSelect 
}: { 
  customer: Customer; 
  onEdit: (c: Customer) => void; 
  onDelete: (c: Customer) => void; 
  onSelect: (id: string) => void; 
}) {
  const { isDebt, isCredit, absFormattedBalance } = useCustomerBalance(customer.balance || 0);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onSelect(customer.id)}
      className="group bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 hover:shadow-md transition-all active:scale-[0.99] cursor-pointer"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
            <User size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800">{customer.full_name}</h3>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
                <Phone size={12} />
                {customer.phone || '---'}
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
                <CreditCard size={12} />
                {customer.id_card || '---'}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onEdit(customer);
            }}
            className="p-2 rounded-full hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-all"
            title="Sửa"
          >
            <Edit2 size={18} />
          </button>
          {customer.full_name !== 'Khách mới' && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onDelete(customer);
              }}
              className="p-2 rounded-full hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all"
              title="Xóa"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-50">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1">
            <History size={10} /> Lượt đến
          </span>
          <span className="text-sm font-black text-slate-700">{customer.visit_count || 0} lần</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1">
            <DollarSign size={10} /> Tổng chi tiêu
          </span>
          <span className="text-sm font-black text-emerald-600">{formatCurrency(customer.total_spent || 0)}</span>
        </div>
      </div>

      {/* Phần hiển thị số dư/nợ dùng Hook */}
      {(isDebt || isCredit) && (
        <div className={cn(
          "mt-3 p-3 rounded-2xl border flex items-center justify-between",
          isDebt 
            ? "bg-rose-50 border-rose-100 text-rose-700" 
            : "bg-emerald-50 border-emerald-100 text-emerald-700"
        )}>
          <span className="text-xs font-black uppercase tracking-wider">
            {isDebt ? 'Khách đang nợ' : 'Tiền dư của khách'}
          </span>
          <span className="text-sm font-black">
            {absFormattedBalance}
          </span>
        </div>
      )}

      {customer.notes && (
        <div className="mt-4 p-3 bg-yellow-50/50 rounded-2xl border border-yellow-100/50">
          <div className="flex items-center gap-2 text-yellow-700 mb-1">
            <FileText size={12} />
            <span className="text-[10px] font-black uppercase tracking-wider">Ghi chú</span>
          </div>
          <p className="text-xs font-bold text-yellow-800 leading-relaxed">{customer.notes}</p>
        </div>
      )}
    </motion.div>
  );
}
