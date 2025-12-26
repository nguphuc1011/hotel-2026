'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowUpCircle, ArrowDownCircle, Search, History, Package } from 'lucide-react';
import { useNotification } from '@/context/NotificationContext';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

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

export default function StockHistory() {
  const { showNotification } = useNotification();
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_history')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) showNotification('Lỗi khi tải lịch sử kho', 'error');
    else setLogs(data as StockLog[]);
    setLoading(false);
  }, [showNotification]);

  useEffect(() => {
    let isMounted = true;
    if (isMounted) {
      fetchLogs();
    }
    return () => { isMounted = false; };
  }, [fetchLogs]);

  const filteredLogs = logs.filter(log => 
    log.details.service_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details.reason?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Tìm tên dịch vụ hoặc lý do..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-14 w-full rounded-2xl bg-slate-200/50 pl-12 pr-4 text-base font-medium text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-inner"
        />
      </div>

      <div className="space-y-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-[2rem] bg-slate-100" />
          ))
        ) : filteredLogs.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-slate-200 py-20 text-slate-400 bg-white/50">
            <History className="h-12 w-12 opacity-20 mb-4" />
            <p className="text-lg font-bold">Không tìm thấy lịch sử</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="group relative overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl",
                    log.action_type === 'IMPORT' ? "bg-emerald-50 text-emerald-600" : 
                    log.action_type === 'EXPORT' ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
                  )}>
                    {log.action_type === 'IMPORT' ? <ArrowUpCircle size={24} /> : <ArrowDownCircle size={24} />}
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-800">{log.details.service_name}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {new Date(log.created_at).toLocaleString('vi-VN', { 
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className={cn(
                    "text-lg font-black",
                    log.action_type === 'IMPORT' ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {log.action_type === 'IMPORT' ? '+' : '-'}{log.quantity}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {log.details.stock_before} → {log.details.stock_after}
                  </p>
                </div>
              </div>

              {log.details.reason && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <Package size={12} className="text-slate-400" />
                  <p className="text-xs font-medium text-slate-600">{log.details.reason}</p>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
