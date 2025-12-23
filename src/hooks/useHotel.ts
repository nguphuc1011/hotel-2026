'use client';

import useSWR, { mutate } from 'swr';
import { supabase } from '@/lib/supabase';
import { Room } from '@/types';
import { useEffect } from 'react';

const fetcher = async (key: string) => {
  if (key === 'rooms') {
    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('*')
      .order('room_number');
      
    if (roomsError) throw roomsError;

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*, customer:customers(*)')
      .eq('status', 'active');

    if (bookingsError) console.error('Error fetching bookings:', bookingsError);

    return rooms.map(room => ({
      ...room,
      current_booking: bookings?.find(b => b.room_id === room.id)
    }));
  }

  // Default fetcher for other keys
  let query = supabase.from(key).select('*');
  
  if (key === 'services') {
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
