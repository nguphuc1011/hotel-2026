'use client';

import React, { useState, useEffect, memo } from 'react';
import { differenceInSeconds, differenceInDays } from 'date-fns';

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
        const diffSec = Math.max(0, differenceInSeconds(now, checkIn));
        const h = Math.floor(diffSec / 3600);
        const m = Math.floor((diffSec % 3600) / 60);
        const s = diffSec % 60;
        setDisplay(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      } else {
        // Daily or Overnight
        const diffDays = Math.max(1, differenceInDays(now, checkIn));
        setDisplay(`${diffDays} ngày`);
      }
    };

    // Initial update
    updateTime();

    // Set interval based on mode
    const intervalMs = mode === 'hourly' ? 1000 : 60000; // 1s for hourly, 60s for daily
    const timer = setInterval(updateTime, intervalMs);

    return () => clearInterval(timer);
  }, [checkInAt, mode]);

  return <>{display}</>;
};

export default memo(LiveTimer);
