'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import Link from 'next/link';

import ServiceList from './_components/ServiceList';
import ServiceCategories from './_components/ServiceCategories';
import StockHistory from './_components/StockHistory';
import { Package, List, History, ChevronLeft } from 'lucide-react';

const tabs = [
  { id: 'list', label: 'Dịch vụ', icon: List },
  { id: 'categories', label: 'Loại', icon: Package },
  { id: 'history', label: 'Lịch sử', icon: History },
];

const TabButton = ({ label, isActive, onClick }: { label: string, isActive: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      'relative flex-1 rounded-full px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap',
      isActive ? 'text-white' : 'text-slate-500 hover:bg-slate-100'
    )}
  >
    {isActive && (
      <motion.div
        layoutId="active-service-tab-indicator"
        className="absolute inset-0 z-0 rounded-full bg-blue-600"
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      />
    )}
    <span className="relative z-10">{label}</span>
  </button>
);

export default function ServicesSettingsPage() {
  const [activeTab, setActiveTab] = useState(tabs[0].id);

  const renderContent = () => {
    switch (activeTab) {
      case 'list':
        return <ServiceList />;
      case 'categories':
        return <ServiceCategories />;
      case 'history':
        return <StockHistory />;
      default:
        return null;
    }
  };

  return (
    <div className="pb-32 pt-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/settings" className="p-2 -ml-2 rounded-full active:bg-slate-200 transition-colors">
          <ChevronLeft className="h-6 w-6 text-slate-600" />
        </Link>
        <h1 className="text-xl font-bold text-slate-800">Quản lý Dịch vụ</h1>
      </div>

      {/* Tab Navigation - Apple Style Pill */}
      <div className="mb-8 sticky top-16 z-30 py-2 bg-slate-50/80 backdrop-blur-sm -mx-4 px-4">
        <div className="flex items-center justify-between rounded-2xl bg-slate-200/50 p-1 shadow-inner overflow-x-auto scrollbar-hide gap-1">
          {tabs.map(tab => (
            <TabButton 
              key={tab.id} 
              label={tab.label} 
              isActive={activeTab === tab.id} 
              onClick={() => setActiveTab(tab.id)} 
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

