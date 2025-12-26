'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Search, 
  History, 
  AlertCircle,
  Filter,
  Calendar,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ShoppingCart
} from 'lucide-react';
import { useNotification } from '@/context/NotificationContext';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

type StockLog = {
  id: string;
  service_id: string;
  action_type: 'IMPORT' | 'EXPORT' | 'SALE';
  quantity: number;
  created_at: string;
  details: {
    reason: string;
    stock_before: number;
    stock_after: number;
    service_name: string;
  };
};

const filterTabs = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'IMPORT', label: 'Nhập kho', icon: ArrowUpCircle, color: 'text-emerald-600' },
  { id: 'EXPORT', label: 'Xuất kho', icon: ArrowDownCircle, color: 'text-rose-600' },
  { id: 'SALE', label: 'Bán hàng', icon: ShoppingCart, color: 'text-blue-600' },
];

export default function StockHistory() {
  const { showNotification } = useNotification();
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('stock_history')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLogs(data as StockLog[] || []);
    } catch (err: any) {
      console.error('Lỗi tải lịch sử kho:', err);
      setError(err.message);
      showNotification('Lỗi khi tải lịch sử kho', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = (log.details?.service_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (log.details?.reason?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesFilter = activeFilter === 'ALL' || log.action_type === activeFilter;
    return matchesSearch && matchesFilter;
  });

  // Calculate stats for the last 30 days
  const stats = {
    import: logs.filter(l => l.action_type === 'IMPORT').reduce((sum, l) => sum + l.quantity, 0),
    export: logs.filter(l => l.action_type === 'EXPORT' || l.action_type === 'SALE').reduce((sum, l) => sum + l.quantity, 0),
  };

  if (error) {
    return (
      <div className="text-center py-20 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div className="bg-rose-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="h-8 w-8 text-rose-500" />
        </div>
        <p className="text-slate-800 font-bold mb-4">Lỗi: {error}</p>
        <button 
          onClick={() => fetchLogs()} 
          className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-blue-100 active:scale-95 transition-all"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-emerald-50 p-5 rounded-[2rem] border border-emerald-100 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <TrendingUp size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Tổng nhập</span>
          </div>
          <div className="text-2xl font-black text-emerald-900">{stats.import} <span className="text-sm font-bold text-emerald-600/50">sp</span></div>
        </div>
        <div className="bg-rose-50 p-5 rounded-[2rem] border border-rose-100 shadow-sm">
          <div className="flex items-center gap-2 text-rose-600 mb-1">
            <TrendingDown size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Tổng xuất/bán</span>
          </div>
          <div className="text-2xl font-black text-rose-900">{stats.export} <span className="text-sm font-bold text-rose-600/50">sp</span></div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="space-y-4">
        <div className="relative group">
          <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Tìm theo tên dịch vụ hoặc lý do..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-14 w-full rounded-[1.5rem] bg-slate-100/50 border-transparent pl-14 pr-6 text-sm font-bold text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-inner"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
          {filterTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap border-2",
                activeFilter === tab.id 
                  ? "bg-slate-800 border-slate-800 text-white shadow-lg" 
                  : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
              )}
            >
              {tab.icon && <tab.icon size={14} className={activeFilter === tab.id ? "text-white" : tab.color} />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Logs List */}
      <div className="space-y-4 relative">
        <AnimatePresence mode="popLayout">
          {loading ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-28 bg-slate-50 animate-pulse rounded-[2rem] border border-slate-100" />
              ))}
            </motion.div>
          ) : filteredLogs.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-24 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100 text-slate-400"
            >
              <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <History size={40} className="opacity-20" />
              </div>
              <h3 className="text-lg font-bold text-slate-600 mb-1">Không có dữ liệu</h3>
              <p className="text-sm font-medium">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
            </motion.div>
          ) : (
            filteredLogs.map((log) => (
              <motion.div
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={log.id}
                className="group bg-white p-6 rounded-[2.5rem] border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-5">
                  <div className={cn(
                    "h-14 w-14 flex items-center justify-center rounded-2xl shadow-inner transition-colors",
                    log.action_type === 'IMPORT' ? "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100" : 
                    log.action_type === 'SALE' ? "bg-blue-50 text-blue-600 group-hover:bg-blue-100" :
                    "bg-rose-50 text-rose-600 group-hover:bg-rose-100"
                  )}>
                    {log.action_type === 'IMPORT' ? <ArrowUpCircle size={28} /> : 
                     log.action_type === 'SALE' ? <ShoppingCart size={28} /> :
                     <ArrowDownCircle size={28} />}
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 text-lg mb-1 leading-tight">{log.details?.service_name || 'Dịch vụ'}</h4>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">
                        <Calendar size={12} />
                        {new Date(log.created_at).toLocaleString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                        {log.details?.reason || 'Cập nhật kho'}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={cn(
                    "font-black text-2xl flex items-center justify-end gap-1 mb-1",
                    log.action_type === 'IMPORT' ? "text-emerald-600" : "text-rose-600"
                  )}>
                    <span className="text-sm opacity-50">{log.action_type === 'IMPORT' ? '+' : '-'}</span>
                    {log.quantity}
                  </div>
                  
                  {log.details?.stock_before !== undefined && (
                    <div className="flex items-center justify-end gap-1.5 text-[10px] font-black text-slate-400">
                      <span>{log.details.stock_before}</span>
                      <ArrowRight size={10} className="text-slate-300" />
                      <span className="text-slate-600">{log.details.stock_after}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

