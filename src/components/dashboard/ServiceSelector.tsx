'use client';

import { Service } from '@/types';
import {
  Plus,
  Trash2,
  Coffee,
  Beer,
  Wine,
  Cigarette,
  UtensilsCrossed,
  Car,
  Shirt,
  Briefcase,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatCurrency } from '@/lib/utils';

interface ServiceSelectorProps {
  services: Service[];
  selectedServices: any[];
  onChange: (services: any[]) => void;
}

export function ServiceSelector({ services, selectedServices, onChange }: ServiceSelectorProps) {
  const handleAddService = (service: Service) => {
    const existing = selectedServices.find((s) => s.id === service.id);
    if (existing) {
      onChange(
        selectedServices.map((s) => (s.id === service.id ? { ...s, quantity: s.quantity + 1 } : s))
      );
    } else {
      onChange([...selectedServices, { ...service, quantity: 1 }]);
    }
  };

  const handleRemoveOne = (serviceId: any) => {
    const existing = selectedServices.find((s) => s.id === serviceId);
    if (existing) {
      if (existing.quantity > 1) {
        onChange(
          selectedServices.map((s) => (s.id === serviceId ? { ...s, quantity: s.quantity - 1 } : s))
        );
      } else {
        onChange(selectedServices.filter((s) => s.id !== serviceId));
      }
    }
  };

  // Icon mapping for common services
  const getIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('nước') || lowerName.includes('suối') || lowerName.includes('water'))
      return <Coffee size={24} strokeWidth={2.5} />;
    if (lowerName.includes('bia') || lowerName.includes('tiger') || lowerName.includes('beer'))
      return <Beer size={24} strokeWidth={2.5} />;
    if (lowerName.includes('rượu') || lowerName.includes('wine'))
      return <Wine size={24} strokeWidth={2.5} />;
    if (lowerName.includes('thuốc lá') || lowerName.includes('cigarette'))
      return <Cigarette size={24} strokeWidth={2.5} />;
    if (lowerName.includes('mì') || lowerName.includes('snack') || lowerName.includes('ăn'))
      return <UtensilsCrossed size={24} strokeWidth={2.5} />;
    if (lowerName.includes('xe')) return <Car size={24} strokeWidth={2.5} />;
    if (lowerName.includes('giặt')) return <Shirt size={24} strokeWidth={2.5} />;
    return <Briefcase size={24} strokeWidth={2.5} />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">
          Dịch vụ đi kèm
        </h3>
        {selectedServices.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 bg-blue-600 px-3 py-1.5 rounded-full shadow-lg shadow-blue-200"
          >
            <span className="text-[10px] font-black text-white uppercase tracking-wider border-r border-white/20 pr-2">
              {selectedServices.reduce((sum, s) => sum + s.quantity, 0)} món
            </span>
            <span className="text-[11px] font-black text-white">
              {formatCurrency(selectedServices.reduce((sum, s) => sum + s.price * s.quantity, 0))}đ
            </span>
          </motion.div>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-10 pt-4 -mx-6 px-6 scrollbar-hide snap-x snap-mandatory">
        {services.map((service) => {
          const selected = selectedServices.find((s) => s.id === service.id);
          const quantity = selected?.quantity || 0;

          return (
            <motion.div
              key={service.id}
              className="relative flex-shrink-0 w-[160px] snap-start"
              whileHover={{ y: -8 }}
              whileTap={{ scale: 0.95 }}
            >
              <button
                onClick={() => handleAddService(service)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  handleRemoveOne(service.id);
                }}
                className={cn(
                  'w-full flex flex-col items-center text-center gap-4 p-6 rounded-[2.5rem] transition-all duration-500 border-2 relative group',
                  quantity > 0
                    ? 'bg-white border-blue-500 shadow-2xl shadow-blue-100/60'
                    : 'bg-white/40 border-transparent hover:border-zinc-200 hover:bg-white shadow-sm'
                )}
              >
                {/* Glossy Background for Selected */}
                {quantity > 0 && (
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent pointer-events-none rounded-[2.5rem] overflow-hidden" />
                )}

                <div
                  className={cn(
                    'p-5 rounded-[1.5rem] transition-all duration-700 shadow-sm',
                    quantity > 0
                      ? 'bg-blue-600 text-white rotate-[12deg] scale-110 shadow-lg shadow-blue-200'
                      : 'bg-zinc-100 text-zinc-400 group-hover:bg-zinc-200 group-hover:text-zinc-600'
                  )}
                >
                  {getIcon(service.name)}
                </div>

                <div className="space-y-1.5 w-full relative z-10">
                  <p
                    className={cn(
                      'text-sm font-black transition-colors truncate',
                      quantity > 0 ? 'text-zinc-900' : 'text-zinc-500'
                    )}
                  >
                    {service.name}
                  </p>
                  <p
                    className={cn(
                      'text-[11px] font-bold',
                      quantity > 0 ? 'text-blue-600' : 'text-zinc-400'
                    )}
                  >
                    {formatCurrency(service.price)}đ
                  </p>
                </div>

                {/* Apple Style Quantity Badge */}
                <AnimatePresence>
                  {quantity > 0 && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0, y: 10 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0, opacity: 0, y: 10 }}
                      className="absolute top-3 right-3 z-20"
                    >
                      <div className="min-w-[28px] h-[28px] px-2 bg-zinc-900 text-white text-[11px] font-black rounded-full shadow-lg flex items-center justify-center gap-1 border border-white/20">
                        {quantity}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </motion.div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4 py-2 opacity-40">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-zinc-200 flex items-center justify-center text-zinc-500">
            <Plus size={10} strokeWidth={3} />
          </div>
          <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
            Chạm để thêm
          </span>
        </div>
        <div className="w-1 h-1 rounded-full bg-zinc-300" />
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-lg bg-zinc-200 flex items-center justify-center text-zinc-500">
            <Trash2 size={10} strokeWidth={3} />
          </div>
          <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
            Giữ để bớt
          </span>
        </div>
      </div>
    </div>
  );
}
