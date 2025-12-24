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
  const { data: customers } = useSWR('customers', fetcher, { revalidateOnMount: true });
  const { data: services, error: servicesError, mutate: mutateServices } = useSWR('services', fetcher);

  // Mock services if the fetch fails or returns no data
  const mockServices = [
    { id: 1, name: 'Nước suối', price: 10000 },
    { id: 2, name: 'Mì ly', price: 15000 },
    { id: 3, name: 'Bia Tiger', price: 20000 },
    { id: 4, name: 'Bia Heineken', price: 25000 },
    { id: 5, name: 'Snack', price: 12000 },
    { id: 6, name: 'Khăn lạnh', price: 5000 },
    { id: 7, name: 'Bàn chải', price: 8000 },
    { id: 8, name: 'Bao cao su', price: 10000 },
    { id: 9, name: 'Giặt ủi', price: 50000 },
    { id: 10, name: 'Thuê xe máy', price: 150000 },
  ];

  const finalServices = (services && services.length > 0) ? services : mockServices;

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
    customers: customers || [],
    services: finalServices || [],
    isLoading: roomsLoading,
    isError: roomsError,
    mutateRooms: () => mutate('rooms'),
  };
}
