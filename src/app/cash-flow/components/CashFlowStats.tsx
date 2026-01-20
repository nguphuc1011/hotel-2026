'use client';

import React from 'react';
import { ArrowDownRight, ArrowUpRight, Wallet, TrendingUp } from 'lucide-react';

interface StatsProps {
  stats: {
    total_in: number;
    total_out: number;
    net_income: number;
    current_balance: number;
  };
  loading: boolean;
}

export default function CashFlowStats({ stats, loading }: StatsProps) {
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-gray-800/50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      {/* Tổng Thu */}
      <div className="bg-gray-800/50 p-5 rounded-xl border border-gray-700/50 backdrop-blur-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
          <ArrowUpRight size={64} className="text-green-500" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-green-500/20 rounded-lg text-green-500">
            <ArrowUpRight size={20} />
          </div>
          <span className="text-gray-400 font-medium">Tổng Thu</span>
        </div>
        <div className="text-2xl font-bold text-white">{formatMoney(stats.total_in)}</div>
      </div>

      {/* Tổng Chi */}
      <div className="bg-gray-800/50 p-5 rounded-xl border border-gray-700/50 backdrop-blur-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
          <ArrowDownRight size={64} className="text-red-500" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-red-500/20 rounded-lg text-red-500">
            <ArrowDownRight size={20} />
          </div>
          <span className="text-gray-400 font-medium">Tổng Chi</span>
        </div>
        <div className="text-2xl font-bold text-white">{formatMoney(stats.total_out)}</div>
      </div>

      {/* Thực Thu (Net) */}
      <div className="bg-gray-800/50 p-5 rounded-xl border border-gray-700/50 backdrop-blur-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
          <TrendingUp size={64} className="text-blue-500" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-500/20 rounded-lg text-blue-500">
            <TrendingUp size={20} />
          </div>
          <span className="text-gray-400 font-medium">Thực Thu</span>
        </div>
        <div className={`text-2xl font-bold ${stats.net_income >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
          {formatMoney(stats.net_income)}
        </div>
      </div>

      {/* Tồn Quỹ (Balance) */}
      <div className="bg-gradient-to-br from-indigo-900/80 to-purple-900/80 p-5 rounded-xl border border-indigo-500/30 backdrop-blur-sm relative overflow-hidden shadow-lg shadow-indigo-900/20">
        <div className="absolute top-0 right-0 p-3 opacity-20">
          <Wallet size={64} className="text-white" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-white/20 rounded-lg text-white">
            <Wallet size={20} />
          </div>
          <span className="text-indigo-200 font-medium">Tồn Quỹ Hiện Tại</span>
        </div>
        <div className="text-2xl font-bold text-white">{formatMoney(stats.current_balance)}</div>
      </div>
    </div>
  );
}
