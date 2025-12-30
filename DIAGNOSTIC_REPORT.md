# DIAGNOSTIC REPORT - HOTEL APP

## 1. CẤU TRÚC THƯ MỤC (src/)
```
src/
├── app/
│   ├── api/
│   │   └── staff/create/route.ts
│   ├── finance/
│   │   ├── _components/
│   │   │   ├── CashflowDashboard.tsx
│   │   │   ├── CashflowModal.tsx
│   │   │   ├── CashflowTable.tsx
│   │   │   └── FinanceManagement.tsx
│   │   └── page.tsx
│   ├── settings/
│   │   ├── customers/
│   │   ├── finance/
│   │   ├── general/
│   │   ├── operations/
│   │   ├── profile/
│   │   ├── reports/
│   │   ├── rooms/
│   │   ├── services/
│   │   └── staff/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── dashboard/
│   │   ├── BillSummary.tsx
│   │   ├── CheckInModal.tsx
│   │   ├── CheckOutModal.tsx
│   │   ├── FolioModal.tsx
│   │   ├── RoomCard.tsx
│   │   └── ...
│   ├── features/
│   │   ├── CheckOutForm.tsx
│   │   └── CheckOutModal.tsx
│   ├── layout/
│   └── ui/
├── hooks/
│   └── useHotel.ts
├── lib/
│   ├── pricing.ts
│   ├── supabase.ts
│   └── utils.ts
├── services/
│   ├── hotel.ts
│   └── housekeeping.ts
└── types/
    └── index.ts
```

## 2. DANH SÁCH FILE & CHỨC NĂNG

### Components (Modals/Dashboards)
- [CheckInModal.tsx](file:///c:/hotel-app/src/components/dashboard/CheckInModal.tsx): Xử lý quy trình nhận phòng (Check-in).
- [CheckOutModal.tsx](file:///c:/hotel-app/src/components/dashboard/CheckOutModal.tsx): Xử lý thanh toán và gọi RPC `process_checkout_transaction`. **(Xử lý Checkout chính)**
- [FolioModal.tsx](file:///c:/hotel-app/src/components/dashboard/FolioModal.tsx): Hiển thị chi tiết booking, quản lý dịch vụ và mở modal thanh toán.
- [RoomCard.tsx](file:///c:/hotel-app/src/components/dashboard/RoomCard.tsx): Hiển thị trạng thái phòng và thông tin cơ bản trên dashboard. **(Xử lý Room Status hiển thị)**
- [CheckOutForm.tsx](file:///c:/hotel-app/src/components/features/CheckOutForm.tsx): Form thanh toán thay thế, gọi RPC `handle_checkout`.

### Hooks
- [useHotel.ts](file:///c:/hotel-app/src/hooks/useHotel.ts): Hook quản lý trạng thái toàn bộ khách sạn và cập nhật thời gian thực qua Supabase Realtime.

### Services
- [hotel.ts](file:///c:/hotel-app/src/services/hotel.ts): Chứa logic nghiệp vụ lõi như Check-in, Fetch phòng.
- [housekeeping.ts](file:///c:/hotel-app/src/services/housekeeping.ts): Quản lý các tác vụ buồng phòng và cập nhật trạng thái dọn dẹp. **(Xử lý Room Status transition)**

## 3. NỘI DUNG TYPES (src/types/index.ts)
```typescript
export type RoomStatus = 'available' | 'hourly' | 'daily' | 'overnight' | 'dirty' | 'repair';
export type RentalType = 'hourly' | 'daily' | 'overnight';
export type BookingStatus = 'active' | 'completed' | 'cancelled';

export interface Room {
  id: string;
  room_number: string;
  room_type: string;
  area: string;
  status: RoomStatus;
  prices: {
    hourly: number;
    next_hour: number;
    overnight: number;
    daily: number;
  };
  enable_overnight: boolean;
  voice_alias?: string;
  current_booking_id?: string;
  last_status_change?: string;
  current_booking?: Booking & { customer?: Customer };
  room_check?: RoomCheck;
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  id_card: string;
  address?: string;
  total_spent: number;
  visit_count: number;
  notes?: string;
  ocr_data?: any;
}

export interface Booking {
  id: string;
  room_id: string;
  customer_id?: string;
  check_in_at: string;
  check_out_at?: string;
  rental_type: RentalType;
  initial_price: number;
  deposit_amount: number;
  services_used: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    total: number;
  }>;
  merged_bookings?: MergedBooking[];
  prepayments: number;
  logs: Array<{
    time: string;
    action: string;
    detail: string;
  }>;
  room_charge_locked?: number;
  room_charge_suggested?: number;
  room_charge_actual?: number;
  audit_note?: string;
  custom_surcharge?: number;
  status: BookingStatus;
  notes?: string;
  total_amount?: number;
  final_amount?: number;
  surcharge?: number;
  payment_method?: string;
  rooms?: {
    room_number: string;
  };
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
```

## 4. LOGIC HIỆN TẠI

### Logic Thanh toán (CheckOutModal.tsx - handlePayment)
*(Lưu ý: Trong code hiện tại hàm này tên là `handlePayment`, không phải `handleConfirm`)*
```typescript
  const handlePayment = async () => {
    if (loading) return;
    
    // Validation tối thiểu
    if (!bookingId) {
      toast.error('Không tìm thấy mã đặt phòng!');
      return;
    }

    setLoading(true);
    try {
      // Gọi hàm RPC "Thần thánh" xử lý toàn bộ transaction trong DB
      // p_total_amount truyền vào grandTotal để ghi nhận doanh thu đầy đủ
      const { data, error } = await supabase.rpc('process_checkout_transaction', {
        p_booking_id: bookingId,
        p_payment_method: paymentMethod,
        p_surcharge: 0,
        p_total_amount: grandTotal || roomTotal
      });

      if (error) throw error;
      
      if (data?.success === false) {
        throw new Error(data.message || 'Giao dịch thất bại');
      }

      toast.success('Thanh toán hoàn tất thành công!');
      onSuccess?.();
      onClose();

    } catch (err: any) {
      console.error('Lỗi thanh toán:', err);
      toast.error(err.message || 'Lỗi hệ thống khi xử lý thanh toán');
    } finally {
      setLoading(false);
    }
  };
```

### Logic Lưu cập nhật Dịch vụ (FolioModal.tsx - handleSaveUpdate)
*(Lưu ý: FolioModal không có hàm handleConfirm trực tiếp cho checkout, nó mở CheckOutModal)*
```typescript
  const handleSaveUpdate = async () => {
    const bookingId = room?.current_booking?.id;
    if (!bookingId || isSaving) return;

    setIsSaving(true);
    try {
      const updatedServicesArray = Object.entries(tempServices)
        .filter(([_, qty]) => qty > 0)
        .map(([sid, qty]) => {
          const s = services.find(srv => String(srv.id) === String(sid));
          const savedS = room.current_booking?.services_used?.find((ss: any) => String(ss.service_id || ss.id) === String(sid));
          
          const price = s?.price || savedS?.price || 0;
          const name = s?.name || savedS?.name || 'Dịch vụ';
          
          return {
            id: sid,
            service_id: sid,
            name,
            price,
            quantity: qty,
            total: price * qty
          };
        });

      const { error } = await supabase
        .from('bookings')
        .update({ services_used: updatedServicesArray })
        .eq('id', bookingId);

      if (error) throw error;
      
      // ... cập nhật state local ...
      showNotification('Đã lưu cập nhật dịch vụ', 'success');
      if (onUpdate) onUpdate();
    } catch (error: any) {
      showNotification(`Lỗi khi lưu: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };
```

### Logic chuyển trạng thái Dirty -> Available (src/app/page.tsx - handleRoomClick)
```typescript
    // 2. Nếu phòng đang dơ (dirty) -> Hỏi xác nhận dọn xong
    if (room.status === 'dirty') {
      // ... kiểm tra phân quyền ...
      setConfirmConfig({
        isOpen: true,
        title: 'Xác nhận dọn phòng',
        description: `Phòng ${room.room_number} đã dọn dẹp xong và sẵn sàng đón khách?`,
        confirmText: 'ĐÃ DỌN XONG',
        onConfirm: async () => {
          setConfirmConfig(prev => ({ ...prev, isLoading: true }));
          try {
            const { error } = await supabase
              .from('rooms')
              .update({ 
                status: 'available', 
                current_booking_id: null,
                last_status_change: null 
              })
              .eq('id', room.id);
            
            if (error) throw error;
            await mutateRooms();
            setConfirmConfig(prev => ({ ...prev, isOpen: false, isLoading: false }));
            showNotification(`Phòng ${room.room_number} đã sẵn sàng!`, 'success');
          } catch (error) {
            // ... xử lý lỗi ...
          }
        }
      });
      return;
    }
```

## 5. SQL RPC (Database Functions)
Danh sách các hàm RPC mà Frontend đang gọi:
1. `process_checkout_transaction`: Xử lý thanh toán, ghi hóa đơn, cập nhật trạng thái phòng và booking (nguyên tử).
2. `handle_checkout`: Một phiên bản xử lý checkout khác (thường dùng trong CheckOutForm).
3. `get_checkout_details`: Lấy chi tiết hóa đơn dự kiến trước khi thanh toán.
4. `resolve_checkout`: Giải quyết các vấn đề phát sinh khi checkout.
5. `complete_room_check`: Xác nhận hoàn tất kiểm tra phòng từ bộ phận buồng phòng.
