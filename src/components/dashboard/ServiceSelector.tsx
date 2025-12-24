'''
'use client';
import { Service } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { MinusCircle, PlusCircle } from 'lucide-react';

interface ServiceSelectorProps {
  services: Service[];
  selectedServices: { id: string; name: string; price: number; quantity: number }[];
  onSelectionChange: (services: { id: string; name: string; price: number; quantity: number }[]) => void;
}

export function ServiceSelector({ services, selectedServices, onSelectionChange }: ServiceSelectorProps) {

  const handleServiceChange = (service: Service, change: 1 | -1) => {
    const existingService = selectedServices.find(s => s.id === service.id);
    const currentQty = existingService?.quantity || 0;
    const newQty = currentQty + change;

    if (newQty <= 0) {
      onSelectionChange(selectedServices.filter(s => s.id !== service.id));
    } else {
      if (existingService) {
        onSelectionChange(selectedServices.map(s => s.id === service.id ? { ...s, quantity: newQty } : s));
      } else {
        onSelectionChange([...selectedServices, { ...service, quantity: 1 }]);
      }
    }
  };

  return (
    <ScrollArea className="h-96 rounded-md border p-4">
      <div className="space-y-4">
        {services.map(service => {
          const selected = selectedServices.find(s => s.id === service.id);
          const quantity = selected?.quantity || 0;

          return (
            <div key={service.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{service.name}</p>
                <p className="text-sm text-slate-500">{formatCurrency(service.price)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleServiceChange(service, -1)} disabled={quantity === 0}>
                  <MinusCircle size={14} />
                </Button>
                <span className="w-6 text-center font-bold text-base">{quantity}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleServiceChange(service, 1)}>
                  <PlusCircle size={14} />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
'''
