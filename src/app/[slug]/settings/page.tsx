'use client';

import { 
  ChevronRight, 
  DollarSign, 
  BedDouble, 
  Users, 
  ShieldCheck, 
  Bell,
  Info,
  ArrowUpRight,
  Settings2
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSION_KEYS } from '@/services/permissionService';

export default function SettingsPage() {
  const { slug } = useParams();
  const { can, isLoading } = usePermission();

  if (isLoading) return null;

  if (!can(PERMISSION_KEYS.VIEW_SETTINGS)) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-slate-50">
         <div className="text-center">
           <ShieldCheck size={48} className="mx-auto text-slate-300 mb-4" />
           <h1 className="text-xl font-bold text-slate-700">Không có quyền truy cập</h1>
           <p className="text-slate-500">Vui lòng liên hệ quản lý.</p>
         </div>
       </div>
     );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-8 pb-32">
      <header className="mb-8">
        <h1 className="text-5xl font-black-italic tracking-tighter uppercase italic text-accent">Cài đặt</h1>
        <p className="text-muted font-bold text-sm tracking-tight mt-4 uppercase tracking-[0.1em]">Cấu hình hệ thống MANA PMS</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Main Bento Large */}
        <Link href={`/${slug}/settings/pricing`} className="md:col-span-2 bento-card p-6 bg-white border-accent/10 flex flex-col justify-between group overflow-hidden relative min-h-[240px] active:scale-[0.98]">
          <div className="relative z-10">
            <div className="w-16 h-16 bg-accent/5 rounded-[22px] flex items-center justify-center mb-6 text-accent">
              <DollarSign size={36} />
            </div>
            <h2 className="text-3xl font-black tracking-tight mb-2 text-main">Cấu hình giá</h2>
            <p className="text-muted font-medium text-base max-w-xs leading-relaxed">Thiết lập bảng giá, phụ thu và các chính sách giảm giá linh hoạt.</p>
          </div>
          <div className="flex items-center gap-2 font-black text-xs uppercase tracking-[0.2em] relative z-10 text-accent group-hover:gap-4 transition-all">
            <span>Truy cập</span>
            <ChevronRight size={18} />
          </div>
          <div className="absolute right-[-20px] bottom-[-20px] w-48 h-48 bg-accent/5 rounded-full blur-3xl group-hover:bg-accent/10 transition-all duration-500" />
        </Link>

        {/* General Settings - New */}
        <Link href={`/${slug}/settings/general`} className="bento-card p-6 bg-white border-accent/10 flex flex-col justify-between group overflow-hidden relative active:scale-[0.98]">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-blue-50 rounded-[18px] flex items-center justify-center mb-4 text-blue-500">
              <Settings2 size={28} />
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-1 text-main">Cấu hình chung</h3>
            <p className="text-muted font-medium text-sm leading-relaxed">Thông tin khách sạn, địa chỉ, liên hệ.</p>
          </div>
          <div className="flex justify-end mt-2">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
              <ArrowUpRight size={22} />
            </div>
          </div>
        </Link>

        {/* Categories Small */}
        <Link href={`/${slug}/settings/categories`} className="bento-card p-6 bg-white border-accent/10 flex flex-col justify-between group overflow-hidden relative active:scale-[0.98]">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-orange-50 rounded-[18px] flex items-center justify-center mb-4 text-orange-500">
              <BedDouble size={28} />
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-1 text-main">Hạng phòng</h3>
            <p className="text-muted font-medium text-sm leading-relaxed">Quản lý danh sách phòng và hạng phòng.</p>
          </div>
          <div className="flex justify-end mt-2">
            <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
              <ArrowUpRight size={22} />
            </div>
          </div>
        </Link>

        {/* Services Small */}
        <Link href={`/${slug}/settings/services`} className="bento-card p-6 bg-white border-accent/10 flex flex-col justify-between group overflow-hidden relative active:scale-[0.98]">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-purple-50 rounded-[18px] flex items-center justify-center mb-4 text-purple-500">
              <Users size={28} />
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-1 text-main">Dịch vụ</h3>
            <p className="text-muted font-medium text-sm leading-relaxed">Menu đồ ăn, nước uống và kho.</p>
          </div>
          <div className="flex justify-end mt-2">
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform">
              <ArrowUpRight size={22} />
            </div>
          </div>
        </Link>

        {/* Cash Flow Categories - New */}
        <Link href={`/${slug}/settings/cash-flow`} className="bento-card p-6 bg-white border-accent/10 flex flex-col justify-between group overflow-hidden relative active:scale-[0.98]">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-emerald-50 rounded-[18px] flex items-center justify-center mb-4 text-emerald-500">
              <DollarSign size={28} />
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-1 text-main">Danh mục Thu Chi</h3>
            <p className="text-muted font-medium text-sm leading-relaxed">Quản lý các loại khoản thu chi.</p>
          </div>
          <div className="flex justify-end mt-2">
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
              <ArrowUpRight size={22} />
            </div>
          </div>
        </Link>

        {/* System Settings - New */}
        <Link href={`/${slug}/settings/system`} className="bento-card p-6 bg-white border-accent/10 flex flex-col justify-between group overflow-hidden relative active:scale-[0.98]">
          <div className="relative z-10">
            <div className="w-12 h-12 bg-slate-50 rounded-[18px] flex items-center justify-center mb-4 text-slate-500">
              <ShieldCheck size={28} />
            </div>
            <h3 className="text-2xl font-black tracking-tight mb-1 text-main">Hệ thống</h3>
            <p className="text-muted font-medium text-sm leading-relaxed">Cấu hình tham số và hành vi.</p>
          </div>
          <div className="flex justify-end mt-2">
            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 group-hover:scale-110 transition-transform">
              <ArrowUpRight size={22} />
            </div>
          </div>
        </Link>

        {/* Staff & Permissions - NEW GỘP */}
        {can(PERMISSION_KEYS.MANAGE_PERMISSIONS) && (
          <Link href={`/${slug}/settings/staff`} className="bento-card p-6 bg-white border-accent/10 flex flex-col justify-between group overflow-hidden relative active:scale-[0.98]">
            <div className="relative z-10">
              <div className="w-12 h-12 bg-rose-50 rounded-[18px] flex items-center justify-center mb-4 text-rose-500">
                <Users size={28} />
              </div>
              <h3 className="text-2xl font-black tracking-tight mb-1 text-main">Nhân viên</h3>
              <p className="text-muted font-medium text-sm leading-relaxed">Quản lý tài khoản và phân quyền.</p>
            </div>
            <div className="flex justify-end mt-2">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 group-hover:scale-110 transition-transform">
                <ArrowUpRight size={22} />
              </div>
            </div>
          </Link>
        )}

        {/* System Info Wide */}
        <div className="md:col-span-4 bento-card p-6 bg-white/50 border-accent/5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gray-50 rounded-[18px] flex items-center justify-center text-ghost">
              <Info size={28} />
            </div>
            <div>
              <p className="text-sm font-black tracking-[0.2em] uppercase text-main">MANA PMS</p>
              <p className="text-xs text-muted font-bold italic mt-0.5 uppercase">Version 2.0.0 • Pure Minimalism Edition</p>
            </div>
          </div>
          <button className="text-[10px] font-black uppercase tracking-[0.2em] text-muted hover:text-accent transition-colors border-b border-black/10 pb-0.5">Check updates</button>
        </div>
      </div>
    </div>
  );
}
