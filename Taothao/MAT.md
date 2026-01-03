# BÁO CÁO SỨC KHỎE DỰ ÁN (PROJECT HEALTH CHECK REPORT)
> **Người thực hiện**: Chuyên gia Kiến trúc Hệ thống (System Architect)
> **Ngày báo cáo**: 2026-01-03
> **Đối tượng**: Mã nguồn Hotel App (src/services, src/hooks) & Tài liệu (Taothao/)

---

## 1. 💀 LỖI LOGIC & SỰ MÂU THUẪN (CRITICAL)

### 1.1. Quy trình Check-in "Giả Cầy" (Không Atomic)
- **Tài liệu (`LUAT.md`)**: Yêu cầu "Quy tắc Đơn Nguyên" và tính toàn vẹn dữ liệu.
- **Thực tế (`src/services/hotel.ts` - `checkIn`)**:
  - Hàm `checkIn` đang thực hiện **4 bước rời rạc** từ phía Client:
    1. `select room` (Kiểm tra)
    2. `findOrCreateCustomer` (Tìm khách)
    3. `insert bookings` (Tạo đơn)
    4. `update rooms` (Đổi trạng thái)
- **Hậu quả**: Đây là **Lỗ hổng chết người**. Nếu bước 3 thành công nhưng bước 4 thất bại (mất mạng, lỗi server), hệ thống sẽ có Booking nhưng Phòng vẫn báo "Trống". Dữ liệu bị lệch pha (Inconsistent State). Logic Rollback thủ công (dòng 91) là không đáng tin cậy.

### 1.2. Bom nổ chậm: `findOrCreateCustomer`
- **Vị trí**: `src/services/hotel.ts`
- **Vấn đề**: Logic "Tìm hoặc Tạo" chạy ở Client.
- **Kịch bản lỗi**: Nếu 2 lễ tân cùng check-in cho một khách mới tên "Nguyễn Văn A" cùng lúc, hệ thống sẽ tạo ra **2 khách hàng** trùng nhau trong Database vì không có khóa (Lock) ở cấp độ Database.

---

## 2. 🐢 SÁT THỦ TỐC ĐỘ (PERFORMANCE BOTTLENECKS)

### 2.1. Overfetching "Hủy Diệt" Dashboard (`useHotel.ts`)
- **Vị trí**: `src/hooks/useHotel.ts` -> `fetcher` (dòng 92).
- **Mã độc**: `const { data: customers } = useSWR('customers', fetcher)` -> gọi `supabase.from('customers').select('*')`.
- **Đánh giá**: **NGUY HIỂM CẤP ĐỘ 1**.
  - Hiện tại có thể chạy ổn. Nhưng khi khách sạn có > 1.000 khách, lệnh này sẽ tải toàn bộ danh sách khách hàng mỗi khi F5.
  - Khi lên > 10.000 khách, Dashboard sẽ bị treo (Crash Browser) và làm sập Database.
  - **Khắc phục**: Tuyệt đối không fetch all customers. Chỉ fetch khi tìm kiếm hoặc dùng Pagination.

### 2.2. Song Trùng Mạng (Multiple Round-trips)
- **Vị trí**: `HotelService.checkIn`.
- **Vấn đề**: Mỗi lần Check-in, Client phải bắn 4 request lên Server.
  - Ping 1: Check Room
  - Ping 2: Check Customer
  - Ping 3: Insert Booking
  - Ping 4: Update Room
- **Hệ quả**: Độ trễ cao (Latency x4). Nếu mạng lag, Lễ tân bấm xong ngồi đợi 3-5 giây là bình thường.

---

## 3. 📢 KHÁM BỆNH "THÔNG BÁO KÉP" (DOUBLE NOTIFICATION)

### 3.1. Nguyên nhân gây "Double Re-render" (Frontend)
- **Vị trí**: `src/hooks/useHotel.ts` (dòng 114 - 135).
- **Thủ phạm**:
  - `roomChannel`: Lắng nghe thay đổi bảng `rooms` -> Gọi `mutate('rooms')`.
  - `bookingChannel`: Lắng nghe thay đổi bảng `bookings` -> Gọi `mutate('rooms')`.
- **Cơ chế lỗi**: Hành động Check-in làm thay đổi **CẢ 2 BẢNG** (`bookings` thêm mới, `rooms` đổi status).
  -> Kết quả: `mutate('rooms')` được gọi 2 lần liên tiếp trong tích tắc. Dashboard bị render lại 2 lần không cần thiết.

### 3.2. Nguyên nhân gây "Double Webhook" (Backend)
- **Phân tích**: Nếu hệ thống có Webhook (Edge Function) gắn vào Database Trigger:
  - Trigger 1: `ON INSERT bookings` -> Bắn thông báo "Có khách đặt".
  - Trigger 2: `ON UPDATE rooms` -> Bắn thông báo "Phòng đổi trạng thái".
- **Kết luận**: Một hành động Check-in kích hoạt cả 2 trigger này, dẫn đến 2 webhook được bắn đi.

---

## 4. 💡 ĐỀ XUẤT "ĐẠI CẢI CÁCH" (REFORM PLAN)

### 4.1. Chuyển đổi sang PostgreSQL RPC (Tối ưu & Atomic)
Cần viết ngay các hàm RPC sau trong Database và thay thế logic Frontend:

1.  **`rpc/check_in`**:
    - **Input**: `room_id`, `customer_info`, `rental_type`.
    - **Logic**: Thực hiện gói gọn trong `BEGIN ... COMMIT`. Tự động tìm/tạo khách, tạo booking, update room.
    - **Lợi ích**: 1 Request duy nhất, đảm bảo toàn vẹn dữ liệu 100%.

2.  **`rpc/get_dashboard_data`**:
    - **Logic**: Trả về danh sách phòng kèm thông tin booking hiện tại.
    - **Lợi ích**: Thay thế logic "Join in-memory" rườm rà trong `useHotel.ts`.

### 4.2. Tối ưu Component & Hooks
1.  **Xóa bỏ `useSWR('customers')` trong `useHotel`**:
    - Chuyển sang cơ chế `useCustomerSearch` (chỉ tìm khi gõ tên/SĐT).
2.  **Gộp Realtime Subscription**:
    - Chỉ cần lắng nghe `bookings`. Khi có booking mới -> reload phòng.
    - Hoặc tốt hơn: Chỉ lắng nghe `rooms` (vì status phòng thay đổi là cái quan trọng nhất để hiển thị Dashboard).

### 4.3. Bảng Phân Loại Mức Độ
| Hạng mục | Vấn đề | Mức độ | Hành động |
| :--- | :--- | :--- | :--- |
| **Logic** | Check-in không Atomic | 🔴 **CHẾT NGƯỜI** | Viết RPC `check_in` ngay lập tức |
| **Performance** | Fetch All Customers | 🔴 **CHẾT NGƯỜI** | Xóa ngay, thay bằng Search API |
| **Logic** | Double Re-render | 🟡 **CẢNH BÁO** | Debounce hoặc bỏ bớt listener |
| **Performance** | Check-in 4 Round-trips | 🟡 **CẢNH BÁO** | Chuyển sang RPC |

---
**LỜI PHÊ CỦA THỪA TƯỚNG**: *Hệ thống đang chạy trên lớp băng mỏng. Cần gia cố tầng Database (RPC) ngay trước khi mở rộng quy mô, nếu không sẽ sụp đổ khi lượng khách tăng lên.*
