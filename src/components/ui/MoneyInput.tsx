
import { cn } from '@/lib/utils';
import { useRef } from 'react';

interface MoneyInputProps {
  value: number;
  onChange: (val: number) => void;
  label?: string;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  centered?: boolean;
}

export function MoneyInput({ value, onChange, label, className, inputClassName, placeholder = "0", centered }: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const shortValue = Math.floor(value / 1000);
  const displayValue = shortValue === 0 ? '' : new Intl.NumberFormat('vi-VN').format(shortValue);
  
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && <label className="text-[14px] font-medium text-gray-500">{label}</label>}
      <div 
        onClick={() => inputRef.current?.focus()}
        className={cn(
            "relative flex items-center bg-transparent rounded-xl focus-within:ring-0 transition-all w-full cursor-text",
            centered && "justify-center"
        )}
      >
        <div className="flex items-center">
            <input 
              ref={inputRef}
              type="text" 
              value={displayValue} 
              placeholder={placeholder}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, '');
                const num = parseInt(raw) || 0;
                onChange(num * 1000);
              }}
              className={cn(
                "font-bold text-[17px] bg-transparent focus:outline-none text-[#1D1D1F] p-0 tabular-nums",
                inputClassName
              )}
              style={{ width: `${Math.max(1, displayValue.length)}ch` }}
            />
            {displayValue && (
                <span className={cn(
                    "font-bold text-[17px] text-[#1D1D1F] select-none pointer-events-none tabular-nums",
                    inputClassName
                )}>.000</span>
            )}
        </div>
      </div>
    </div>
  );
}
