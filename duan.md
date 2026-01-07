# Tổng hợp mã nguồn dự án - Hotel App (ĐÃ FIX LỖI 0Đ & LỖI JOIN DATA)

Dưới đây là tổng hợp các file quan trọng nhất đã được chỉnh sửa để giải quyết triệt để 3 "điểm chết" gây lỗi 0đ và lỗi mất sơ đồ phòng/booking trống.

## 1. Logic tính tiền chính (RPC Database) - ĐÃ CHUYỂN SANG BACKEND
> **LƯU Ý**: File `src/lib/pricing.ts` đã được xóa bỏ. Toàn bộ logic tính tiền hiện nằm trong RPC `calculate_booking_bill_v2` (PostgreSQL) để đảm bảo "Single Source of Truth".

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
