'use client';

import useSWR, { mutate } from 'swr';
import { supabase } from '@/lib/supabase';
import { Room } from '@/types';
import { useEffect } from 'react';

const fetcher = async (key: string) => {
  if (key === 'rooms') {
    try {
      // 1. Lấy danh sách phòng và booking SONG SONG
      const [roomsResult, bookingsResult] = await Promise.all([
        supabase.from('rooms').select('*').order('room_number'),
        supabase
          .from('bookings')
          .select('*, customer:customers(full_name, balance)')
          .eq('status', 'active')
          .is('deleted_at', null),
      ]);

      if (roomsResult.error) throw roomsResult.error;
      if (bookingsResult.error) {
        // Log removed for linting
      }

      const rooms = roomsResult.data || [];
      const bookings = bookingsResult.data || [];

      // 2. Ghép booking vào phòng (Join in-memory)
      const joinedRooms = (rooms || []).map((room) => {
        // Ưu tiên: booking.id === room.current_booking_id (Liên kết chính thức)
        let booking = bookings?.find((b) => b.id === room.current_booking_id);

        // Chỉ tìm dự phòng nếu phòng đang ở trạng thái có khách nhưng mất link current_booking_id
        const isOccupiedStatus = ['hourly', 'daily', 'overnight'].includes(room.status);
        if (!booking && isOccupiedStatus) {
          booking = bookings?.find((b) => b.room_id === room.id && b.status === 'active');
        }

        let status = room.status;

        // CHUẨN HÓA TRẠNG THÁI (Logic Nghiệp vụ duy nhất)
        if (booking) {
          // Nếu CÓ booking active -> BẮT BUỘC trạng thái là loại hình thuê
          status = booking.rental_type || 'hourly';
        } else {
          // Nếu KHÔNG có booking active
          if (status !== 'dirty' && status !== 'repair') {
            // Nếu không phải đang dơ hoặc đang sửa -> Mặc định là Sẵn sàng
            status = 'available';
          }
          // Nếu status đang là 'dirty' hoặc 'repair' -> Giữ nguyên trạng thái đó
        }

        return {
          ...room,
          status,
          current_booking: booking || null,
        };
      });

      return joinedRooms;
    } catch (error) {
      // Error handled by SWR
      throw error;
    }
  }

  // Default fetcher for other keys
  let query = supabase
    .from(key)
    .select(
      key === 'settings'
        ? 'key, value'
        : key === 'services'
          ? 'id, name, price, stock, is_active, unit'
          : 'id, name, price, stock, is_active'
    );

  if (key === 'services') {
    query = query.order('name');
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data;
};

export function useHotel() {
  const {
    data: rooms,
    error: roomsError,
    isLoading: roomsLoading,
  } = useSWR<Room[]>('rooms', fetcher, {
    revalidateOnFocus: true, // Auto-revalidate to ensure status sync
    dedupingInterval: 2000, // Shorten deduping to 2s
  });

  const { data: settings } = useSWR('settings', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000, // Settings rarely change
  });

  const { data: services } = useSWR('services', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

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

  const finalServices = services && services.length > 0 ? services : mockServices;

  // Subscribe to real-time changes
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const debouncedMutateRooms = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => mutate('rooms'), 200);
    };

    // Listen to rooms changes
    const roomChannel = supabase
      .channel('rooms-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        debouncedMutateRooms();
      })
      .subscribe();

    // Listen to bookings changes
    const bookingChannel = supabase
      .channel('bookings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        debouncedMutateRooms();
      })
      .subscribe();

    // Listen to services changes
    const serviceChannel = supabase
      .channel('services-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => {
        mutate('services');
      })
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(bookingChannel);
      supabase.removeChannel(serviceChannel);
    };
  }, []);

  return {
    rooms: rooms || [],
    settings: settings || [],
    services: finalServices || [],
    isLoading: roomsLoading,
    isError: roomsError,
    mutateRooms: () => mutate('rooms'),
  };
}
