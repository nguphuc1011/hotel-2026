# FULL PROJECT ARCHITECTURE - HOTEL APP 2026

Tài liệu này cung cấp cái nhìn toàn diện về cấu trúc, logic điều hành và hạ tầng dữ liệu của dự án Hotel App 2026.

## 1. SOURCE CODE ĐIỀU HÀNH TRUNG TÂM

### A. Quản lý Trạng thái: `src/hooks/useHotel.ts`
Đây là "trái tim" của Frontend, quản lý việc nạp dữ liệu Real-time và đồng bộ trạng thái phòng.

```typescript
'use client';

import useSWR, { mutate } from 'swr';
import { supabase } from '@/lib/supabase';
import { Room } from '@/types';
import { useEffect } from 'react';

const fetcher = async (key: string) => {
  if (key === 'rooms') {
    try {
      const [roomsResult, bookingsResult, checksResult] = await Promise.all([
        supabase.from('rooms').select('*').order('room_number'),
        supabase.from('bookings').select('*, customer:customers(*)').eq('status', 'active'),
        supabase.from('room_checks').select('*').in('status', ['pending', 'in_progress', 'completed'])
      ]);

      if (roomsResult.error) throw roomsResult.error;
      if (bookingsResult.error) throw bookingsResult.error;
      if (checksResult.error) throw checksResult.error;

      const rooms = roomsResult.data || [];
      const bookings = bookingsResult.data || [];
      const roomChecks = checksResult.data || [];

      return rooms.map(room => {
        let booking = bookings?.find(b => b.id === room.current_booking_id);
        const isOccupiedStatus = ['hourly', 'daily', 'overnight'].includes(room.status);
        if (!booking && isOccupiedStatus) {
          booking = bookings?.find(b => b.room_id === room.id && b.status === 'active');
        }

        const roomCheck = booking ? roomChecks?.find(c => c.booking_id === booking.id) : null;
        let status = room.status;

        if (booking) {
          status = booking.rental_type || 'hourly';
        } else if (status !== 'dirty' && status !== 'repair') {
          status = 'available';
        }

        return { ...room, status, current_booking: booking || null, room_check: roomCheck || null };
      });
    } catch (error) {
      console.error('Lỗi fetcher rooms:', error);
      throw error;
    }
  }
  
  let query = supabase.from(key).select('*');
  if (key === 'services') query = query.order('name');
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export function useHotel() {
  const { data: rooms, isLoading: roomsLoading } = useSWR<Room[]>('rooms', fetcher, { revalidateOnFocus: true });
  const { data: settings } = useSWR('settings', fetcher);
  const { data: customers } = useSWR('customers', fetcher);
  const { data: services } = useSWR('services', fetcher);

  useEffect(() => {
    const channels = [
      supabase.channel('rooms-all-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => mutate('rooms')),
      supabase.channel('bookings-all-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => mutate('rooms')),
      supabase.channel('checks-all-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'room_checks' }, () => mutate('rooms'))
    ].map(c => c.subscribe());

    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, []);

  return { rooms: rooms || [], settings: settings || [], customers: customers || [], services: services || [], isLoading: roomsLoading, mutateRooms: () => mutate('rooms') };
}
```

### B. Dịch vụ Khách sạn: `src/services/hotel.ts`
Xử lý nghiệp vụ Check-in và Check-out (thông qua RPC).

```typescript
import { supabase } from '@/lib/supabase';

export const HotelService = {
  async checkIn(params: any) {
    const { data: room } = await supabase.from('rooms').select('status').eq('id', params.roomId).single();
    if (!['available', 'reserved'].includes(room?.status)) throw new Error('Phòng không khả dụng');

    const customerId = await this.findOrCreateCustomer(params.customer);
    const { data: booking, error: bookingErr } = await supabase.from('bookings').insert({
      room_id: params.roomId,
      customer_id: customerId,
      check_in_at: params.checkInAt || new Date().toISOString(),
      rental_type: params.rentalType,
      initial_price: params.price,
      deposit_amount: params.deposit || 0,
      status: 'active',
      services_used: params.services || []
    }).select().single();

    if (bookingErr) throw bookingErr;
    await supabase.from('rooms').update({ status: params.rentalType, current_booking_id: booking.id }).eq('id', params.roomId);
    return booking;
  },

  async checkOut(params: any) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.rpc('resolve_checkout', {
      p_booking_id: params.bookingId,
      p_payment_method: params.paymentMethod,
      p_total_amount: params.totalAmount,
      p_final_amount: params.finalAmount,
      p_surcharge: params.surcharge || 0,
      p_user_id: user?.id,
      p_enable_housekeeping: params.enableHousekeeping !== false
    });
    if (error) throw error;
    return data;
  }
};
```

### C. Dịch vụ Buồng phòng: `src/services/housekeeping.ts`
Xử lý việc dọn phòng và hoàn tất kiểm phòng.

```typescript
import { supabase } from '@/lib/supabase';

export const HousekeepingService = {
  async markRoomAsClean(roomId: string) {
    await supabase.from('rooms').update({ status: 'available', current_booking_id: null }).eq('id', roomId);
  },
  async completeRoomCheck(checkId: string, bookingId: string | undefined, items: any[]) {
    const { data, error } = await supabase.rpc('complete_room_check', {
      p_check_id: checkId,
      p_booking_id: bookingId,
      p_items: items,
    });
    if (error) throw error;
    return data;
  }
};
```

## 2. DANH SÁCH API & RPC TOÀN HỆ THỐNG

### A. Các hàm RPC (Database Functions)
1. `process_checkout_transaction`: Hàm chuẩn hóa mới nhất để xử lý thanh toán, cập nhật doanh thu và dòng tiền.
2. `resolve_checkout`: Quy trình check-out cũ hơn, xử lý trạng thái phòng và booking.
3. `complete_room_check`: Chốt danh sách dịch vụ phát sinh từ buồng phòng vào booking.
4. `get_checkout_details`: Lấy chi tiết hóa đơn trước khi thanh toán.
5. `handle_checkout`: Một biến thể khác của quy trình thanh toán.

### B. Các bảng Database quan trọng (Tần suất đọc/ghi cao)
- `rooms`: Cập nhật trạng thái liên tục (`available` <-> `occupied` <-> `dirty`).
- `bookings`: Ghi khi check-in, cập nhật khi check-out hoặc thêm dịch vụ.
- `room_checks`: Lễ tân tạo yêu cầu, Buồng phòng cập nhật kết quả.
- `cashflow_transactions`: Tự động ghi nhận khi có giao dịch thanh toán thành công.
- `invoices`: Lưu trữ hóa đơn cuối cùng để phục vụ báo cáo.
- `customers`: Cập nhật số lượt ở và tổng chi tiêu của khách.

## 3. LOGIC CỦA CÁC CHỨC NĂNG PHỤ TRỢ

### A. Tính toán Doanh thu (`CashflowDashboard.tsx`)
Logic tại đây tập trung vào việc tổng hợp dữ liệu từ danh sách `transactions`:
- **Cơ cấu Thu/Chi**: Sử dụng `useMemo` để gom nhóm giao dịch theo `category_name`.
- **Thực thu (Net Profit)**: `total_income - total_expense`.
- **Thời gian**: Lọc dữ liệu theo các mốc `today`, `week`, `month` hoặc `all`.

### B. Quản lý Nhân viên & Phân quyền (`api/staff/create/route.ts`)
Quy trình tạo nhân viên bảo mật:
1. Sử dụng `SUPABASE_SERVICE_ROLE_KEY` (Admin SDK) để tạo User trong `auth.users` mà không cần đăng xuất Admin hiện tại.
2. Sau khi có `userId`, tiến hành `upsert` vào bảng `public.profiles`.
3. Lưu trữ `role` (admin, manager, receptionist, housekeeping) và mảng `permissions` (JSONB) để kiểm soát truy cập UI.

## 4. CẤU TRÚC DỮ LIỆU MỞ RỘNG (`src/types/index.ts`)

```typescript
export type RoomStatus = 'available' | 'dirty' | 'repair' | 'occupied';
export type BookingStatus = 'active' | 'completed' | 'cancelled';
export type RentalType = 'hourly' | 'daily' | 'overnight';

export interface Room {
  id: string;
  room_number: string;
  status: RoomStatus;
  current_booking_id?: string;
  prices?: { hourly: number; next_hour: number; overnight: number; daily: number; };
  current_booking?: Booking & { customer?: Customer };
  room_check?: RoomCheck;
}

export interface Booking {
  id: string;
  room_id: string;
  customer_id?: string;
  check_in_at: string;
  check_out_at?: string;
  status: BookingStatus;
  total_amount: number;
  final_amount: number;
  surcharge: number;
  payment_method: string;
  services_used: any;
  rental_type?: RentalType;
  deposit_amount?: number;
}

export interface Invoice {
  id: string;
  booking_id: string;
  room_name: string;
  customer_name: string;
  total_amount: number;
  final_collection: number;
  created_at?: string;
}

export interface RoomCheck {
  id: string;
  room_id: string;
  booking_id: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  notes?: string;
}
```
