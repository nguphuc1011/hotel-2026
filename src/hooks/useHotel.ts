'use client';

import useSWR, { mutate } from 'swr';
import { supabase } from '@/lib/supabase';
import { Room } from '@/types';
import { useEffect } from 'react';

const fetcher = async (key: string) => {
  // Use correct column name for ordering
  let query = supabase.from(key).select('*');
  
  if (key === 'rooms') {
    query = query.order('room_number');
  } else if (key === 'services') {
    query = query.order('name');
  }

  const { data, error } = await query;
  if (error) {
    console.error(`Supabase error fetching ${key}:`, error);
    throw error;
  }
  return data;
};

export function useHotel() {
  const { data: rooms, error: roomsError, isLoading: roomsLoading } = useSWR<Room[]>('rooms', fetcher, {
    revalidateOnFocus: true,
  });

  const { data: settings } = useSWR('settings', fetcher);

  // Subscribe to real-time changes
  useEffect(() => {
    console.log('Subscribing to realtime changes...');
    const channel = supabase
      .channel('hotel-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms' },
        (payload) => {
          console.log('Realtime change detected:', payload);
          mutate('rooms'); // Re-fetch immediately
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    rooms: rooms || [],
    settings: settings || [],
    isLoading: roomsLoading,
    isError: roomsError,
    mutateRooms: () => mutate('rooms'),
  };
}
