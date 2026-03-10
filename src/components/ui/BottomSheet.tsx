'use client';

import React, { useEffect, useState } from 'react';
import { Drawer } from 'vaul';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
  showHandle?: boolean;
  maxHeight?: string; // e.g. "90vh"
  maxWidth?: string; // PC width, e.g. "600px"
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  description,
  showHandle = true,
  maxHeight = "96vh",
  maxWidth = "640px"
}: BottomSheetProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (!isMobile) {
    // 🖥️ PC VERSION: Center Modal
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200" 
          onClick={onClose}
        />
        <div 
          className="relative bg-white w-full rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 fade-in duration-300 z-[101]"
          style={{ maxWidth, maxHeight: "90vh" }}
        >
          {/* PC Content - Header is handled by children if needed */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
            {children}
          </div>
        </div>
      </div>
    );
  }

  // 📱 MOBILE VERSION: Bottom Sheet
  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100]" />
        <Drawer.Content 
          className={cn(
            "bg-white flex flex-col rounded-t-[32px] fixed bottom-0 left-0 right-0 z-[101] outline-none",
            "max-h-[var(--max-height)]"
          )}
          style={{ "--max-height": maxHeight } as React.CSSProperties}
        >
          <div className="flex-1 bg-white rounded-t-[32px] overflow-hidden flex flex-col">
            {showHandle && (
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 my-4" />
            )}
            
            {/* Ẩn Title để Radix UI không báo lỗi Accessibility (SR-only) */}
            <Drawer.Title className="sr-only">
              {title || "Modal Content"}
            </Drawer.Title>
            {description && <Drawer.Description className="sr-only">{description}</Drawer.Description>}
            
            {/* Mobile Header - Optional, handled by children if needed */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {children}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
