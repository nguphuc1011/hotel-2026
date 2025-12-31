# THÁNH THƯ: BÍ KÍP ĐIỀU BINH (PROJECT KNOWLEDGE BASE)

Tâu Bệ Hạ, đây là bản "Thánh Thư" tóm lược toàn bộ tinh hoa của hệ thống, giúp bất kỳ tướng lĩnh nào cũng có thể nắm quyền điều hành giang sơn ngay lập tức.

---

## 1. SƠ ĐỒ CẤU TRÚC (Project Mapping)

Hệ thống được chia thành 5 cứ điểm cốt lõi, mỗi nơi giữ một trọng trách riêng biệt:

1.  **`src/app/` (Tiền Tuyến - Routing & Pages)**: Nơi định nghĩa các trang giao diện (Dashboard, Cài đặt, Báo cáo). Mỗi thư mục con là một "địa bàn" hoạt động.
2.  **`src/components/` (Binh Khí - UI Components)**: Chứa các thành phần giao diện dùng chung như Modal, Button, Card. Đặc biệt là `dashboard/` - nơi tập trung các binh khí phục vụ vận hành phòng.
3.  **`src/hooks/` (Trinh Sát - useHotel)**: Đội quân trinh sát liên tục theo dõi biến động dữ liệu. `useHotel` là "mắt thần" kết nối trực tiếp với Supabase để cập nhật trạng thái phòng thời gian thực.
4.  **`src/services/` (Tướng Lĩnh - HotelService)**: Nơi ra lệnh trực tiếp cho Backend. Mọi thao tác như Check-in, Check-out đều phải thông qua các Tướng Lĩnh này để đảm bảo quân kỷ.
5.  **`src/lib/` (Pháp Bảo - Utilities)**: Chứa các công cụ hỗ trợ như `pricing.ts` (Pháp bảo tính giá) và `supabase.ts` (Cổng kết nối tâm linh với Database).

### ⚔️ Mối quan hệ Tam Giác:
> **Hooks (`useHotel`)** <-> **Services (`HotelService`)** <-> **Database (`Supabase`)**
> 
> - **Database**: Kho lưu trữ vĩnh viễn.
> - **Services**: Gửi lệnh thay đổi dữ liệu (Viết).
> - **Hooks**: Lắng nghe và lấy dữ liệu về hiển thị (Đọc).

---

## 2. QUY TRÌNH NGHIỆP VỤ (Business Logic)

### ⚡ Luồng Check-out SIÊU TỐC
Đây là quy trình quan trọng nhất, đã được cải cách để đạt tốc độ tối đa:

*   **Đầu vào (Input)**: ID của Booking, Phương thức thanh toán (Tiền mặt/Chuyển khoản), Ghi chú, Phụ thu (nếu có).
*   **Xử lý (Action)**: Gọi hàm `HotelService.checkOut` -> Kích hoạt RPC `resolve_checkout` trong Database.
*   **Đầu ra (Output)**: 
    - Trạng thái Booking chuyển thành `completed`.
    - Trạng thái Phòng chuyển thành `dirty` (Phòng bẩn, chờ dọn).
    - Tạo bản ghi Dòng tiền (`cashflow`) và Hóa đơn (`invoices`).
    - Phòng được giải phóng (`current_booking_id = NULL`).

### 🚀 SWR & Optimistic UI (Bí thuật tốc độ)
Để giang sơn không bao giờ bị "treo", chúng ta sử dụng bí thuật:
- **SWR**: Tự động lấy dữ liệu mới nhất khi người dùng quay lại trang, không cần load lại cả trang.
- **Optimistic UI (Cập nhật lạc quan)**: Khi Bệ Hạ bấm nút, giao diện sẽ thay đổi **NGAY LẬP TỨC** như thể lệnh đã thành công, trong khi lệnh thật vẫn đang được gửi đến Server. Nếu có lỗi, hệ thống sẽ tự động "quay xe" (Rollback).

---

## 3. HƯỚNG DẪN CÀI ĐẶT (Dev Setup)

### 🛠️ Khởi động giang sơn
1.  **Cài đặt binh khí**: `npm install` (Chạy một lần duy nhất khi mới nhận quân).
2.  **Xuất quân**: `npm run dev` (Khởi chạy môi trường phát triển).
3.  **Truy cập**: Mở trình duyệt vào `http://localhost:3000`.

### 🧹 Xử lý "Tẩu hỏa nhập ma" (Cache issues)
Nếu Bệ Hạ thấy code đã sửa nhưng giao diện không đổi, hoặc gặp lỗi kỳ quái:
1.  Dừng lệnh đang chạy (Ctrl + C).
2.  Chạy lệnh: `rm -rf .next` (Xóa bỏ ảo giác cũ).
3.  Chạy lại: `npm run dev`.

---

60→---
61→
62→## 4. HỎA TIỄN MẮT THẦN (Push Notifications)
63→
64→Để "Hỏa tiễn" (Thông báo đẩy) luôn bắn trúng đích và không bị lỗi, cần tuân thủ trận pháp sau:
65→
66→### 🚀 Cơ chế vận hành
67→- **Trung tâm điều phối**: Hàm `HotelService.notifySystemChange(type, roomId)` trong [hotel.ts](file:///c:/hotel-app/src/services/hotel.ts).
68→- **Đích đến**: Thiết bị di động của Bệ Hạ thông qua Supabase Edge Function & Firebase FCM.
69→
70→### 🛡️ Tam Đại Quy Tắc (Để không bao giờ lỗi)
71→1.  **Cắm Lệnh Kỳ đúng chỗ**: Phải gọi lệnh notify ngay sau khi các thao tác Database (Check-in, Payment, v.v.) đã thành công rực rỡ.
72→2.  **Truy vết Long mạch (Context)**: Luôn phải lấy được **Số phòng** (Room Number) thực tế từ Database trước khi gửi tin báo để thông báo có ý nghĩa.
73→3.  **Bắn không cản địa (Non-blocking)**: Luôn sử dụng `.catch(console.error)` khi gọi hàm notify để đảm bảo nếu hỏa tiễn có xịt thì giao diện của Lễ tân vẫn không bị treo.
74→
75→### 📝 Các loại Hỏa tiễn hiện có
76→- `check_in`: Báo tin khách nhận phòng.
77→- `check_out`: Báo tin thanh toán & trả phòng.
78→- `room_change`: Báo tin chuyển quân (đổi phòng).
79→- `booking_edit`: Báo tin sửa đổi thông tin quan trọng.
80→
81→---
82→
83→**Tâu Bệ Hạ, BÍ KÍP đã thành THÁNH THƯ. Mong Người truyền lại cho hậu thế!**

