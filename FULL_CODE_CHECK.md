# FULL CODE CHECK - HOTEL APP 2026

Báo cáo kỹ thuật toàn diện về hiện trạng hệ thống quản lý khách sạn Hotel2026, bao gồm cấu trúc thư mục và mã nguồn chi tiết của các thành phần cốt lõi.

### **1. CẤU TRÚC THƯ MỤC (/src)**

```text
C:\HOTEL-APP\SRC
├───app
│       globals.css
│       layout.tsx         (Khung giao diện Glassmorphism)
│       page.tsx           (Dashboard & Logic nạp dữ liệu)
│
├───components
│   └───dashboard
│           CheckInModal.tsx (Giao diện Drawer chuẩn iOS)
│           RoomCard.tsx     (Thẻ hiển thị phòng Grid 2 cột)
│
├───hooks
│       useHotel.ts        (SWR Real-time Data Fetching)
│
├───lib
│       pricing.ts         (Logic tính tiền chuyên sâu)
│       supabase.ts        (Cấu hình kết nối DB)
│       utils.ts           (Tiện ích định dạng)
│
└───types
        index.ts           (Định nghĩa TypeScript Schema)
```

---

### **2. TỔNG HỢP MÃ NGUỒN CHI TIẾT**

#### **A. src/app/layout.tsx (Cấu trúc khung)**
File này thiết lập giao diện nền tảng với hiệu ứng Glassmorphism và tối ưu hiển thị cho thiết bị di động.

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: "Hotel Manager 2026",
  description: "High-end Hotel Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={cn(inter.className, "min-h-screen selection:bg-blue-500/30")}>
        <div className="flex h-screen flex-col overflow-hidden">
          {/* Header - Glassmorphism */}
          <header className="glass sticky top-0 z-50 flex h-16 items-center justify-between px-6 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg" />
              <span className="text-xl font-semibold tracking-tight">Hotel<span className="opacity-50">2026</span></span>
            </div>
            <nav className="flex gap-6 text-sm font-medium text-zinc-500">
              <a href="#" className="text-zinc-900 transition hover:text-blue-600">Dashboard</a>
              <a href="#" className="transition hover:text-blue-600">Dịch vụ</a>
              <a href="#" className="transition hover:text-blue-600">Báo cáo</a>
              <a href="#" className="transition hover:text-blue-600">Cài đặt</a>
            </nav>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-10">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
```

#### **B. src/app/page.tsx (Trang Dashboard chính)**
Đây là trái tim của ứng dụng, xử lý hiển thị danh sách phòng, logic Check-in thực tế với Supabase và tích hợp sẵn nút "Khởi tạo lại dữ liệu" (Upsert logic).

```tsx
'use client';

import { useState } from 'react';
import { useHotel } from '@/hooks/useHotel';
import { RoomCard } from '@/components/dashboard/RoomCard';
import { CheckInModal } from '@/components/dashboard/CheckInModal';
import { motion } from 'framer-motion';
import { Room } from '@/types';
import { supabase } from '@/lib/supabase';

export default function Dashboard() {
  const { rooms, settings, isLoading, mutateRooms } = useHotel();
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  const timeRules = settings?.find((s: any) => s.key === 'time_rules')?.value;

  const handleRoomClick = (room: Room) => {
    if (room.status === 'available') {
      setSelectedRoom(room);
    } else {
      alert('Tính năng xem chi tiết/Check-out đang phát triển');
    }
  };

  const handleCheckIn = async (data: any) => {
    try {
      if (!selectedRoom) return;
      let customerId = null;
      
      if (data.customer && data.customer.name) {
        const { data: existingCust } = await supabase
          .from('customers')
          .select('id')
          .or(`phone.eq.${data.customer.phone},id_card.eq.${data.customer.idCard}`)
          .maybeSingle();

        if (existingCust) {
          customerId = existingCust.id;
        } else {
          const { data: newCust, error: custError } = await supabase
            .from('customers')
            .insert([{
              full_name: data.customer.name,
              phone: data.customer.phone,
              id_card: data.customer.idCard,
              visit_count: 1,
              total_spent: 0
            }])
            .select()
            .single();
          if (!custError) customerId = newCust.id;
        }
      }

      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert([{
          room_id: selectedRoom.id,
          customer_id: customerId,
          check_in_at: new Date().toISOString(),
          rental_type: data.rentalType,
          initial_price: data.price,
          deposit_amount: data.deposit || 0,
          room_charge_locked: 0,
          status: 'active'
        }])
        .select()
        .single();

      if (bookingError) throw bookingError;

      const { error: roomError } = await supabase
        .from('rooms')
        .update({ 
          status: data.rentalType,
          current_booking_id: booking.id
        })
        .eq('id', selectedRoom.id);

      if (roomError) throw roomError;

      alert(`Đã nhận phòng ${selectedRoom.room_number} thành công!`);
      setSelectedRoom(null);
      mutateRooms();
      
    } catch (error: any) {
      console.error('Check-in error:', error);
      alert(`Lỗi khi nhận phòng: ${error.message}`);
    }
  };

  const seedRooms = async () => {
    if (rooms.length > 0) {
      const confirmReset = window.confirm('Bạn có chắc chắn muốn nạp lại dữ liệu mẫu?');
      if (!confirmReset) return;
    }
    setIsSeeding(true);
    try {
      const sampleRooms = Array.from({ length: 12 }, (_, i) => {
        const floor = Math.floor(i / 4) + 1;
        const num = (i % 4) + 1;
        return {
          room_number: `${floor}0${num}`,
          area: `Tầng ${floor}`,
          room_type: num === 4 ? 'VIP' : 'Standard',
          status: 'available',
          prices: { hourly: 60000, next_hour: 20000, overnight: 150000, daily: 250000 },
          enable_overnight: true
        };
      });
      const { error } = await supabase.from('rooms').upsert(sampleRooms, { onConflict: 'room_number' });
      if (error) throw error;
      mutateRooms();
      alert('Đã khởi tạo dữ liệu thành công!');
    } catch (error: any) {
      alert(`Lỗi: ${error.message}`);
    } finally {
      setIsSeeding(false);
    }
  };

  if (isLoading) return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black text-zinc-900 dark:text-zinc-50">Sơ đồ phòng</h1>
          <div className="flex items-center gap-3">
            <p className="text-lg text-zinc-500">{rooms?.filter(r => r.status === 'available').length || 0} phòng trống • {rooms?.length || 0} tổng số</p>
            <button onClick={seedRooms} disabled={isSeeding} className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-500 dark:bg-zinc-800">{isSeeding ? 'Đang nạp...' : 'Khởi tạo lại dữ liệu'}</button>
          </div>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {rooms.map((room) => <RoomCard key={room.id} room={room} onClick={handleRoomClick} />)}
      </motion.div>

      {selectedRoom && <CheckInModal room={selectedRoom} timeRules={timeRules} onClose={() => setSelectedRoom(null)} onConfirm={handleCheckIn} />}
    </div>
  );
}
```

#### **C. src/lib/pricing.ts (Logic tính tiền)**
File xử lý tính toán giá giờ, ngày, qua đêm và phụ thu muộn theo DOCUMENTATION.md.

```typescript
import { differenceInMinutes, addDays } from 'date-fns';
import { Booking, TimeRules } from '@/types';

export interface PricingResult { price: number; note: string; }

export class PricingLogic {
  static calculate(booking: Partial<Booking> & { next_hour_price?: number }, timeRules: TimeRules): PricingResult {
    if (!booking.check_in_at || !booking.initial_price) return { price: 0, note: '' };
    const checkIn = new Date(booking.check_in_at);
    const checkOut = booking.check_out_at ? new Date(booking.check_out_at) : new Date();
    const diffMinutes = differenceInMinutes(checkOut, checkIn);
    if (diffMinutes < 0) return { price: 0, note: 'Lỗi thời gian' };

    switch (booking.rental_type) {
      case 'hourly': return this.calculateHourly(booking.initial_price, booking.next_hour_price || booking.initial_price, diffMinutes);
      case 'daily': return this.calculateDaily(booking.initial_price, checkIn, checkOut, timeRules);
      case 'overnight': return { price: booking.initial_price, note: 'Qua đêm' };
      default: return { price: booking.initial_price, note: '' };
    }
  }

  static checkOvernightAutoSuggest(checkIn: Date, timeRules: TimeRules): boolean {
    if (!timeRules?.overnight) return false;
    const [startH, startM] = timeRules.overnight.start.split(':').map(Number);
    const [endH, endM] = timeRules.overnight.end.split(':').map(Number);
    const currentMins = checkIn.getHours() * 60 + checkIn.getMinutes();
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    return startMins > endMins ? (currentMins >= startMins || currentMins <= endMins) : (currentMins >= startMins && currentMins <= endMins);
  }

  private static calculateHourly(basePrice: number, nextHourPrice: number, minutes: number): PricingResult {
    const hours = Math.max(1, Math.ceil(minutes / 60));
    return hours === 1 ? { price: basePrice, note: '1 giờ đầu' } : { price: basePrice + (hours - 1) * nextHourPrice, note: `${hours} giờ` };
  }

  private static calculateDaily(dailyPrice: number, checkIn: Date, checkOut: Date, timeRules: TimeRules): PricingResult {
    if (!timeRules) return { price: Math.max(1, Math.ceil(differenceInMinutes(checkOut, checkIn) / 1440)) * dailyPrice, note: 'Theo ngày' };
    const [coH, coM] = (timeRules.check_out || "12:00").split(':').map(Number);
    let standardCheckOut = addDays(new Date(checkIn), 1);
    standardCheckOut.setHours(coH, coM, 0, 0);
    const diffMinutesAfterCheckout = differenceInMinutes(checkOut, standardCheckOut);
    let dayCount = 1, extraCharge = 0, note = '';

    if (diffMinutesAfterCheckout > 0) {
      dayCount += Math.floor(diffMinutesAfterCheckout / 1440);
      const remainingMinutes = diffMinutesAfterCheckout % 1440;
      const hoursLate = remainingMinutes / 60;
      const appliedRule = timeRules.late_rules?.find(rule => hoursLate >= parseFloat(rule.from) && hoursLate <= parseFloat(rule.to));
      if (appliedRule) { extraCharge = (appliedRule.percent / 100) * dailyPrice; note = ` (Phụ thu ${appliedRule.percent}%)`; }
      else if (hoursLate >= 6) { dayCount += 1; note = ' (Quá giờ tính 1 ngày)'; extraCharge = 0; }
    }
    return { price: (dayCount * dailyPrice) + extraCharge, note: `Ở ${dayCount} ngày${note}` };
  }
}
```

#### **D. src/components/dashboard/CheckInModal.tsx (Giao diện Drawer)**
Modal nhận phòng dạng Drawer chuẩn iOS, tối ưu cho thao tác chạm và tự động đề xuất giá Qua đêm.

```tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Phone, CreditCard, Clock, Calendar, Moon } from 'lucide-react';
import { Room, TimeRules } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';
import { PricingLogic } from '@/lib/pricing';

export function CheckInModal({ room, timeRules, onClose, onConfirm }: any) {
  const [type, setType] = useState<'hourly' | 'daily' | 'overnight'>('hourly');
  const [customer, setCustomer] = useState({ name: '', phone: '', idCard: '' });

  useState(() => {
    if (timeRules && PricingLogic.checkOvernightAutoSuggest(new Date(), timeRules)) setType('overnight');
  });

  const currentPrice = type === 'hourly' ? (room.prices?.hourly || 0) : type === 'daily' ? (room.prices?.daily || 0) : (room.prices?.overnight || 0);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative z-10 w-full max-w-2xl rounded-t-[32px] bg-white p-6 dark:bg-zinc-900 sm:rounded-[32px]">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-black dark:text-white">Nhận phòng {room.room_number}</h2>
            <button onClick={onClose} className="rounded-full bg-zinc-100 p-2 dark:bg-zinc-800"><X size={20}/></button>
          </div>
          <div className="grid gap-6">
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => setType('hourly')} className={cn("p-4 rounded-2xl flex flex-col items-center gap-2", type === 'hourly' ? "bg-blue-50 ring-2 ring-blue-500" : "bg-zinc-50")}>Theo giờ</button>
              <button onClick={() => setType('daily')} className={cn("p-4 rounded-2xl flex flex-col items-center gap-2", type === 'daily' ? "bg-indigo-50 ring-2 ring-indigo-500" : "bg-zinc-50")}>Theo ngày</button>
              <button onClick={() => setType('overnight')} className={cn("p-4 rounded-2xl flex flex-col items-center gap-2", type === 'overnight' ? "bg-purple-50 ring-2 ring-purple-500" : "bg-zinc-50")}>Qua đêm</button>
            </div>
            <div className="bg-zinc-50 p-4 rounded-2xl flex justify-between items-center dark:bg-zinc-800">
              <span className="text-zinc-500">Giá dự kiến</span>
              <span className="text-2xl font-black">{formatCurrency(currentPrice)}</span>
            </div>
            <div className="space-y-3">
              <input type="text" placeholder="Tên khách hàng" className="h-14 w-full rounded-2xl bg-zinc-100 px-4 dark:bg-zinc-800" value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} />
              <input type="tel" placeholder="Số điện thoại" className="h-14 w-full rounded-2xl bg-zinc-100 px-4 dark:bg-zinc-800" value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} />
            </div>
            <button onClick={() => onConfirm({ rentalType: type, price: currentPrice, customer })} className="h-14 w-full rounded-2xl bg-blue-600 text-white font-bold text-lg shadow-lg">Xác nhận (F10)</button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
```

#### **E. src/components/dashboard/RoomCard.tsx (Giao diện thẻ phòng)**
Thẻ phòng thông minh với trạng thái màu sắc động và hiệu ứng hover mượt mà.

```tsx
'use client';

import { Room } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Sun, Moon, Sparkles, Wrench } from 'lucide-react';

const statusConfig = {
  available: { label: 'Trống', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100/50', border: 'border-emerald-200' },
  hourly: { label: 'Theo giờ', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100/50', border: 'border-blue-200' },
  daily: { label: 'Theo ngày', icon: Sun, color: 'text-indigo-600', bg: 'bg-indigo-100/50', border: 'border-indigo-200' },
  overnight: { label: 'Qua đêm', icon: Moon, color: 'text-purple-600', bg: 'bg-purple-100/50', border: 'border-purple-200' },
  dirty: { label: 'Chờ dọn', icon: Sparkles, color: 'text-amber-600', bg: 'bg-amber-100/50', border: 'border-amber-200' },
  repair: { label: 'Sửa chữa', icon: Wrench, color: 'text-rose-600', bg: 'bg-rose-100/50', border: 'border-rose-200' },
};

export function RoomCard({ room, onClick }: any) {
  const config = statusConfig[room.status] || statusConfig.available;
  const Icon = config.icon;

  return (
    <motion.button whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => onClick?.(room)} className={cn("relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[24px] border p-6 text-left transition-all bg-white dark:bg-zinc-900 shadow-lg", config.border)}>
      <div className="z-10 flex w-full items-start justify-between">
        <div className="flex flex-col">
          <span className="text-3xl font-black text-zinc-900 dark:text-zinc-50">{room.room_number}</span>
          <span className="text-sm text-zinc-400">{room.room_type} • {room.area}</span>
        </div>
        <div className={cn("rounded-full p-2.5 backdrop-blur-md", config.bg, config.color)}><Icon size={24} strokeWidth={2.5} /></div>
      </div>
      <div className="z-10 mt-6 space-y-1">
        <span className={cn("text-xs font-bold uppercase tracking-wider", config.color)}>{config.label}</span>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold">{formatCurrency(room.prices?.hourly || 0)}</span>
          <span className="text-xs text-zinc-400">/ giờ đầu</span>
        </div>
      </div>
    </motion.button>
  );
}
```
