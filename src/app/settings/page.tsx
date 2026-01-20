'use client';

import { 
  ChevronRight, 
  DollarSign, 
  BedDouble, 
  Users, 
  ShieldCheck, 
  Bell,
  Info,
  ArrowUpRight
} from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  return (
    <div className="p-8 md:p-16 max-w-5xl mx-auto pb-32 md:pb-16">
      <header className="mb-16">
        <h1 className="text-5xl font-black-italic tracking-tighter uppercase italic text-accent">Cài đặt</h1>
        <p className="text-muted font-bold text-sm tracking-tight mt-4 uppercase tracking-[0.1em]">Cấu hình hệ thống 1Hotel Management V2</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Main Bento Large */}
        <Link href="/settings/pricing" className="md:col-span-2 bento-card p-10 bg-white border-accent/10 flex flex-col justify-between group overflow-hidden relative min-h-[320px] active:scale-[0.98]">
          <div className="relative z-10">
            <div className="w-16 h-16 bg-accent/5 rounded-[22px] flex items-center justify-center mb-8 text-accent">
              <DollarSign size={32} />
            </div>
            <h2 className="text-4xl font-black tracking-tight mb-3 text-main">Cấu hình giá</h2>
            <p className="text-muted font-medium text-sm max-w-xs leading-relaxed">Thiết lập bảng giá, phụ thu và các chính sách giảm giá linh hoạt cho từng mùa vụ.</p>
          </div>
          <div className="flex items-center gap-2 font-black text-xs uppercase tracking-[0.2em] relative z-10 text-accent group-hover:gap-4 transition-all">
            <span>Truy cập</span>
            <ChevronRight size={16} />
          </div>
          <div className="absolute right-[-20px] bottom-[-20px] w-64 h-64 bg-accent/5 rounded-full blur-3xl group-hover:bg-accent/10 transition-all duration-500" />
        </Link>

        {/* Categories Small */}
        <Link href="/settings/categories" className="bento-card p-8 bg-white border-accent/10 flex flex-col justify-between group overflow-hidden relative active:scale-[0.98]">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-orange-50 rounded-[18px] flex items-center justify-center mb-6 text-orange-500">
              <BedDouble size={24} />
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-2 text-main">Hạng phòng</h3>
            <p className="text-muted font-medium text-xs leading-relaxed">Quản lý danh sách phòng và các hạng phòng.</p>
          </div>
          <div className="flex justify-end mt-4">
            <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
              <ArrowUpRight size={20} />
            </div>
          </div>
        </Link>

        {/* Services Small */}
        <Link href="/settings/services" className="bento-card p-8 bg-white border-accent/10 flex flex-col justify-between group overflow-hidden relative active:scale-[0.98]">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-purple-50 rounded-[18px] flex items-center justify-center mb-6 text-purple-500">
              <Users size={24} />
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-2 text-main">Dịch vụ</h3>
            <p className="text-muted font-medium text-xs leading-relaxed">Menu đồ ăn, nước uống và quản lý kho.</p>
          </div>
          <div className="flex justify-end mt-4">
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
              <ArrowUpRight size={20} />
            </div>
          </div>
        </Link>

        {/* Cash Flow Categories - New */}
        <Link href="/settings/cash-flow" className="bento-card p-8 bg-white border-accent/10 flex flex-col justify-between group overflow-hidden relative active:scale-[0.98]">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-emerald-50 rounded-[18px] flex items-center justify-center mb-6 text-emerald-500">
              <DollarSign size={24} />
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-2 text-main">Danh mục Thu Chi</h3>
            <p className="text-muted font-medium text-xs leading-relaxed">Quản lý các loại khoản thu và chi phí.</p>
          </div>
          <div className="flex justify-end mt-4">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
              <ArrowUpRight size={20} />
            </div>
          </div>
        </Link>

        {/* Staff & Security - NEW */}
        <Link href="/settings/staff" className="bento-card p-8 bg-white border-accent/10 flex flex-col justify-between group overflow-hidden relative active:scale-[0.98]">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-rose-50 rounded-[18px] flex items-center justify-center mb-6 text-rose-500">
              <ShieldCheck size={24} />
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-2 text-main">Nhân viên & Bảo mật</h3>
            <p className="text-muted font-medium text-xs leading-relaxed">Quản lý tài khoản và cấu hình mã PIN.</p>
          </div>
          <div className="flex justify-end mt-4">
            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 group-hover:scale-110 transition-transform">
              <ArrowUpRight size={20} />
            </div>
          </div>
        </Link>

        {/* System Info Wide */}
        <div className="md:col-span-3 bento-card p-8 bg-white/50 border-accent/5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-ghost">
              <Info size={24} />
            </div>
            <div>
              <p className="text-[11px] font-black tracking-[0.2em] uppercase text-main">1Hotel Management System</p>
              <p className="text-[10px] text-muted font-bold italic mt-1 uppercase">Version 2.0.0 • Pure Minimalism Edition</p>
            </div>
          </div>
          <button className="text-[10px] font-black uppercase tracking-[0.2em] text-muted hover:text-accent transition-colors border-b border-black/10 pb-1">Check updates</button>
        </div>
      </div>
    </div>
  );
}
