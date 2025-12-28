'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ChevronLeft, List, Package, History } from 'lucide-react';

import ServiceList from './_components/ServiceList';
import ServiceCategories from './_components/ServiceCategories';
import StockHistory from './_components/StockHistory';

const tabs = [
  { id: 'list', label: 'Dịch vụ', icon: List },
  { id: 'categories', label: 'Phân loại', icon: Package },
  { id: 'history', label: 'Kho hàng', icon: History },
];

export default function ServicesSettingsPage() {
  const [activeTab, setActiveTab] = useState('list');

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      {/* Simple Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link href="/settings" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ChevronLeft size={24} className="text-slate-600" />
          </Link>
          <h1 className="text-xl font-bold text-slate-800">Quản lý Dịch vụ & Kho</h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 mt-4">
        {/* Simple Tab Switcher */}
        <div className="flex bg-slate-200/50 p-1 rounded-2xl mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all",
                activeTab === tab.id 
                  ? "bg-white text-blue-600 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="min-h-[400px]">
          {activeTab === 'list' && <ServiceList />}
          {activeTab === 'categories' && <ServiceCategories />}
          {activeTab === 'history' && <StockHistory />}
        </div>
      </div>
    </div>
  );
}
