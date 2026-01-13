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
            Chỉnh sửa ngay <ArrowUpRight size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
          </div>
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-accent/5 rounded-full blur-3xl group-hover:bg-accent/10 transition-all duration-1000" />
        </Link>

        {/* Small Bento - Room Types */}
        <Link href="/settings/categories" className="bento-card p-10 flex flex-col justify-between group cursor-pointer hover:bg-accent hover:text-white transition-all duration-500 active:scale-95">
          <div className="w-14 h-14 bg-accent/5 group-hover:bg-white/10 rounded-[22px] flex items-center justify-center text-accent group-hover:text-white transition-colors">
            <BedDouble size={28} />
          </div>
          <div>
            <h3 className="text-2xl font-black mb-2">Hạng phòng</h3>
            <p className="text-muted group-hover:text-white/60 text-xs font-bold uppercase tracking-widest">Cấu hình chi tiết</p>
          </div>
        </Link>

        {/* Data & Security */}
        <Link href="/customers" className="bento-card p-10 flex flex-col justify-between cursor-pointer active:scale-95 group hover:border-accent/20">
          <div className="flex justify-between items-start">
            <div className="w-14 h-14 bg-orange-50 rounded-[22px] flex items-center justify-center text-orange-500">
              <Users size={28} />
            </div>
            <ChevronRight size={20} className="text-ghost group-hover:text-accent transition-colors" />
          </div>
          <div>
            <h3 className="text-2xl font-black mb-2">Khách hàng</h3>
            <p className="text-muted text-xs font-bold uppercase tracking-widest">Quản lý hồ sơ & công nợ</p>
          </div>
        </Link>

        <div className="bento-card p-10 flex flex-col justify-between cursor-pointer active:scale-95 group hover:border-accent/20">
          <div className="flex justify-between items-start">
            <div className="w-14 h-14 bg-purple-50 rounded-[22px] flex items-center justify-center text-purple-500">
              <ShieldCheck size={28} />
            </div>
            <ChevronRight size={20} className="text-ghost group-hover:text-accent transition-colors" />
          </div>
          <div>
            <h3 className="text-2xl font-black mb-2">Bảo mật</h3>
            <p className="text-muted text-xs font-bold uppercase tracking-widest">Phân quyền hệ thống</p>
          </div>
        </div>

        {/* System & Info */}
        <div className="bento-card p-10 flex flex-col justify-between cursor-pointer active:scale-95 group hover:border-accent/20">
          <div className="flex justify-between items-start">
            <div className="w-14 h-14 bg-red-50 rounded-[22px] flex items-center justify-center text-red-500">
              <Bell size={28} />
            </div>
            <ChevronRight size={20} className="text-ghost group-hover:text-accent transition-colors" />
          </div>
          <div>
            <h3 className="text-2xl font-black mb-2">Thông báo</h3>
            <p className="text-muted text-xs font-bold uppercase tracking-widest">Email & SMS</p>
          </div>
        </div>

        {/* Services */}
        <Link href="/settings/services" className="bento-card p-10 flex flex-col justify-between cursor-pointer active:scale-95 group hover:border-accent/20">
          <div className="flex justify-between items-start">
            <div className="w-14 h-14 bg-orange-50 rounded-[22px] flex items-center justify-center text-orange-500">
              <DollarSign size={28} /> {/* Using DollarSign as placeholder, ideally Coffee icon if imported */}
            </div>
            <ChevronRight size={20} className="text-ghost group-hover:text-accent transition-colors" />
          </div>
          <div>
            <h3 className="text-2xl font-black mb-2">Dịch vụ</h3>
            <p className="text-muted text-xs font-bold uppercase tracking-widest">Menu đồ ăn uống</p>
          </div>
        </Link>

        {/* Full width Bento Footer */}
        <div className="md:col-span-3 bento-card p-8 flex items-center justify-between bg-white/50 backdrop-blur-sm border border-black/[0.03]">
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
