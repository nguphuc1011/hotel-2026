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
        "hidden xl:flex flex-col h-full bg-white z-50 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "border-r border-slate-200/60 shadow-[8px_0_40px_rgba(0,0,0,0.01)]",
        "xl:w-24 2xl:w-72" 
      )}>
        {/* Branding Area: HERA Logo at Top, Hotel Name Below (Centered) */}
        <div className="p-4 2xl:p-10 flex flex-col items-center border-b border-slate-50/50 mb-4 bg-slate-50/30 gap-6">
          {/* Logo Container - Rectangular Logo from File (Top) */}
          <div className="relative shrink-0 w-full flex justify-center">
            <div className="w-16 h-8 2xl:w-52 2xl:h-20 rounded-xl 2xl:rounded-2xl overflow-hidden shadow-xl shadow-slate-100 transition-all duration-500 hover:scale-[1.02] border border-slate-100 bg-white flex items-center justify-center p-1.5 2xl:p-2.5">
              <img 
                src="/logo-hera.png" 
                alt="HERA Logo" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=HERA&background=0f172a&color=fff&bold=true&length=4';
                }}
              />
            </div>
          </div>

          {/* Hotel Name Area (Below) - Centered */}
          <div className="hidden 2xl:flex flex-col items-center w-full text-center">
            <h1 className="text-xl font-black tracking-tight text-slate-900 leading-tight">
              {hotelName || 'Hệ thống'}
            </h1>
            <div className="flex items-center justify-center gap-2 mt-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)] animate-pulse"></div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] truncate">
                Smart Management
              </p>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 px-3 2xl:px-4 space-y-2 2xl:space-y-1">
          {finalSidebarItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex transition-all duration-300 font-bold group relative ease-[cubic-bezier(0.16,1,0.3,1)]",
                  isActive 
                    ? "text-blue-600 bg-blue-50/50" 
                    : item.isSpecial 
                      ? "text-emerald-600 hover:bg-emerald-50"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                  "flex-col 2xl:flex-row items-center justify-center 2xl:justify-start gap-1 2xl:gap-3.5 py-3 2xl:py-3.5 rounded-2xl px-1 2xl:px-4",
                )}
              >
                {/* Active Indicator Pill */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-r-full hidden 2xl:block animate-in fade-in slide-in-from-left-2 duration-500" />
                )}

                <div className={cn(
                  "shrink-0 transition-all duration-300 group-hover:scale-110",
                  isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"
                )}>
                  {React.cloneElement(item.icon as any, { 
                    size: 22,
                    strokeWidth: isActive ? 2.5 : 2
                  })}
                </div>
                
                <span className={cn(
                  "truncate text-[10px] 2xl:text-sm text-center 2xl:text-left leading-tight font-bold",
                  "xl:block 2xl:inline",
                  isActive ? "text-blue-600" : "text-slate-500 group-hover:text-slate-900"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 2xl:p-6 relative border-t border-slate-50" ref={userMenuRef}>
          {showInstallBtn && (
            <button 
              onClick={handleInstallApp}
              className="flex flex-col 2xl:flex-row items-center gap-1 2xl:gap-3 p-2.5 2xl:p-3 w-full rounded-2xl bg-slate-900 text-white hover:bg-slate-800 transition-all mb-4 group justify-center 2xl:justify-start border border-slate-800/50 shadow-lg shadow-slate-200"
            >
              <div className="w-8 h-8 2xl:w-9 2xl:h-9 shrink-0 rounded-xl bg-white/10 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                <Download size={16} strokeWidth={3} />
              </div>
              <div className="2xl:block flex-1 text-center 2xl:text-left">
                <p className="text-[9px] 2xl:text-[11px] font-black uppercase tracking-widest leading-none">HERA APP</p>
                <p className="hidden 2xl:block text-[9px] font-bold opacity-60 uppercase tracking-widest mt-1">Hệ thống quản lý</p>
              </div>
            </button>
          )}

          {isUserMenuOpen && (
            <div className="absolute bottom-full left-2 right-2 2xl:left-4 2xl:right-4 mb-3 bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-slate-100 p-2 animate-in slide-in-from-bottom-2 fade-in duration-300 z-50 overflow-hidden">
              <div className="px-3 py-2 mb-1 border-b border-slate-50 2xl:block hidden">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1.5">Tài khoản</p>
                <p className="text-xs font-black text-slate-900 truncate">{user?.full_name}</p>
              </div>
              <button 
                onClick={() => {
                  setIsChangePinModalOpen(true);
                  setIsUserMenuOpen(false);
                }}
                className="w-full flex flex-col 2xl:flex-row items-center gap-1 2xl:gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 text-slate-600 font-bold text-[10px] 2xl:text-xs transition-all text-center 2xl:text-left group"
              >
                <Key size={14} className="text-slate-400 group-hover:text-blue-500" />
                <span>Mã PIN</span>
              </button>
              <button 
                onClick={logout}
                className="w-full flex flex-col 2xl:flex-row items-center gap-1 2xl:gap-3 px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-500 font-bold text-[10px] 2xl:text-xs transition-all text-center 2xl:text-left group"
              >
                <LogOut size={14} />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}
          
          <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className={cn(
              "flex flex-col 2xl:flex-row items-center gap-1 2xl:gap-3 p-2 2xl:p-3 w-full rounded-2xl transition-all group justify-center 2xl:justify-start relative",
              isUserMenuOpen ? "bg-slate-50" : "hover:bg-slate-50/80"
            )}
          >
            <div className="w-10 h-10 2xl:w-11 2xl:h-11 shrink-0 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm 2xl:text-base shadow-lg shadow-slate-200 group-hover:scale-105 transition-all duration-300">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="2xl:block flex-1 text-left truncate hidden">
              <p className="text-sm font-bold text-slate-900 truncate leading-none">{user?.full_name}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">{user?.role}</p>
            </div>
            {/* Show name below avatar on xl if space permits or just avatar */}
            <span className="xl:block 2xl:hidden text-[9px] font-bold text-slate-500 truncate max-w-full mt-1 uppercase tracking-tighter">
              {user?.full_name?.split(' ').pop()}
            </span>
            <ChevronUp size={14} className={cn("hidden 2xl:block text-slate-300 transition-transform duration-300", isUserMenuOpen && "rotate-180")} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-auto relative no-scrollbar bg-[#F5F5F7] pt-0 pb-[max(6rem,env(safe-area-inset-bottom))] xl:pb-0">
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
        <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-50 h-[80px] flex items-end px-4 pb-4">
          <div className="relative w-full h-[64px] flex items-center justify-between px-2 bg-white rounded-[28px] shadow-[0_8px_32px_rgba(0,0,0,0.08)] border border-slate-100">
            
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
                      "w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-300",
                      isActive ? "text-blue-600 bg-blue-50" : "text-slate-400 group-hover:text-slate-600"
                    )}>
                      {React.cloneElement(item.icon as any, { 
                        size: 22,
                        strokeWidth: isActive ? 2.5 : 2
                      })}
                    </div>
                  </Link>
                );
              })}
            </div>

            {homeItem && (
               <Link 
                 href={homeItem.href}
                 className="flex flex-col items-center justify-center active:scale-95 transition-all group px-2 relative -top-5"
               >
                 <div className={cn(
                   "w-[58px] h-[58px] flex items-center justify-center rounded-[20px] transition-all duration-300 shadow-xl relative overflow-hidden",
                   pathname === homeItem.href 
                     ? "bg-slate-900 text-white shadow-slate-200" 
                     : "bg-white text-slate-500 border border-slate-100 shadow-lg shadow-slate-100"
                 )}>
                   {React.cloneElement(homeItem.icon as any, { 
                      size: 26,
                      strokeWidth: 2.5
                   })}
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
                      "w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-300",
                      isActive ? "text-blue-600 bg-blue-50" : "text-slate-400 group-hover:text-slate-600"
                    )}>
                      {React.cloneElement(item.icon as any, { 
                        size: 22,
                        strokeWidth: isActive ? 2.5 : 2
                      })}
                    </div>
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
