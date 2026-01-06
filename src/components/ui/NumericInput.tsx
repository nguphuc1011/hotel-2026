'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface NumericInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value'
> {
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
  // Format number to string with dots (vi-VN)
  const format = (val: number | string) => {
    const num = typeof val === 'string' ? parseInt(val.replace(/\D/g, ''), 10) : val;
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('vi-VN').format(num);
  };

  const displayValue = format(value);
  // Hiển thị ghost zeros nếu giá trị > 0 và < 1000, hoặc nếu giá trị bằng 0 (chưa gõ)
  const showGhostZeros = value < 1000;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    const numValue = rawValue === '' ? 0 : parseInt(rawValue, 10);
    onChange(numValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // If user presses 'k' or 'K', multiply by 1000
    if (e.key.toLowerCase() === 'k') {
      e.preventDefault();
      onChange(value * 1000);
    }
    // Tab key handling: If user has ghost zeros and presses Tab, commit them
    if (e.key === 'Tab' && showGhostZeros && value > 0) {
      // We don't preventDefault so focus still moves, but we update the value
      onChange(value * 1000);
    }
    // If user presses Enter and value is < 1000 and > 0, auto-multiply by 1000
    if (e.key === 'Enter' && value > 0 && value < 1000) {
      onChange(value * 1000);
    }
  };

  const handleBlur = () => {
    // When leaving the field, if value is > 0 and < 1000, auto-multiply by 1000
    if (value > 0 && value < 1000) {
      onChange(value * 1000);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Select all text on focus to make it easy to overwrite
    e.target.select();
  };

  const alignmentClass =
    className?.includes('text-right') || className?.includes('text-end')
      ? 'text-right'
      : className?.includes('text-center')
        ? 'text-center'
        : 'text-left';

  // Extract font size and weight classes to apply to ghost text
  const fontClasses =
    className
      ?.split(' ')
      .filter((c) => c.startsWith('text-') || c.startsWith('font-') || c.startsWith('tracking-'))
      .join(' ') || '';

  return (
    <div className="relative w-full group">
      <div className="relative flex items-center bg-slate-50 rounded-xl border border-transparent focus-within:border-blue-500 transition-all overflow-hidden">
        <div className="relative flex-1 h-12">
          {/* Lớp hiển thị số 000 mờ - Phải khớp tuyệt đối với input */}
          <div
            className={cn(
              'absolute inset-0 px-4 flex items-center pointer-events-none',
              alignmentClass === 'text-right'
                ? 'justify-end'
                : alignmentClass === 'text-center'
                  ? 'justify-center'
                  : 'justify-start'
            )}
          >
            <div className={cn('relative whitespace-pre', fontClasses, alignmentClass)}>
              {/* Số tàng hình để giữ chỗ */}
              <span className="invisible">{value === 0 ? '' : displayValue}</span>

              {/* Số 000 mờ - Dùng absolute để không làm lệch tâm của số chính */}
              {showGhostZeros && value > 0 && (
                <span className="absolute left-full text-slate-300/60 select-none">.000</span>
              )}
            </div>
          </div>

          <input
            {...props}
            type="text"
            inputMode="numeric"
            value={value === 0 ? '' : displayValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onFocus={handleFocus}
            placeholder={placeholder || '0'}
            className={cn(
              'absolute inset-0 w-full h-full bg-transparent outline-none px-4 z-10',
              className
            )}
          />
        </div>
        {suffix && (
          <span className="pr-4 text-slate-400 font-bold pointer-events-none">{suffix}</span>
        )}
      </div>
    </div>
  );
}
