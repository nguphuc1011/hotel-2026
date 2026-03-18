'use client';

import { 
  ChevronRight, 
  DollarSign, 
  BedDouble, 
  Users, 
  ShieldCheck, 
  Settings2,
  Hotel,
  Key,
  LayoutGrid,
  Bell,
  Palette,
  Database,
  ArrowUpRight,
  UserCheck,
  Package,
  History,
  Info
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSION_KEYS } from '@/services/permissionService';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { slug } = useParams();
  const { can, isLoading } = usePermission();

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
    </div>
  );

  if (!can(PERMISSION_KEYS.VIEW_SETTINGS)) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7]">
         <div className="text-center p-10 bg-white/80 backdrop-blur-xl rounded-[40px] border border-white shadow-xl">
           <ShieldCheck size={64} className="mx-auto text-slate-200 mb-6" />
           <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Quyền truy cập bị từ chối</h1>
           <p className="text-slate-500 font-medium">Vui lòng liên hệ quản trị viên để được cấp quyền.</p>
         </div>
       </div>
     );
  }

  // Define groups for better organization
  interface SettingItem {
    id: string;
    label: string;
    desc: string;
    icon: React.ReactNode;
    href: string;
    permission: string;
    color: string;
    featured?: boolean;
  }

  interface SettingGroup {
    title: string;
    items: SettingItem[];
  }

  const SETTINGS_GROUPS: SettingGroup[] = [
    {
      title: "Cơ bản & Hệ thống",
      items: [
        {
          id: 'general',
          label: 'Cấu hình chung',
          desc: 'Thông tin khách sạn, địa chỉ, liên hệ và múi giờ.',
          icon: <Hotel size={24} />,
          href: `/${slug}/settings/general`,
          permission: PERMISSION_KEYS.VIEW_SETTINGS_GENERAL,
          color: 'blue'
        },
        {
          id: 'system',
          label: 'Tham số hệ thống',
          desc: 'Cấu hình Night Audit, VAT và các quy tắc vận hành.',
          icon: <Settings2 size={24} />,
          href: `/${slug}/settings/system`,
          permission: PERMISSION_KEYS.VIEW_SETTINGS_SYSTEM,
          color: 'slate'
        },
        {
          id: 'staff',
          label: 'Nhân viên & Quyền',
          desc: 'Quản lý tài khoản, phân quyền và lịch sử truy cập.',
          icon: <UserCheck size={24} />,
          href: `/${slug}/settings/staff`,
          permission: PERMISSION_KEYS.MANAGE_PERMISSIONS,
          color: 'rose'
        }
      ]
    },
    {
      title: "Vận hành & Kinh doanh",
      items: [
        {
          id: 'pricing',
          label: 'Cấu hình giá',
          desc: 'Thiết lập bảng giá giờ/ngày/đêm, phụ thu và giảm giá.',
          icon: <DollarSign size={24} />,
          href: `/${slug}/settings/pricing`,
          permission: PERMISSION_KEYS.VIEW_SETTINGS_PRICING,
          color: 'emerald',
          featured: true
        },
        {
          id: 'categories',
          label: 'Hạng phòng & Sơ đồ',
          desc: 'Quản lý danh sách phòng, tầng và loại hình lưu trú.',
          icon: <LayoutGrid size={24} />,
          href: `/${slug}/settings/categories`,
          permission: PERMISSION_KEYS.VIEW_SETTINGS_CATEGORIES,
          color: 'orange'
        },
        {
          id: 'services',
          label: 'Dịch vụ & Kho',
          desc: 'Menu đồ ăn, nước uống, dịch vụ ngoài và quản lý tồn kho.',
          icon: <Package size={24} />,
          href: `/${slug}/settings/services`,
          permission: PERMISSION_KEYS.VIEW_SETTINGS_SERVICES,
          color: 'purple'
        },
        {
          id: 'cash-flow',
          label: 'Danh mục Thu Chi',
          desc: 'Quản lý các loại khoản thu, chi và nguồn tiền.',
          icon: <History size={24} />,
          href: `/${slug}/settings/cash-flow`,
          permission: PERMISSION_KEYS.VIEW_SETTINGS_CASH_FLOW,
          color: 'indigo'
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-slate-900 font-sans selection:bg-slate-900 selection:text-white pb-32">
      
      {/* 1. TOP NAV / HEADER */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-[1600px] mx-auto px-4 md:px-10 h-20 md:h-24 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">Cài đặt</h1>
            <span className="hidden md:block text-slate-400 font-medium text-sm tracking-tight">Cấu hình hệ thống & vận hành</span>
          </div>
          
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border border-emerald-100 shadow-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Hệ thống ổn định
          </div>
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-4 md:px-10 py-8 md:py-12 space-y-12 md:space-y-20">
        
        {SETTINGS_GROUPS.map((group, gIdx) => (
          <section key={gIdx} className="space-y-6 md:space-y-8">
            <div className="px-2">
              <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2">{group.title}</h2>
              <div className="h-1 w-12 bg-slate-200 rounded-full" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {group.items.map((item) => {
                if (!can(item.permission)) return null;

                return (
                  <Link 
                    key={item.id}
                    href={item.href}
                    className={cn(
                      "bg-white/80 backdrop-blur-md rounded-[32px] p-8 md:p-10 border border-white shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all duration-500 group relative overflow-hidden flex flex-col justify-between min-h-[220px]",
                      item.featured && "lg:col-span-2 md:min-h-[260px] bg-slate-900 text-white border-slate-800 shadow-slate-200"
                    )}
                  >
                    <div className="relative z-10">
                      <div className={cn(
                        "w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center mb-6 md:mb-8 shadow-sm transition-transform duration-500 group-hover:scale-110",
                        item.featured ? "bg-white/10 text-white" : 
                        item.color === 'blue' ? "bg-blue-50 text-blue-500" :
                        item.color === 'emerald' ? "bg-emerald-50 text-emerald-500" :
                        item.color === 'rose' ? "bg-rose-50 text-rose-500" :
                        item.color === 'orange' ? "bg-orange-50 text-orange-500" :
                        item.color === 'purple' ? "bg-purple-50 text-purple-500" :
                        item.color === 'indigo' ? "bg-indigo-50 text-indigo-500" :
                        "bg-slate-100 text-slate-500"
                      )}>
                        {item.icon}
                      </div>
                      
                      <div className="space-y-2">
                        <h3 className={cn(
                          "text-2xl md:text-3xl font-black tracking-tight",
                          item.featured ? "text-white" : "text-slate-900"
                        )}>{item.label}</h3>
                        <p className={cn(
                          "text-sm md:text-base font-medium leading-relaxed max-w-[280px]",
                          item.featured ? "text-slate-400" : "text-slate-500"
                        )}>{item.desc}</p>
                      </div>
                    </div>

                    <div className="relative z-10 flex items-center justify-between mt-8">
                      <span className={cn(
                        "text-[10px] font-black uppercase tracking-[0.2em]",
                        item.featured ? "text-white/40" : "text-slate-300"
                      )}>Truy cập cấu hình</span>
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 group-hover:translate-x-1",
                        item.featured ? "bg-white/10 text-white" : "bg-slate-50 text-slate-400 group-hover:bg-slate-900 group-hover:text-white"
                      )}>
                        <ArrowUpRight size={20} strokeWidth={3} />
                      </div>
                    </div>

                    {/* Decorative Background for Featured */}
                    {item.featured && (
                      <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
                        <DollarSign size={200} strokeWidth={0.5} />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        {/* Footer Info */}
        <footer className="pt-10 md:pt-20 border-t border-slate-200/50 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-slate-900 shadow-sm border border-slate-100">
              <Info size={28} />
            </div>
            <div>
              <p className="text-base font-black text-slate-900 tracking-tight">HERA PMS</p>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Version 2.5.0 • Apple Aesthetic Edition</p>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <button className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-900 transition-colors">Tài liệu</button>
            <button className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-900 transition-colors">Hỗ trợ</button>
            <button className="px-6 py-2.5 bg-white rounded-full text-[11px] font-black uppercase tracking-[0.2em] text-slate-900 shadow-sm border border-slate-100 hover:bg-slate-50 transition-all">Kiểm tra cập nhật</button>
          </div>
        </footer>
      </main>
    </div>
  );
}
