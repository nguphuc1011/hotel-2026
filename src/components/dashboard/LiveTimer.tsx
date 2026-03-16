'use client';

import React, { useState, useEffect, memo } from 'react';
import { differenceInSeconds, differenceInHours } from 'date-fns';

interface LiveTimerProps {
  checkInAt: string;
  mode: 'hourly' | 'daily' | 'overnight';
}

const LiveTimer: React.FC<LiveTimerProps> = ({ checkInAt, mode }) => {
  const [display, setDisplay] = useState('--:--:--');
  
  useEffect(() => {
    const checkIn = new Date(checkInAt);
    if (isNaN(checkIn.getTime())) return;

    const updateTime = () => {
      const now = new Date();
      
      if (mode === 'hourly') {
        const diffMin = Math.max(0, Math.floor(differenceInSeconds(now, checkIn) / 60));
        const h = Math.floor(diffMin / 60);
        const m = diffMin % 60;
        setDisplay(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      } else if (mode === 'daily') {
        const diffHours = Math.max(0, differenceInHours(now, checkIn));
        const diffDays = Math.ceil(diffHours / 24);
        setDisplay(`${Math.max(1, diffDays)} ngày`);
      } else if (mode === 'overnight') {
        const diffHours = Math.max(0, differenceInHours(now, checkIn));
        const diffDays = Math.ceil(diffHours / 24);
        setDisplay(`${Math.max(1, diffDays)} đêm`);
      }
    };

    updateTime();

    // Only run interval for hourly rooms
    if (mode !== 'hourly') return;

    // Tối ưu: Cập nhật mỗi 60 giây (đủ để không lệch phút mà nhẹ hơn 1s)
    const intervalMs = 60000; 
    const timer = setInterval(updateTime, intervalMs);

    return () => clearInterval(timer);
  }, [checkInAt, mode]);

  return <>{display}</>;
};

export default memo(LiveTimer);
