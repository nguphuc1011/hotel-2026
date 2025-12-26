'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowUpCircle, ArrowDownCircle, Search, History, Package, AlertCircle } from 'lucide-react';
import { useNotification } from '@/context/NotificationContext';
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
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

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
    const name = log.details?.service_name?.toLowerCase() || '';
    const reason = log.details?.reason?.toLowerCase() || '';
    const query = searchTerm.toLowerCase();
    return name.includes(query) || reason.includes(query);
  });

  if (error) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="h-12 w-12 text-rose-500 mx-auto mb-4" />
        <p className="text-slate-800 font-bold mb-4">Lỗi: {error}</p>
        <button onClick={() => fetchLogs()} className="bg-blue-600 text-white px-6 py-2 rounded-xl">Thử lại</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Tìm tên dịch vụ hoặc lý do..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-12 w-full rounded-xl bg-white border border-slate-200 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-3">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="h-20 bg-slate-100 animate-pulse rounded-2xl" />)
        ) : filteredLogs.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
            <History size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-bold">Chưa có lịch sử biến động kho</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "h-10 w-10 flex items-center justify-center rounded-xl",
                  log.action_type === 'IMPORT' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                )}>
                  {log.action_type === 'IMPORT' ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{log.details?.service_name || 'Dịch vụ'}</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {new Date(log.created_at).toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>
              
              <div className="text-right">
                <p className={cn(
                  "font-black text-lg",
                  log.action_type === 'IMPORT' ? "text-emerald-600" : "text-rose-600"
                )}>
                  {log.action_type === 'IMPORT' ? '+' : '-'}{log.quantity}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase">
                  {log.details?.reason || 'Cập nhật kho'}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
