'use client';

import React from 'react';
import { ArrowDownRight, ArrowUpRight, Wallet, TrendingUp } from 'lucide-react';
import { formatMoney } from '@/utils/format';

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
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      {/* Tổng Thu */}
      <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
          <ArrowUpRight size={64} className="text-green-500" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-green-50 rounded-lg text-green-600">
            <ArrowUpRight size={20} />
          </div>
          <span className="text-gray-500 font-medium">Tổng Thu</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">{formatMoney(stats.total_in)}</div>
      </div>

      {/* Tổng Chi */}
      <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
          <ArrowDownRight size={64} className="text-red-500" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-red-50 rounded-lg text-red-600">
            <ArrowDownRight size={20} />
          </div>
          <span className="text-gray-500 font-medium">Tổng Chi</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">{formatMoney(stats.total_out)}</div>
      </div>

      {/* Thực Thu (Net) */}
      <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
          <TrendingUp size={64} className="text-blue-500" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            <TrendingUp size={20} />
          </div>
          <span className="text-gray-500 font-medium">Thực Thu</span>
        </div>
        <div className={`text-2xl font-bold ${stats.net_income >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
          {formatMoney(stats.net_income)}
        </div>
      </div>

      {/* Tồn Quỹ (Balance) */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-xl text-white shadow-lg shadow-blue-900/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-3 opacity-20">
          <Wallet size={64} className="text-white" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-white/20 rounded-lg text-white">
            <Wallet size={20} />
          </div>
          <span className="text-blue-100 font-medium">Tồn Quỹ Hiện Tại</span>
        </div>
        <div className="text-2xl font-bold text-white">{formatMoney(stats.current_balance)}</div>
      </div>
    </div>
  );
}
