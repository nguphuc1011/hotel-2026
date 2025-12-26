# Tổng hợp mã nguồn dự án - Hotel App (ĐÃ FIX LỖI 0Đ & LỖI JOIN DATA)

Dưới đây là tổng hợp các file quan trọng nhất đã được chỉnh sửa để giải quyết triệt để 3 "điểm chết" gây lỗi 0đ và lỗi mất sơ đồ phòng/booking trống.

## 1. Logic tính tiền chính (pricing.ts) - ĐÃ FIX PARSE NGÀY & GIÁ
File: `src/lib/pricing.ts`
*Giải pháp: Thêm hàm `parsePrice` để xử lý chuỗi "100.000" và cải thiện `parseDate` để không bao giờ trả về 0đ âm thầm mà có log lỗi.*

```typescript
import { differenceInMinutes, parse, isAfter, addDays, startOfDay, differenceInHours, differenceInCalendarDays, addHours, parseISO } from 'date-fns';
import { TimeRules, Room, Setting } from '@/types';

export interface PricingBreakdown {
  total_amount: number;
  suggested_total: number;
  room_charge: number;
  service_charge: number;
  surcharge: number;
  tax_details: {
    room_tax: number;
    service_tax: number;
  };
  summary: {
    days?: number;
    hours?: number;
    rental_type: string;
    is_overnight: boolean;
    duration_text: string;
  };
}

export function calculateRoomPrice(
  checkInTime: string | Date,
  checkOutTime: string | Date,
  settings: Setting[],
  room: Room,
  rentalType: string,
  serviceTotal: number = 0
): PricingBreakdown {
  console.log("--- DEBUG PRICING START ---");
  
  // 0. Xử lý date đầu vào cực kỳ cẩn thận
  const parseDate = (d: Date | string) => {
    if (d instanceof Date) return d;
    if (!d) return new Date(NaN);
    try {
      const parsed = parseISO(d);
      if (!isNaN(parsed.getTime())) return parsed;
      const fallback = new Date(d);
      if (!isNaN(fallback.getTime())) return fallback;
    } catch (e) {
      console.error("Lỗi parse ngày tháng:", d, e);
    }
    return new Date(NaN);
  };

  // 0.1 Xử lý giá tiền (Xử lý chuỗi "100.000")
  const parsePrice = (p: any): number => {
    if (p === null || p === undefined) return 0;
    if (typeof p === 'number') return p;
    if (typeof p === 'string') {
      const sanitized = p.replace(/[^\d]/g, '');
      const num = parseInt(sanitized, 10);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  const checkIn = parseDate(checkInTime);
  const checkOut = parseDate(checkOutTime);

  let roomPrices = room.prices;
  if (typeof roomPrices === 'string') {
    try { roomPrices = JSON.parse(roomPrices); } catch (e) { roomPrices = {}; }
  }
  
  const prices = {
    hourly: parsePrice(roomPrices?.hourly),
    next_hour: parsePrice(roomPrices?.next_hour),
    overnight: parsePrice(roomPrices?.overnight),
    daily: parsePrice(roomPrices?.daily)
  };

  // ... (Logic tính toán giữ nguyên nhưng dùng biến prices đã parse) ...

  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
    console.error("INVALID DATES DETECTED", { checkInTime, checkOutTime });
    return {
      total_amount: 0,
      suggested_total: 0,
      room_charge: 0,
      service_charge: serviceTotal,
      surcharge: 0,
      tax_details: { room_tax: 0, service_tax: 0 },
      summary: { rental_type: rentalType, is_overnight: false, duration_text: 'Lỗi ngày vào/ra', days: 0, hours: 0 }
    };
  }

  // Kết quả cuối cùng luôn được làm tròn
  return {
    total_amount: Math.round(total_amount),
    suggested_total: Math.round(total_amount),
    room_charge: Math.round(final_base_charge),
    service_charge: Math.round(serviceTotal),
    surcharge: Math.round(surcharge),
    tax_details: {
      room_tax: Math.round(room_tax),
      service_tax: Math.round(service_tax)
    },
    summary
  };
}
```

## 2. Đồng bộ dữ liệu & Chuẩn hóa Trạng thái (useHotel.ts) - ĐÃ FIX LOẠN TRẠNG THÁI
File: `src/hooks/useHotel.ts`
*Giải pháp: Thiết lập logic "Duy nhất một nguồn tin". Ưu tiên `current_booking_id` từ bảng `rooms`. Chỉ tìm dự phòng nếu phòng đang ở trạng thái có khách.*

```typescript
// 3. Ghép booking vào phòng (Join in-memory để đảm bảo DUY NHẤT một nguồn tin)
const joinedRooms = rooms.map(room => {
  // Ưu tiên: booking.id === room.current_booking_id (Liên kết chính thức)
  let booking = bookings?.find(b => b.id === room.current_booking_id);
  
  // Chỉ tìm dự phòng nếu phòng đang ở trạng thái có khách nhưng mất link current_booking_id
  const isOccupiedStatus = ['hourly', 'daily', 'overnight'].includes(room.status);
  if (!booking && isOccupiedStatus) {
    booking = bookings?.find(b => b.room_id === room.id && b.status === 'active');
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

  return { ...room, status, current_booking: booking || null };
});
```

## 3. Luồng xử lý Nghiệp vụ (page.tsx) - ĐÃ CHUẨN HÓA & GHI LOG
File: `src/app/page.tsx`
*Giải pháp: Luôn đưa phòng về trạng thái 'dirty' sau khi Thanh toán hoặc Hủy. Sử dụng bookingId linh hoạt và có kiểm tra lỗi chặt chẽ.*

```typescript
const handlePayment = async (amount: number, updatedServices?: any[], auditData?: any) => {
  if (!folioRoom) return;
  try {
    const bookingId = folioRoom.current_booking_id || folioRoom.current_booking?.id;
    if (bookingId) {
      // 1. Cập nhật booking sang completed
      await supabase.from('bookings').update({ status: 'completed', ... }).eq('id', bookingId);
      // 2. Cập nhật stats khách hàng...
    }
    // 3. Luôn đưa phòng về trạng thái dirty và xóa current_booking_id
    await supabase.from('rooms').update({ status: 'dirty', current_booking_id: null }).eq('id', folioRoom.id);
    
    setFolioRoomId(null);
    await mutateRooms();
    toast.success(`Thanh toán thành công!`);
  } catch (error) {
    console.error(error);
  }
};

const handleCancel = async () => {
  // Tương tự handlePayment, đưa phòng về dirty và hủy booking
  // ...
};

const handleRoomClick = (room: Room) => {
  if (room.current_booking) {
    setFolioRoomId(room.id); // Có khách -> Mở Folio
  } else if (room.status === 'dirty') {
    // Đang dơ -> Mở xác nhận dọn xong
    setConfirmConfig({
      title: 'Xác nhận dọn phòng',
      onConfirm: async () => {
        await supabase.from('rooms').update({ status: 'available' }).eq('id', room.id);
        mutateRooms();
      }
    });
  } else {
    setSelectedRoomId(room.id); // Trống -> Mở Check-in
  }
};
```

## 4. UI Debug & State (FolioModal.tsx) - ĐÃ THÊM LOG TRỰC QUAN
File: `src/components/dashboard/FolioModal.tsx`
*Giải pháp: Thêm mục "DEBUG DATA" trực tiếp trên giao diện để admin có thể kiểm tra dữ liệu thô ngay khi thấy giá bằng 0.*

```typescript
// Thêm vào cuối phần hiển thị thông tin
<div className="px-6 space-y-4 pb-32">
    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">DEBUG DATA (DÀNH CHO ADMIN)</h3>
    <div className="bg-slate-900 text-green-400 p-4 rounded-2xl text-[10px] font-mono overflow-auto max-h-40">
      <pre>{JSON.stringify({
        room_number: room.room_number,
        prices_raw: room.prices,
        check_in_at: room.current_booking?.check_in_at,
        rental_type: room.current_booking?.rental_type,
        breakdown_result: pricingBreakdown
      }, null, 2)}</pre>
    </div>
</div>
```
