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
    // Chỉ ẩn nếu explicitly set là false, mặc định (undefined/null) thì vẫn hiện
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
      {/* PC Sidebar - Hidden on mobile/iPad Pro Portrait, Stacked on iPad Pro Landscape (xl:flex), Full on Desktop (2xl:flex) */}
      <aside className={cn(
        "hidden xl:flex flex-col h-full bg-white/80 backdrop-blur-xl z-50 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "border-r border-slate-100/60 shadow-[4px_0_40px_rgba(0,0,0,0.02)]",
        "xl:w-24 2xl:w-80" // Increased 2xl width slightly for better spacing
      )}>
        <div className="p-6 2xl:p-10 flex justify-center 2xl:justify-start">
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-[18px] bg-slate-900 text-white flex items-center justify-center shadow-2xl shadow-slate-200 group transition-transform hover:scale-105 duration-500">
                <Building2 size={24} className="group-hover:animate-bounce-subtle" />
              </div>
              <div className="hidden 2xl:block overflow-hidden">
                <h1 className="text-xl font-black uppercase tracking-tighter text-slate-900 truncate leading-none">
                  {hotelName || 'Hệ thống'}
                </h1>
                <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em] mt-1.5 opacity-60">Smart Management</p>
              </div>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 px-3 2xl:px-6 space-y-3 2xl:space-y-1.5">
          {finalSidebarItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex transition-all duration-500 font-black group relative ease-[cubic-bezier(0.16,1,0.3,1)]",
                  isActive 
                    ? "text-slate-900" 
                    : item.isSpecial 
                      ? "text-emerald-500 hover:bg-emerald-50/50"
                      : "text-slate-400 hover:bg-slate-50/80 hover:text-slate-900",
                  // xl (iPad Pro Landscape): Stacked layout
                  // 2xl (Large Desktop): Row layout
                  "flex-col 2xl:flex-row items-center justify-center 2xl:justify-start gap-1 2xl:gap-4 py-3 2xl:py-4 rounded-2xl px-1 2xl:px-5",
                  isActive && "2xl:bg-white 2xl:shadow-[0_10px_30px_rgba(0,0,0,0.04)] 2xl:border 2xl:border-slate-100"
                )}
              >
                {/* Active Indicator Pill */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-blue-600 rounded-r-full hidden 2xl:block animate-in fade-in slide-in-from-left-2 duration-500" />
                )}

                <div className={cn(
                  "shrink-0 transition-all duration-500 group-hover:scale-110",
                  isActive ? "text-blue-600 scale-110" : "opacity-70 group-hover:opacity-100"
                )}>
                  {React.cloneElement(item.icon as any, { 
                    size: 24,
                    strokeWidth: isActive ? 3 : 2.5
                  })}
                </div>
                
                <span className={cn(
                  "truncate text-[9px] 2xl:text-[13px] text-center 2xl:text-left leading-tight uppercase tracking-widest 2xl:tracking-normal 2xl:capitalize font-black 2xl:font-bold",
                  "xl:block 2xl:inline",
                  isActive ? "opacity-100" : "opacity-60 group-hover:opacity-100"
                )}>
                  {item.label}
                </span>

                {/* Hover Background Dot for xl */}
                <div className={cn(
                  "absolute inset-0 bg-slate-100/50 rounded-2xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity 2xl:hidden",
                  isActive && "opacity-100 bg-blue-50"
                )} />
              </Link>
            );
          })}
        </nav>

        <div className="p-4 2xl:p-8 relative" ref={userMenuRef}>
          {showInstallBtn && (
            <button 
              onClick={handleInstallApp}
              className="flex flex-col 2xl:flex-row items-center gap-1 2xl:gap-4 p-3 2xl:p-4 w-full rounded-[24px] bg-emerald-50/50 text-emerald-600 hover:bg-emerald-100 transition-all mb-6 group animate-bounce-subtle justify-center 2xl:justify-start border border-emerald-100/50"
            >
              <div className="w-10 h-10 2xl:w-12 2xl:h-12 shrink-0 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-xl shadow-emerald-200 group-hover:rotate-12 transition-transform">
                <Download size={20} strokeWidth={3} />
              </div>
              <div className="2xl:block flex-1 text-center 2xl:text-left">
                <p className="text-[9px] 2xl:text-xs font-black uppercase tracking-widest leading-none">Cài đặt</p>
                <p className="hidden 2xl:block text-[10px] font-bold opacity-60 uppercase tracking-widest mt-1">App Tiện Ích</p>
              </div>
            </button>
          )}

          {isUserMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 2xl:left-6 2xl:right-6 mb-4 bg-white/90 backdrop-blur-2xl rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-white p-3 animate-in slide-in-from-bottom-4 fade-in duration-500 z-50 overflow-hidden">
              <div className="px-4 py-3 mb-2 border-b border-slate-50 2xl:block hidden">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Tài khoản</p>
                <p className="text-sm font-black text-slate-900 truncate mt-1">{user?.full_name}</p>
              </div>
              <button 
                onClick={() => {
                  setIsChangePinModalOpen(true);
                  setIsUserMenuOpen(false);
                }}
                className="w-full flex flex-col 2xl:flex-row items-center gap-1 2xl:gap-3 px-3 2xl:px-4 py-3 2xl:py-3.5 rounded-2xl hover:bg-slate-50 text-slate-600 font-black text-[10px] 2xl:text-xs transition-all text-center 2xl:text-left group"
              >
                <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                  <Key size={14} />
                </div>
                <span>Đổi mã PIN</span>
              </button>
              <button 
                onClick={logout}
                className="w-full flex flex-col 2xl:flex-row items-center gap-1 2xl:gap-3 px-3 2xl:px-4 py-3 2xl:py-3.5 rounded-2xl hover:bg-rose-50 text-rose-500 font-black text-[10px] 2xl:text-xs transition-all text-center 2xl:text-left group"
              >
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-400 flex items-center justify-center group-hover:bg-rose-500 group-hover:text-white transition-colors">
                  <LogOut size={14} />
                </div>
                <span>Đăng xuất</span>
              </button>
            </div>
          )}
          
          <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className={cn(
              "flex flex-col 2xl:flex-row items-center gap-1 2xl:gap-4 p-3 2xl:p-4 w-full rounded-[28px] transition-all group justify-center 2xl:justify-start relative",
              isUserMenuOpen ? "bg-slate-100/50" : "hover:bg-slate-50/50"
            )}
          >
            <div className="w-12 h-12 2xl:w-14 2xl:h-14 shrink-0 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-black text-lg 2xl:text-xl shadow-xl shadow-blue-100 group-hover:scale-105 transition-all duration-500">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="2xl:block flex-1 text-left truncate hidden">
              <p className="text-sm font-black text-slate-900 truncate leading-none">{user?.full_name}</p>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5">{user?.role}</p>
            </div>
            {/* Show name below avatar on xl if space permits or just avatar */}
            <span className="xl:block 2xl:hidden text-[9px] font-black text-slate-400 truncate max-w-full mt-1 uppercase tracking-tighter">
              {user?.full_name?.split(' ').pop()}
            </span>
            <ChevronUp size={16} className={cn("hidden 2xl:block text-slate-300 transition-transform duration-500", isUserMenuOpen && "rotate-180")} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-auto relative no-scrollbar bg-[#F4F7FA] pt-0 pb-[max(6rem,env(safe-area-inset-bottom))] xl:pb-0">
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


      {/* Mobile Bottom Nav - Show on mobile and iPad Pro Portrait (xl:hidden) */}
      {mounted && (
        <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-50 h-[85px] flex items-end px-4 pb-4">
          <div className="relative w-full h-[68px] flex items-center justify-between px-2 bg-white/80 backdrop-blur-2xl rounded-[32px] shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-white/40">
            
            <div className="flex-1 flex justify-around items-center h-full">
              {leftItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link 
                    key={item.href}
                    href={item.href}
                    className="flex flex-col items-center justify-center active:scale-90 transition-all group relative px-2"
                  >
                    <div className={cn(
                      "w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-500",
                      isActive ? "text-blue-600 bg-blue-50/50" : "text-slate-400 group-hover:text-slate-600"
                    )}>
                      {React.cloneElement(item.icon as any, { 
                        size: 22,
                        strokeWidth: isActive ? 3 : 2.5
                      })}
                    </div>
                    {isActive && (
                      <div className="absolute -bottom-1 w-1 h-1 bg-blue-600 rounded-full animate-in zoom-in duration-500" />
                    )}
                  </Link>
                );
              })}
            </div>

            {homeItem && (
               <Link 
                 href={homeItem.href}
                 className="flex flex-col items-center justify-center active:scale-95 transition-all group px-2 relative -top-6"
               >
                 <div className={cn(
                   "w-[64px] h-[64px] flex items-center justify-center rounded-[24px] transition-all duration-500 shadow-2xl relative overflow-hidden",
                   pathname === homeItem.href 
                     ? "bg-slate-900 text-white shadow-slate-200" 
                     : "bg-white text-slate-500 border border-slate-100 shadow-lg shadow-slate-100"
                 )}>
                   {/* Shine effect */}
                   <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
                   
                   {React.cloneElement(homeItem.icon as any, { 
                      size: 28,
                      strokeWidth: 3
                   })}
                 </div>
                 <div className={cn(
                    "mt-2 px-3 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all duration-500",
                    pathname === homeItem.href ? "bg-slate-900 text-white" : "bg-white text-slate-400 border border-slate-100"
                 )}>
                    {homeItem.label}
                 </div>
               </Link>
             )}

            <div className="flex-1 flex justify-around items-center h-full">
              {rightItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link 
                    key={item.href}
                    href={item.href}
                    className="flex flex-col items-center justify-center active:scale-90 transition-all group relative px-2"
                  >
                    <div className={cn(
                      "w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-500",
                      isActive ? "text-blue-600 bg-blue-50/50" : "text-slate-400 group-hover:text-slate-600"
                    )}>
                      {React.cloneElement(item.icon as any, { 
                        size: 22,
                        strokeWidth: isActive ? 3 : 2.5
                      })}
                    </div>
                    {isActive && (
                      <div className="absolute -bottom-1 w-1 h-1 bg-blue-600 rounded-full animate-in zoom-in duration-500" />
                    )}
                  </Link>
                );
              })}
            </div>

          </div>
        </nav>
      )}
    </div>
  );
}
