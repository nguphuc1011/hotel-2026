'use client';

import React from 'react';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Settings as SettingsIcon,
  LogOut,
  Wallet,
  Banknote,
  Users,
  Key,
  ChevronUp,
  User,
  X,
  ShieldCheck,
  Building2,
  Smartphone,
  Download,
  RefreshCw,
  Home,
  Filter
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import WalletNotificationModal from '@/components/shared/WalletNotificationModal';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSION_KEYS } from '@/services/permissionService';
import { settingsService } from '@/services/settingsService';

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams();
  const { user, fetchUser } = useAuthStore();
  
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const rawSlug = params?.slug as string;
  const [slug, setSlug] = useState<string>('default');

  useEffect(() => {
    if (rawSlug && rawSlug !== 'undefined') {
      setSlug(rawSlug);
    } else if (user?.hotel_slug) {
      setSlug(user.hotel_slug);
    }
  }, [rawSlug, user?.hotel_slug]);

  const { can } = usePermission();
  const [isWalletNotificationOpen, setIsWalletNotificationOpen] = useState(false);
  
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState(false);
  const [pinForm, setPinForm] = useState({ oldPin: '', newPin: '', confirmPin: '' });
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [hotelName, setHotelName] = useState<string>('');
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    setIsIOS(isIOSDevice && !isStandalone);

    if ((window as any).deferredPWAInstallPrompt) {
      setShowInstallBtn(true);
    }

    const handlePWAAvailable = () => {
      setShowInstallBtn(true);
    };

    window.addEventListener('pwa-install-available', handlePWAAvailable);

    const updateManifest = () => {
      let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'manifest';
        document.head.appendChild(link);
      }
      link.href = `/manifest.json?slug=${slug}`;
    };
    updateManifest();

    return () => window.removeEventListener('pwa-install-available', handlePWAAvailable);
  }, [slug]);

  const handleInstallApp = async () => {
    const prompt = (window as any).deferredPWAInstallPrompt;
    if (!prompt) return;
    
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      (window as any).deferredPWAInstallPrompt = null;
      setShowInstallBtn(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('1hotel_user');
    document.cookie = '1hotel_session=; path=/; max-age=0';
    document.cookie = '1hotel_role=; path=/; max-age=0';
    window.location.href = `/${slug}/login`;
  };

  const updatePin = async (oldPin: string, newPin: string) => {
    if (!user) return false;
    try {
        const { data: isValid } = await supabase.rpc('fn_verify_staff_pin', {
          p_staff_id: user.id,
          p_pin_hash: oldPin
        });

        if (!isValid) {
          toast.error('Mã PIN cũ không chính xác');
          return false;
        }

        const { data } = await supabase.rpc('fn_manage_staff', {
            p_action: 'SET_PIN',
            p_id: user.id,
            p_pin_hash: newPin
        });

        if (data && !data.success) throw new Error(data.message);
        toast.success('Đổi mã PIN thành công');
        return true;
    } catch (error: any) {
        toast.error('Lỗi: ' + error.message);
        return false;
    }
  };

  useEffect(() => {
    if (!user) {
      fetchUser();
    }
  }, [user, fetchUser]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchHotelName = async () => {
      if (!user?.hotel_id) return;
      try {
        const settings = await settingsService.getSettings(user.hotel_id);
        if (settings?.hotel_name) {
          setHotelName(settings.hotel_name);
        }
      } catch (error) {
        console.error('Failed to fetch hotel name', error);
      }
    };
    
    if (user?.hotel_id) {
      fetchHotelName();
      interval = setInterval(fetchHotelName, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [user?.hotel_id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinForm.newPin.length !== 4) {
      toast.error('Mã PIN mới phải có 4 số');
      return;
    }
    if (pinForm.newPin !== pinForm.confirmPin) {
      toast.error('Xác nhận mã PIN không khớp');
      return;
    }

    const success = await updatePin(pinForm.oldPin, pinForm.newPin);
    if (success) {
      setIsChangePinModalOpen(false);
      setPinForm({ oldPin: '', newPin: '', confirmPin: '' });
    }
  };


  if (pathname === `/${slug}/login` || pathname === '/login' || pathname.startsWith('/saas-admin')) {
    return <>{children}</>;
  }

  interface NavItem {
    icon: React.ReactNode;
    label: string;
    href: string;
    permission?: string;
    isSpecial?: boolean;
  }

  const navItems: NavItem[] = [
    { icon: <LayoutDashboard size={24} />, label: 'Sơ đồ', href: `/${slug}`, permission: PERMISSION_KEYS.VIEW_DASHBOARD },
    { icon: <Banknote size={24} />, label: 'Thu Chi', href: `/${slug}/tien`, permission: PERMISSION_KEYS.VIEW_MONEY },
    { icon: <Users size={24} />, label: 'Khách hàng', href: `/${slug}/customers`, permission: PERMISSION_KEYS.VIEW_CUSTOMERS },
    { icon: <ClipboardList size={24} />, label: 'Báo cáo', href: `/${slug}/reports`, permission: PERMISSION_KEYS.VIEW_REPORTS },
    { icon: <SettingsIcon size={24} />, label: 'Cài đặt', href: `/${slug}/settings`, permission: PERMISSION_KEYS.VIEW_SETTINGS },
  ];

  const saasAdminItem: NavItem | null = can(PERMISSION_KEYS.VIEW_SAAS_ADMIN) ? {
    icon: <ShieldCheck size={24} />,
    label: 'Quản trị SaaS',
    href: '/saas-admin',
    isSpecial: true,
    permission: PERMISSION_KEYS.VIEW_SAAS_ADMIN
  } : null;

  const filteredNavItems = navItems.filter(item => {
    if (item.href.endsWith('/reports') && user?.hotels?.features?.advanced_reports === false) {
      return false;
    }
    return true;
  });

  const visibleNavItems = filteredNavItems.filter(item => !item.permission || can(item.permission));

  const finalSidebarItems: NavItem[] = mounted ? (() => {
    const items = [...visibleNavItems];
    if (saasAdminItem) items.push(saasAdminItem);
    return items;
  })() : visibleNavItems; 

  const homeItem = (mounted ? visibleNavItems : navItems).find(i => i.href === `/${slug}`) || (mounted ? visibleNavItems[0] : navItems[0]);
  const mobileItems = visibleNavItems.filter(i => i.href !== homeItem?.href).slice(0, 4);
  
  const leftItems = mobileItems.slice(0, Math.ceil(mobileItems.length / 2));
  const rightItems = mobileItems.slice(Math.ceil(mobileItems.length / 2));

  return (
    <div className="flex w-full h-screen overflow-hidden bg-white">
      <WalletNotificationModal />
      {/* PC Sidebar - Hidden on mobile, Mini on Tablet Landscape (lg:flex), Full on Desktop (xl:flex) */}
      <aside className={cn(
        "hidden lg:flex flex-col h-full bg-white border-r border-slate-100 z-50 transition-all duration-300 ease-in-out",
        "lg:w-20 xl:w-72" // lg (Landscape Tablet) = Mini, xl (Desktop) = Full
      )}>
        <div className="p-4 xl:p-8 flex justify-center xl:justify-start">
          <div className="flex flex-col">
            <h1 className="text-xl xl:text-2xl font-black uppercase tracking-tighter flex items-center gap-2 text-blue-600 truncate">
              <Building2 className="xl:hidden" size={28} />
              <span className="hidden xl:inline">{hotelName || 'Hệ thống'}</span>
            </h1>
          </div>
        </div>
        
        <nav className="flex-1 px-2 xl:px-4 space-y-2">
          {finalSidebarItems.map((item) => (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex items-center gap-3 py-3 rounded-2xl transition-all duration-200 font-bold text-sm group relative",
                pathname === item.href 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
                  : item.isSpecial 
                    ? "text-emerald-500 hover:bg-emerald-50"
                    : "text-slate-500 hover:bg-slate-50 hover:text-blue-600",
                "justify-center xl:justify-start px-0 xl:px-4" // Mini mode = centered icons
              )}
            >
              <div className="shrink-0 transition-transform group-hover:scale-110 duration-200">
                {item.icon}
              </div>
              <span className="hidden xl:inline truncate">{item.label}</span>
              
              {/* Tooltip for Mini Sidebar */}
              <div className="lg:xl:hidden absolute left-full ml-4 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-[60] whitespace-nowrap shadow-xl">
                {item.label}
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-slate-900 rotate-45" />
              </div>
            </Link>
          ))}
        </nav>

        <div className="p-4 xl:p-6 border-t border-slate-50 relative" ref={userMenuRef}>
          {showInstallBtn && (
            <button 
              onClick={handleInstallApp}
              className="flex items-center gap-3 p-3 w-full rounded-2xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all mb-4 group animate-bounce-subtle justify-center xl:justify-start"
            >
              <div className="w-10 h-10 shrink-0 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-200 group-hover:scale-105 transition-transform">
                <Download size={20} />
              </div>
              <div className="hidden xl:block flex-1 text-left">
                <p className="text-sm font-black uppercase tracking-tight">Cài đặt App</p>
                <p className="text-[10px] font-bold opacity-70 uppercase tracking-wider">Trải nghiệm tốt hơn</p>
              </div>
            </button>
          )}

          {isUserMenuOpen && (
            <div className="absolute bottom-full left-2 right-2 xl:left-4 xl:right-4 mb-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
              <button 
                onClick={() => {
                  setIsChangePinModalOpen(true);
                  setIsUserMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 text-main font-bold text-sm transition-colors text-left"
              >
                <Key size={16} className="text-muted" />
                <span className="hidden xl:inline">Đổi mã PIN</span>
              </button>
              <div className="h-px bg-gray-100 my-1" />
              <button 
                onClick={logout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-rose-50 text-rose-500 font-bold text-sm transition-colors text-left"
              >
                <LogOut size={16} />
                <span className="hidden xl:inline">Đăng xuất</span>
              </button>
            </div>
          )}
          
          <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-3 p-2 xl:p-3 w-full rounded-2xl hover:bg-slate-50 transition-all group justify-center xl:justify-start"
          >
            <div className="w-10 h-10 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-blue-200 group-hover:scale-105 transition-transform">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="hidden xl:block flex-1 text-left truncate">
              <p className="text-sm font-black text-slate-700 truncate">{user?.full_name}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{user?.role}</p>
            </div>
            <ChevronUp size={16} className={cn("hidden xl:block text-slate-400 transition-transform duration-300", isUserMenuOpen && "rotate-180")} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-auto relative no-scrollbar bg-[#F8F9FB] pt-0 pb-[max(6rem,env(safe-area-inset-bottom))] lg:pb-0">
        <div className="w-full">
          {children}
        </div>
      </main>

      {/* Change PIN Modal */}
      {isChangePinModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black uppercase tracking-tight text-main">
                Đổi mã PIN
              </h2>
              <button 
                onClick={() => setIsChangePinModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-muted hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleChangePinSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Mã PIN cũ</label>
                <input 
                  type="password"
                  maxLength={4}
                  value={pinForm.oldPin}
                  onChange={e => setPinForm({...pinForm, oldPin: e.target.value.replace(/\D/g, '')})}
                  className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-accent outline-none font-black text-center text-2xl tracking-[1em]"
                  placeholder="••••"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">PIN Mới</label>
                  <input 
                    type="password"
                    maxLength={4}
                    value={pinForm.newPin}
                    onChange={e => setPinForm({...pinForm, newPin: e.target.value.replace(/\D/g, '')})}
                    className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-accent outline-none font-black text-center text-2xl tracking-[0.5em]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">Xác nhận</label>
                  <input 
                    type="password"
                    maxLength={4}
                    value={pinForm.confirmPin}
                    onChange={e => setPinForm({...pinForm, confirmPin: e.target.value.replace(/\D/g, '')})}
                    className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-accent outline-none font-black text-center text-2xl tracking-[0.5em]"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  type="button"
                  onClick={() => setIsChangePinModalOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-muted hover:bg-gray-50 transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 rounded-xl font-bold bg-accent text-white hover:bg-accent/90 transition-colors shadow-lg shadow-accent/20"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Mobile Bottom Nav - Show on mobile and iPad Portrait (lg:hidden) */}
      {mounted && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-[75px] flex items-end">
          <div className="relative w-full h-[65px] flex items-center justify-between px-4 bg-white/90 backdrop-blur-xl rounded-t-[24px] shadow-[0_-10px_30px_rgba(0,0,0,0.1)] border-t border-white/40">
            
            <div className="flex-1 flex justify-around items-center h-full">
              {leftItems.map((item) => (
                <Link 
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center active:scale-90 transition-all group"
                >
                  <div className={cn(
                    "w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-300",
                    pathname === item.href ? "text-accent" : "text-slate-400 group-hover:text-slate-600"
                  )}>
                    {React.cloneElement(item.icon as any, { 
                      size: 20,
                      strokeWidth: 2
                    })}
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold transition-colors duration-300 tracking-tight",
                    pathname === item.href ? "text-accent" : "text-slate-400"
                  )}>
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>

            {homeItem && (
               <Link 
                 href={homeItem.href}
                 className="flex flex-col items-center justify-center active:scale-95 transition-all group px-4 relative -top-2"
               >
                 <div className={cn(
                   "w-[54px] h-[54px] flex items-center justify-center rounded-2xl transition-all duration-300 shadow-xl relative overflow-hidden",
                   pathname === homeItem.href 
                     ? "bg-accent text-white shadow-accent/30" 
                     : "bg-white/40 backdrop-blur-md text-slate-500 border border-white/60 shadow-sm"
                 )}>
                   {/* Transparent border effect */}
                   <div className="absolute inset-0 rounded-2xl border-[1.5px] border-white/30 pointer-events-none" />
                   
                   {React.cloneElement(homeItem.icon as any, { 
                      size: 26,
                      strokeWidth: 2.5
                   })}
                 </div>
                 <span className={cn(
                   "text-[10px] font-bold transition-colors duration-300 tracking-tight mt-1",
                   pathname === homeItem.href ? "text-accent" : "text-slate-400"
                 )}>
                   {homeItem.label}
                 </span>
               </Link>
             )}

            <div className="flex-1 flex justify-around items-center h-full">
              {rightItems.map((item) => (
                <Link 
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center active:scale-90 transition-all group"
                >
                  <div className={cn(
                    "w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-300",
                    pathname === item.href ? "text-accent" : "text-slate-400 group-hover:text-slate-600"
                  )}>
                    {React.cloneElement(item.icon as any, { 
                      size: 20,
                      strokeWidth: 2
                    })}
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold transition-colors duration-300 tracking-tight",
                    pathname === item.href ? "text-accent" : "text-slate-400"
                  )}>
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>

          </div>
        </nav>
      )}
    </div>
  );
}
