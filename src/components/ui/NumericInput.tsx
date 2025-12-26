'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  suffix?: string;
}

export function NumericInput({ 
  value, 
  onChange, 
  className, 
  placeholder, 
  suffix,
  ...props 
}: NumericInputProps) {
  const [displayValue, setDisplayValue] = useState('');

  // Format number to string with dots (vi-VN)
  const format = (val: number | string) => {
    const num = typeof val === 'string' ? parseInt(val.replace(/\D/g, ''), 10) : val;
    if (isNaN(num) || num === 0) return '';
    return new Intl.NumberFormat('vi-VN').format(num);
  };

  useEffect(() => {
    setDisplayValue(format(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    const numValue = rawValue === '' ? 0 : parseInt(rawValue, 10);
    
    // Update display immediately for better UX
    setDisplayValue(format(numValue));
    
    // Notify parent
    onChange(numValue);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Select all text on focus to make it easy to overwrite
    e.target.select();
  };

  return (
    <div className="relative w-full">
      <input
        {...props}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        placeholder={placeholder || '0'}
        className={cn(
          "w-full h-12 bg-slate-50 rounded-xl px-4 outline-none border border-transparent focus:border-blue-500 font-bold transition-all",
          className
        )}
      />
      {suffix && (
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}
