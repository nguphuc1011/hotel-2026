# BÁO CÁO TỔNG THỂ DỰ ÁN QUẢN LÝ KHÁCH SẠN (1HOTEL2) - BẢN ĐẦY ĐỦ NHẤT

Báo cáo này cung cấp cái nhìn chi tiết "tận chân tơ kẽ tóc" về toàn bộ dự án, từ kiến trúc hệ thống, cấu trúc dữ liệu, logic nghiệp vụ đến từng thành phần giao diện.

---

## 1. TỔNG QUAN HỆ THỐNG
- **Tên dự án**: 1Hotel2
- **Mục tiêu**: Quản lý vận hành khách sạn (PMS - Property Management System) tập trung vào tính linh hoạt trong tính tiền (giờ, ngày, đêm) và quản lý dịch vụ.
- **Công nghệ chính**:
    - **Frontend**: Next.js 15+ (App Router), TypeScript, Tailwind CSS, Lucide Icons, Framer Motion.
    - **Backend/DB**: Supabase (PostgreSQL), Real-time Subscriptions, Row Level Security (RLS).
    - **Logic Server**: PostgreSQL Functions (RPC) viết bằng PL/pgSQL.

---

## 2. CẤU TRÚC THƯ MỤC CHI TIẾT

### 2.1. Thư mục Gốc (Root)
- `doc/`: Chứa toàn bộ tài liệu đặc tả logic, quy định lập trình và hướng dẫn.
- `scripts/`: Chứa các công cụ vận hành, migration và kiểm tra database bằng Node.js.
- `src/`: Mã nguồn chính của ứng dụng.
- `public/`: Tài nguyên tĩnh (ảnh, svg).

### 2.2. Chi tiết trong `src/`
- `src/app/`: Định nghĩa các route (trang).
    - `page.tsx`: Trang Dashboard chính (Sơ đồ phòng).
    - `customers/`: Trang quản lý danh sách và chi tiết khách hàng.
    - `settings/`: Trang cấu hình hệ thống, loại phòng, dịch vụ.
    - `reports/`: Trang báo cáo doanh thu (đang phát triển).
- `src/components/`:
    - `dashboard/`: Các component đặc thù cho sơ đồ phòng (RoomCard, Modals).
    - `ui/`: Các component giao diện cơ sở (BentoCard, MoneyInput, Button...).
- `src/services/`: Tầng giao tiếp với Database (Business Logic).
    - `bookingService.ts`: Xử lý đặt phòng, tính hóa đơn (gọi RPC).
    - `roomService.ts`: CRUD phòng và trạng thái phòng.
    - `customerService.ts`: Quản lý khách hàng và công nợ.
    - `serviceService.ts`: Quản lý dịch vụ (hàng hóa) và dịch vụ đi kèm booking.
    - `settingsService.ts`: Quản lý cấu hình hệ thống và loại phòng.
- `src/lib/`: Chứa cấu hình thư viện (`supabase.ts`, `utils.ts`).
- `src/types/`: Định nghĩa kiểu dữ liệu TypeScript dùng chung.

---

## 3. CẤU TRÚC DATABASE (SCHEMA) CHI TIẾT

### 3.1. Bảng `settings` (Cấu hình hệ thống)
Lưu trữ các tham số vận hành toàn cục.
- `key`: Khóa chính (thường là 'config').
- `check_in_time`, `check_out_time`: Giờ chuẩn cho thuê ngày.
- `overnight_start_time`, `overnight_end_time`, `overnight_checkout_time`: Giờ chuẩn cho thuê đêm.
- `grace_minutes`: Thời gian ân hạn (phút).
- `auto_surcharge_enabled`: Bật/tắt tự động tính phụ thu.
- `surcharge_rules`: (JSONB) Danh sách quy tắc phụ thu sớm/muộn.
- `vat_enabled`, `vat_percent`: Cấu hình thuế VAT.
- `service_fee_enabled`, `service_fee_percent`: Phí phục vụ.
- `hourly_unit`: Đơn vị tính block giờ tiếp theo (phút).
- `base_hourly_limit`: Số giờ tối thiểu tính block đầu.

### 3.2. Bảng `rooms` (Danh sách phòng)
- `id`: UUID.
- `room_number`: Số phòng.
- `category_id`: Liên kết bảng `room_categories`.
- `status`: Trạng thái (`available`, `occupied`, `dirty`, `repair`).
- `floor`: Tầng.
- `notes`: Ghi chú nội bộ.

### 3.3. Bảng `room_categories` (Loại phòng & Giá)
- `name`: Tên loại phòng (Vip, Thường, Đôi...).
- `price_hourly`: Giá block đầu tiên.
- `price_next_hour`: Giá cho mỗi block tiếp theo.
- `price_daily`: Giá thuê ngày.
- `price_overnight`: Giá thuê qua đêm.
- `base_hourly_limit`: Thời gian block đầu (giờ).
- `hourly_unit`: Thời gian block tiếp theo (phút).
- `surcharge_mode`: Cách tính phụ thu (`percent` hoặc `amount`).
- `extra_person_enabled`: Bật/tắt tính tiền thêm người.

### 3.4. Bảng `bookings` (Lượt thuê phòng)
- `id`: UUID.
- `room_id`, `customer_id`: Liên kết phòng và khách.
- `rental_type`: Loại thuê (`hourly`, `daily`, `overnight`).
- `check_in_actual`: Thời gian vào thực tế.
- `check_out_actual`: Thời gian ra thực tế.
- `status`: Trạng thái (`active`, `completed`, `cancelled`).
- `deposit_amount`: Tiền đặt cọc.
- `discount_amount`: Tiền giảm giá.
- `custom_surcharge`: Phụ thu thêm bằng tay.
- `services_used`: (JSONB - Legacy) Lưu danh sách dịch vụ (đã chuyển sang bảng `booking_services`).

### 3.5. Bảng `customers` (Khách hàng)
- `full_name`, `phone`, `id_card` (CCCD), `email`, `address`.
- `balance`: Số dư tài khoản (Dùng để quản lý nợ/trả trước).
- `is_banned`: Đánh dấu khách bị cấm.

### 3.6. Bảng `services` & `booking_services` (Dịch vụ)
- `services`: `name`, `price`, `unit`, `is_active`.
- `booking_services`: Lưu vết dịch vụ khách dùng (`booking_id`, `service_id`, `quantity`, `price_at_time`).

---

## 4. LOGIC TÍNH TIỀN (TRÁI TIM HỆ THỐNG)

### 4.1. Hàm RPC `calculate_booking_bill_v2`
Hàm này thực hiện tính toán trên Server để đảm bảo tính chính xác tuyệt đối:
1.  **Load Settings**: Lấy toàn bộ quy tắc ân hạn, giờ chuẩn từ bảng `settings`.
2.  **Load Booking & Category**: Lấy thông tin phòng và bảng giá tương ứng.
3.  **Tính Tiền Phòng Gốc**:
    - **Theo giờ**: Tiền = Giá block đầu + (Thời gian vượt quá / Block tiếp theo) * Giá block tiếp theo.
    - **Theo ngày/đêm**: Lấy giá cố định từ loại phòng.
4.  **Tính Phụ Thu (Surcharge)**:
    - So sánh `check_in_actual` với `check_in_time` tiêu chuẩn để tính **Phụ thu vào sớm**.
    - So sánh `check_out_actual` với `check_out_time` tiêu chuẩn để tính **Phụ thu ra muộn**.
    - Áp dụng thời gian ân hạn (`grace_minutes`) trước khi tính phụ thu.
5.  **Tổng hợp Dịch vụ**: Cộng dồn tiền từ bảng `booking_services`.
6.  **Thuế & Phí**: Tính VAT và Phí dịch vụ trên tổng tiền (sau giảm giá).
7.  **Công nợ**: Tính toán dựa trên số dư `balance` của khách hàng.

---

## 5. CÁC THÀNH PHẦN GIAO DIỆN (UI COMPONENTS)

### 5.1. Dashboard & RoomCard
- **RoomCard**: Hiển thị số phòng, loại phòng, tên khách (nếu có), và thời gian đã ở. Sử dụng màu sắc để biểu thị trạng thái.
- **Filter**: Lọc phòng theo tầng hoặc theo trạng thái.

### 5.2. Check-In Modal
- Luồng xử lý: Chọn loại thuê -> Tìm/Thêm khách hàng -> Nhập tiền cọc -> Chọn dịch vụ ban đầu -> Check-in.
- Tự động gợi ý khách hàng qua số điện thoại hoặc tên.

### 5.3. Room Folio Modal (Chi tiết phòng đang ở)
- Hiển thị "Financial Hero Card": Tổng tiền tạm tính hiện tại.
- Quản lý dịch vụ: Thêm/Xóa món khách dùng ngay lập tức.
- Quick Actions: Chuyển phòng (đang phát triển), Đổi loại hình thuê, Thanh toán.

---

## 6. DANH MỤC SCRIPT VẬN HÀNH (`scripts/`)
- `update_rpc.js`: Script quan trọng nhất, dùng để cập nhật logic tính tiền lên Supabase.
- `inspect_db.js`: Kiểm tra cấu trúc các bảng và dữ liệu mẫu.
- `migrate_db.js`: Khởi tạo cấu trúc bảng ban đầu.
- `check_rls.js`: Kiểm tra các chính sách bảo mật Row Level Security.
- `test_billing.js`: Script chạy thử các kịch bản tính tiền để kiểm tra độ chính xác.

---

## 7. DANH MỤC TÀI LIỆU (`doc/`)
- `logic.md`: Đặc tả chi tiết từng công thức tính toán.
- `rule.md`: Quy định về coding style, đặt tên biến và cấu trúc DB (Rất quan trọng cho nhà phát triển).
- `ui.md`: Hướng dẫn về giao diện và trải nghiệm người dùng.

---

## 8. QUY TRÌNH LUỒNG DỮ LIỆU CHÍNH
1.  **Khách đến**: Nhân viên mở `CheckInModal` -> Tạo `booking` mới -> Cập nhật `room.status = 'occupied'`.
2.  **Trong quá trình ở**: Nhân viên mở `RoomFolioModal` -> Thêm dịch vụ vào `booking_services`.
3.  **Khách đi**: Nhân viên nhấn "Thanh toán" -> Hệ thống gọi RPC `calculate_booking_bill_v2` -> Xuất hóa đơn -> Cập nhật `booking.status = 'completed'` -> `room.status = 'dirty'`.
4.  **Dọn phòng**: Nhân viên nhấn "Dọn xong" -> `room.status = 'available'`.

---
*Báo cáo "Tất Tần Tật" này phản ánh chính xác trạng thái hiện tại của dự án vào ngày 12/01/2026.*
