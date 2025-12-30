'use client';

import OperationSettings from './_components/OperationSettings';
import { Activity, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function OperationsPage() {
  return (
    <div className="pt-4 pb-32">
      {/* Header aligned with other settings pages */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href="/settings" 
            className="w-10 h-10 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:border-rose-100 transition-all active:scale-95"
          >
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Vận hành</h1>
            <p className="text-slate-500 text-sm">Thiết lập luồng hoạt động của App</p>
          </div>
        </div>
        <div className="p-3 bg-rose-50 rounded-2xl border border-rose-100">
          <Activity className="h-6 w-6 text-rose-500" />
        </div>
      </header>

      <OperationSettings />
    </div>
  );
}
