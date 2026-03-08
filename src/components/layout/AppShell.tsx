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
  Download
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
  
  // Priority: 1. URL Slug, 2. User Profile Slug, 3. Default
  const slug = (params?.slug as string) || user?.hotel_slug || 'default';
  
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
    // 1. Kiểm tra iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    setIsIOS(isIOSDevice && !isStandalone);

    // 2. Kiểm tra nếu có sẵn lời mời cài đặt trong biến global
    if ((window as any).deferredPWAInstallPrompt) {
      setShowInstallBtn(true);
    }

    const handlePWAAvailable = () => {
      setShowInstallBtn(true);
    };

    window.addEventListener('pwa-install-available', handlePWAAvailable);
    return () => window.removeEventListener('pwa-install-available', handlePWAAvailable);
  }, []);

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


  // Don't show shell on login page or SaaS Admin
  if (pathname === `/${slug}/login` || pathname === '/login' || pathname.startsWith('/saas-admin')) {
    return <>{children}</>;
  }

  const navItems = [
    { icon: <LayoutDashboard size={24} />, label: 'Sơ đồ', href: `/${slug}`, permission: PERMISSION_KEYS.VIEW_DASHBOARD },
    { icon: <Banknote size={24} />, label: 'Thu Chi', href: `/${slug}/tien`, permission: PERMISSION_KEYS.VIEW_MONEY },
    { icon: <Users size={24} />, label: 'Khách hàng', href: `/${slug}/customers` },
    { icon: <ClipboardList size={24} />, label: 'Báo cáo', href: `/${slug}/reports`, permission: PERMISSION_KEYS.VIEW_REPORTS },
    { icon: <SettingsIcon size={24} />, label: 'Cài đặt', href: `/${slug}/settings`, permission: PERMISSION_KEYS.VIEW_SETTINGS },
  ];

  // SaaS Admin Link (Only for authorized users)
  const saasAdminItem = user?.hotels?.features?.saas_admin_access ? {
    icon: <ShieldCheck size={24} />,
    label: 'Quản trị SaaS',
    href: '/saas-admin',
    isSpecial: true
  } : null;

  // Feature Toggle Check
  const filteredNavItems = navItems.filter(item => {
    if (item.href.endsWith('/reports') && user?.hotels?.features?.advanced_reports === false) {
      return false;
    }
    return true;
  });

  const visibleNavItems = filteredNavItems.filter(item => !item.permission || can(item.permission));

  // Combined Items for sidebar
  const finalSidebarItems = [...visibleNavItems];
  if (saasAdminItem) finalSidebarItems.push(saasAdminItem);

  const homeItem = visibleNavItems.find(i => i.href === `/${slug}`) || visibleNavItems[0];
  const mobileItems = visibleNavItems.filter(i => i.href !== homeItem?.href).slice(0, 4);
  const leftItems = mobileItems.slice(0, Math.ceil(mobileItems.length / 2));
  const rightItems = mobileItems.slice(Math.ceil(mobileItems.length / 2));

  return (
    <>
      <WalletNotificationModal />
      {/* PC Sidebar - Airy Glassmorphism */}
      <aside className="hidden md:flex flex-col w-72 h-screen glass border-r border-white/40 z-50">
        <div className="p-10">
          <div className="flex flex-col">
            <h1 className="text-2xl font-black-italic tracking-tighter flex items-center gap-2 text-accent">
              MANA PMS
            </h1>
            {hotelName && (
              <span className="text-xs font-bold text-slate-500 truncate max-w-[200px] mt-1 uppercase tracking-wider">
                {hotelName}
              </span>
            )}
          </div>
        </div>
        
        <nav className="flex-1 px-6 space-y-2">
          {finalSidebarItems.map((item) => (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-500 font-bold text-[15px]",
                pathname === item.href 
                  ? "bg-accent text-white shadow-xl shadow-accent/20 scale-[1.02]" 
                  : (item as any).isSpecial 
                    ? "text-emerald-500 hover:bg-emerald-50 bg-emerald-50/50"
                    : "text-muted hover:bg-accent/5 hover:text-accent"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-6 border-t border-white/20 relative" ref={userMenuRef}>
          {/* PWA Install Button (Android/Chrome) */}
          {showInstallBtn && (
            <button 
              onClick={handleInstallApp}
              className="flex items-center gap-3 p-3 w-full rounded-2xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all mb-4 group animate-bounce-subtle"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-200 group-hover:scale-105 transition-transform">
                <Download size={20} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-black uppercase tracking-tight">Cài đặt App</p>
                <p className="text-[10px] font-bold opacity-70 uppercase tracking-wider">Trải nghiệm tốt hơn</p>
              </div>
            </button>
          )}

          {/* iOS Install Guide */}
          {isIOS && (
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 mb-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone size={16} className="text-blue-500" />
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Cài đặt trên iPhone</p>
              </div>
              <p className="text-[10px] font-bold text-slate-500 leading-relaxed">
                Nhấn nút <span className="text-blue-600 font-black">Chia sẻ</span> bên dưới trình duyệt và chọn <span className="text-blue-600 font-black">Thêm vào MH chính</span>.
              </p>
            </div>
          )}

          {isUserMenuOpen && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
              <button 
                onClick={() => {
                  setIsChangePinModalOpen(true);
                  setIsUserMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 text-main font-bold text-sm transition-colors text-left"
              >
                <Key size={16} className="text-muted" />
                Đổi mã PIN
              </button>
              <div className="h-px bg-gray-100 my-1" />
              <button 
                onClick={logout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-rose-50 text-rose-500 font-bold text-sm transition-colors text-left"
              >
                <LogOut size={16} />
                Đăng xuất
              </button>
            </div>
          )}
          
          <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-3 p-3 w-full rounded-2xl hover:bg-white/40 transition-all group"
          >
            <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-black text-lg shadow-lg shadow-accent/20 group-hover:scale-105 transition-transform">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-black text-main truncate">{user?.full_name}</p>
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">{user?.role}</p>
            </div>
            <ChevronUp size={16} className={`text-muted transition-transform duration-300 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-auto relative no-scrollbar bg-white/40 pb-[max(8rem,env(safe-area-inset-bottom))] md:pb-0">
        <div className="animate-fade-in">
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


      {/* Contrast Overlay under Mobile Nav - Subtle Blur Gradient */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white/90 via-white/50 to-transparent pointer-events-none z-40" />

      {/* Mobile Bottom Nav - Curved Cutout with Floating Center Button */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-24 pointer-events-none flex flex-col justify-end">
        
        {/* Main Bar Background with SVG Curve */}
        <div className="relative w-full h-[70px] pointer-events-auto flex items-end justify-between px-4 pb-2">
          
          {/* Background Layer using SVG for smooth curve */}
          <div className="absolute inset-0 flex items-end drop-shadow-[0_-15px_25px_rgba(0,0,0,0.15)] -z-10">
            <div className="flex-1 h-full bg-white rounded-tl-[24px]" />
            <svg width="170" height="70" viewBox="0 0 170 70" fill="none" xmlns="http://www.w3.org/2000/svg" className="block shrink-0">
              <path d="M 0 0 H 35 Q 45 0 45 10 A 40 40 0 0 0 125 10 Q 125 0 135 0 H 170 V 70 H 0 Z" fill="white"/>
            </svg>
            <div className="flex-1 h-full bg-white rounded-tr-[24px]" />
          </div>

          {/* Left Items */}
          <div className="flex-1 flex justify-evenly items-center h-full pb-1">
            {leftItems.map((item) => (
              <Link 
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center active:scale-95 transition-transform"
              >
                <div className={cn(
                  "p-2 rounded-2xl transition-all duration-300",
                  pathname === item.href ? "text-[#007AFF]" : "text-slate-400"
                )}>
                  {React.cloneElement(item.icon as any, { 
                    size: 24,
                    strokeWidth: pathname === item.href ? 2.5 : 2 
                  })}
                </div>
                <span className={cn(
                  "text-[10px] font-bold transition-colors duration-300",
                  pathname === item.href ? "text-[#007AFF]" : "text-slate-400"
                )}>
                  {item.label}
                </span>
              </Link>
            ))}
          </div>

          {/* Spacer for Center Button */}
          <div className="w-20" /> 

          {/* Right Items */}
          <div className="flex-1 flex justify-evenly items-center h-full pb-1">
            {rightItems.map((item) => (
              <Link 
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center active:scale-95 transition-transform"
              >
                <div className={cn(
                  "p-2 rounded-2xl transition-all duration-300",
                  pathname === item.href ? "text-[#007AFF]" : "text-slate-400"
                )}>
                  {React.cloneElement(item.icon as any, { 
                    size: 24,
                    strokeWidth: pathname === item.href ? 2.5 : 2 
                  })}
                </div>
                <span className={cn(
                  "text-[10px] font-bold transition-colors duration-300",
                  pathname === item.href ? "text-[#007AFF]" : "text-slate-400"
                )}>
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Center Floating Button (Sơ đồ) - Positioned in the cutout */}
        <div className="absolute bottom-[25px] left-1/2 -translate-x-1/2 pointer-events-auto">
           {homeItem && (
             <Link 
               href={homeItem.href}
               className={cn(
                 "flex items-center justify-center w-[64px] h-[64px] rounded-full shadow-[0_8px_20px_rgba(0,122,255,0.3)] transition-all duration-300 active:scale-95 group",
                 pathname === homeItem.href 
                   ? "bg-[#007AFF] text-white" 
                   : "bg-white text-slate-400 border border-slate-100"
               )}
             >
               {React.cloneElement(homeItem.icon as any, { 
                  size: 28,
                  strokeWidth: 2.5,
                  className: "group-hover:scale-110 transition-transform"
               })}
             </Link>
           )}
        </div>
      </nav>
    </>
  );
}
