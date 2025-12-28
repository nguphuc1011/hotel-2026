'use client'; 
 
 import Link from 'next/link'; 
 import { usePathname } from 'next/navigation'; 
 import { cn } from '@/lib/utils'; 
 import { LayoutGrid, Settings, BarChart3, WalletCards } from 'lucide-react'; 
 
 const navLinks = [ 
   { href: '/reports', label: 'BÁO CÁO', icon: BarChart3 }, 
   { href: '/finance', label: 'THU CHI', icon: WalletCards }, 
   { href: '/', label: 'SƠ ĐỒ', icon: LayoutGrid }, 
   { href: '/settings', label: 'CÀI ĐẶT', icon: Settings }, 
 ]; 
 
 export function BottomNav() { 
  const pathname = usePathname(); 

  return ( 
    <nav className="fixed bottom-0 left-0 right-0 z-[100] h-24 flex items-end justify-center pointer-events-none pb-safe"> 
      <div className="relative w-full max-w-md h-20 pointer-events-auto"> 
        {/* Solid White Background with Notch - Subtle Top Shadow */} 
        <div className="absolute inset-0 overflow-hidden"> 
          <svg 
            width="100%" 
            height="100%" 
            viewBox="0 0 400 80" 
            preserveAspectRatio="none" 
            className="text-white drop-shadow-[0_-2px_8px_rgba(0,0,0,0.04)]" 
          > 
            <path 
              d="M0 80 L0 20 L140 20 C160 20 165 70 200 70 S240 20 260 20 L400 20 L400 80 Z" 
              fill="currentColor" 
            /> 
          </svg> 
        </div> 

        {/* Navigation Items */} 
        <div className="relative h-full flex items-center px-6 pt-4"> 
          {navLinks.map((link, index) => { 
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href)); 
            const Icon = link.icon; 

            // Center Item (Floating Button with Glassmorphism) 
            if (index === 2) { 
              return ( 
                <div key={link.href} className="flex-1 flex justify-center -mt-12"> 
                  <Link 
                    href={link.href} 
                    className={cn( 
                      "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-[0_8px_20px_rgba(0,0,0,0.15)] backdrop-blur-xl", 
                      isActive 
                        ? "bg-slate-900/90 text-white" 
                        : "bg-white/60 text-slate-600 border-[0.5px] border-white/40" 
                    )} 
                  > 
                    <Icon className="h-8 w-8" /> 
                  </Link> 
                </div> 
              ); 
            } 

            // Side Items 
            return ( 
              <Link 
                key={link.href} 
                href={link.href} 
                className="flex-1 flex flex-col items-center justify-center gap-1 group" 
              > 
                <div className={cn( 
                  "transition-all duration-300 mb-0.5", 
                  isActive ? "text-slate-900 scale-110" : "text-slate-400 group-hover:text-slate-600" 
                )}> 
                  <Icon className="h-6 w-6" /> 
                </div> 
                <span className={cn( 
                  "text-[11px] font-bold tracking-tight transition-colors", 
                  isActive ? "text-slate-900" : "text-zinc-500" 
                )}> 
                  {link.label} 
                </span> 
              </Link> 
            ); 
          })} 
        </div> 
      </div> 
    </nav> 
  ); 
}
