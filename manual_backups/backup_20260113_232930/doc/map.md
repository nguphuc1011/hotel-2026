# 🗺️ BẢN ĐỒ HUYẾT MẠCH (map.md) - PHIÊN BẢN V2 (TINH KHIẾT)

> **Trạng thái:** Tuân thủ Quân lệnh tối cao - Chờ phê duyệt khởi tạo.
> **Dự án ID:** udakzychndpndkevktlf (HotelV2)

## 1. Hệ thống Cài đặt (settings)
Lưu trữ các mốc giờ và cấu hình vận hành toàn hệ thống.
- `id`: 'config' (Dòng duy nhất).
- **Mốc giờ chuẩn**:
  - `check_in_time`: Giờ nhận phòng chuẩn (Ví dụ: 14:00).
  - `check_out_time`: Giờ trả phòng chuẩn (Ví dụ: 12:00).
  - `night_audit_hour`: Giờ chốt ca & tính doanh thu dự kiến (Ví dụ: 00:00).
  - `late_checkout_limit`: Mốc tính thêm ngày khi trả muộn (Ví dụ: 18:00).
  - `early_checkin_limit`: Mốc tính thêm ngày khi đến sớm (Ví dụ: 05:00).
- **Nút gạt cấu hình (Switches)**:
  - `enable_vat`: Bật/Tắt tính thuế VAT.
  - `auto_deduct_inventory`: Tự động trừ kho khi bán dịch vụ.
  - `enable_print_bill`: Bật/Tắt chế độ in hóa đơn khi thanh toán.
  - `surcharge_mode`: Chế độ phụ thu (1: Theo %, 2: Theo số tiền cố định/giờ).
  - `allow_manual_price_override`: Cho phép sửa giá thủ công (Chỉ Admin/Manager).

## 2. Danh mục Hạng phòng (room_categories)
Định nghĩa linh hoạt gói tiền giờ và phụ thu.
- `id`: UUID.
- `name`: Tên hạng phòng (Single, Double, VIP...).
- **Gói Thuê Giờ**:
  - `base_time`: Số phút gói đầu (Ví dụ: 120 cho 2h).
  - `base_price`: Giá tiền gói đầu (Ví dụ: 200,000).
  - `step_time`: Số phút mỗi block tiếp theo (Ví dụ: 30).
  - `step_price`: Giá tiền mỗi block tiếp theo (Ví dụ: 50,000).
- **Gói Ngày/Đêm & Phụ thu**:
  - `price_overnight`: Giá ở qua đêm.
  - `price_daily`: Giá ở theo ngày (24h).
  - `hourly_surcharge_amount`: Số tiền cố định mỗi giờ (Dành cho khách Ngày/Đêm trả muộn hoặc đến sớm).

## 3. Quản lý Phòng (rooms)
- `id`: UUID.
- `room_number`: Số phòng (Duy nhất).
- `category_id`: Liên kết bảng `room_categories`.
- `status`: Trạng thái (Trống, Có khách, Đang dọn, Bảo trì).

## 4. Quản lý Nhân sự (staff)
Quản lý tài khoản và phân quyền.
- `id`: UUID.
- `full_name`: Họ tên.
- `username`: Tên đăng nhập (Duy nhất).
- `password_hash`: Mật khẩu mã hóa.
- `role`: Vai trò (Admin, Manager, Staff).
- `is_active`: Trạng thái hoạt động.

## 5. Nhật ký Biến động (transactions)
Lưu mọi thay đổi tài chính và Audit Log.
- `id`: UUID.
- `type`: Loại biến động (Thanh toán, Thu nợ, Sửa giá, Thuê dịch vụ).
- `staff_id`: Người thực hiện.
- `booking_id`: Liên kết đơn đặt phòng (nếu có).
- `amount`: Số tiền biến động.
- `old_value`: Giá trị cũ (dùng cho Audit Log sửa giá).
- `new_value`: Giá trị mới.
- `reason`: Lý do (Bắt buộc khi sửa giá hoặc thu nợ).
- `created_at`: Thời gian thực hiện.

## 6. Khách hàng & Công nợ (customers)
- `id`: UUID.
- `full_name`: Họ tên khách.
- `id_card`: Số CCCD/Passport.
- `phone`: Số điện thoại.
- `total_debt`: Tổng nợ hiện tại.

## 7. Dịch vụ & Kho (services)
- `id`: UUID.
- `name`: Tên dịch vụ.
- `price`: Giá bán.
- `stock_quantity`: Tồn kho.
