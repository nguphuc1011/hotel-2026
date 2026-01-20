'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Filter, Calendar as CalendarIcon, ArrowUpRight, ArrowDownRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cashFlowService, CashFlowTransaction, CashFlowStats } from '@/services/cashFlowService';
import TransactionModal from './components/TransactionModal';
import CashFlowStatsCards from './components/CashFlowStats';

export default function CashFlowPage() {
  const [stats, setStats] = useState<CashFlowStats>({
    total_in: 0,
    total_out: 0,
    net_income: 0,
    current_balance: 0,
    chart_data: []
  });
  const [transactions, setTransactions] = useState<CashFlowTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Filter state
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Đầu tháng
    end: new Date() // Hôm nay
  });
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Stats
      const statsData = await cashFlowService.getStats(dateRange.start, dateRange.end);
      setStats(statsData);

      // Fetch List
      const { data } = await cashFlowService.getTransactions(1, 100, {
        startDate: dateRange.start,
        endDate: dateRange.end,
        type: typeFilter === 'ALL' ? undefined : typeFilter
      });
      setTransactions(data);
    } catch (error) {
      console.error(error);
      toast.error('Không thể tải dữ liệu thu chi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange, typeFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa giao dịch này?')) return;
    try {
      await cashFlowService.deleteTransaction(id);
      toast.success('Đã xóa giao dịch');
      fetchData();
    } catch (error) {
      toast.error('Không thể xóa giao dịch (Có thể là giao dịch tự động)');
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-[#0f172a] p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Quản Lý Thu Chi</h1>
          <p className="text-gray-400 mt-1">Theo dõi dòng tiền và sức khỏe tài chính hệ thống</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-900/40 flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus size={20} />
          Tạo Phiếu Mới
        </button>
      </div>

      {/* Filters */}
      <div className="bg-gray-800/30 p-4 rounded-xl border border-gray-700/50 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-gray-400 bg-gray-900/50 px-3 py-2 rounded-lg border border-gray-700">
          <CalendarIcon size={16} />
          <span className="text-sm font-medium">Kỳ báo cáo:</span>
        </div>
        
        <input 
          type="date" 
          value={dateRange.start.toISOString().split('T')[0]}
          onChange={(e) => setDateRange(prev => ({ ...prev, start: new Date(e.target.value) }))}
          className="bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <span className="text-gray-500">-</span>
        <input 
          type="date" 
          value={dateRange.end.toISOString().split('T')[0]}
          onChange={(e) => setDateRange(prev => ({ ...prev, end: new Date(e.target.value) }))}
          className="bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        />

        <div className="h-6 w-px bg-gray-700 mx-2 hidden md:block" />

        <div className="flex items-center gap-2 bg-gray-900/50 p-1 rounded-lg border border-gray-700">
            <button 
                onClick={() => setTypeFilter('ALL')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${typeFilter === 'ALL' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}
            >
                Tất cả
            </button>
            <button 
                onClick={() => setTypeFilter('IN')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${typeFilter === 'IN' ? 'bg-green-900/50 text-green-400' : 'text-gray-400 hover:text-white'}`}
            >
                Thu
            </button>
            <button 
                onClick={() => setTypeFilter('OUT')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${typeFilter === 'OUT' ? 'bg-red-900/50 text-red-400' : 'text-gray-400 hover:text-white'}`}
            >
                Chi
            </button>
        </div>
      </div>

      {/* Stats Cards */}
      <CashFlowStatsCards stats={stats} loading={loading} />

      {/* Simple Chart Bar (CSS only) */}
      {!loading && stats.chart_data.length > 0 && (
        <div className="bg-gray-800/30 p-6 rounded-xl border border-gray-700/50">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Filter size={18} /> Biểu đồ dòng tiền theo ngày
            </h3>
            <div className="flex items-end gap-2 h-40 overflow-x-auto pb-2 scrollbar-hide">
                {stats.chart_data.map((day, idx) => {
                    const maxVal = Math.max(...stats.chart_data.map(d => Math.max(d.total_in, d.total_out)));
                    const hIn = maxVal ? (day.total_in / maxVal) * 100 : 0;
                    const hOut = maxVal ? (day.total_out / maxVal) * 100 : 0;
                    return (
                        <div key={idx} className="flex flex-col items-center gap-1 min-w-[40px] group relative">
                             <div className="flex gap-1 items-end h-full w-full justify-center">
                                <div style={{ height: `${hIn}%` }} className="w-3 bg-green-500 rounded-t-sm opacity-80 group-hover:opacity-100 transition-all" />
                                <div style={{ height: `${hOut}%` }} className="w-3 bg-red-500 rounded-t-sm opacity-80 group-hover:opacity-100 transition-all" />
                             </div>
                             <span className="text-[10px] text-gray-500 mt-1 truncate w-full text-center">
                                {new Date(day.date).getDate()}/{new Date(day.date).getMonth()+1}
                             </span>
                             {/* Tooltip */}
                             <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-xs p-2 rounded border border-gray-700 whitespace-nowrap z-10">
                                <div className="text-green-400">Thu: {formatMoney(day.total_in)}</div>
                                <div className="text-red-400">Chi: {formatMoney(day.total_out)}</div>
                             </div>
                        </div>
                    );
                })}
            </div>
        </div>
      )}

      {/* Transaction List */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/50 overflow-hidden">
        <div className="p-4 border-b border-gray-700/50 flex justify-between items-center">
            <h3 className="text-lg font-bold text-white">Lịch sử giao dịch</h3>
            <span className="text-sm text-gray-400">{transactions.length} bản ghi</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-900/50 text-gray-400 text-sm uppercase">
              <tr>
                <th className="p-4 font-medium">Thời gian</th>
                <th className="p-4 font-medium">Loại</th>
                <th className="p-4 font-medium">Danh mục</th>
                <th className="p-4 font-medium">Diễn giải</th>
                <th className="p-4 font-medium text-right">Số tiền</th>
                <th className="p-4 font-medium text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {loading ? (
                <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">Đang tải dữ liệu...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">Chưa có giao dịch nào trong khoảng thời gian này.</td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-700/30 transition-colors group">
                    <td className="p-4 text-gray-300 whitespace-nowrap text-sm">
                        {formatDate(tx.occurred_at)}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        tx.flow_type === 'IN' 
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {tx.flow_type === 'IN' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {tx.flow_type === 'IN' ? 'Thu' : 'Chi'}
                      </span>
                    </td>
                    <td className="p-4 text-white font-medium">{tx.category}</td>
                    <td className="p-4 text-gray-400 text-sm max-w-xs truncate" title={tx.description || ''}>
                        {tx.description || '-'}
                        {tx.is_auto && <span className="ml-2 text-[10px] bg-blue-900/50 text-blue-300 px-1 rounded">AUTO</span>}
                    </td>
                    <td className={`p-4 text-right font-bold ${tx.flow_type === 'IN' ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.flow_type === 'IN' ? '+' : '-'}{formatMoney(tx.amount)}
                    </td>
                    <td className="p-4 text-center">
                        {!tx.is_auto && (
                            <button 
                                onClick={() => handleDelete(tx.id)}
                                className="text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                title="Xóa"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <TransactionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchData} 
      />
    </div>
  );
}
