# 04_THONG_SO_KY_THUAT.md - HỒ SƠ CHỨC NĂNG CỐT LÕI

Tài liệu này ghi chép các hàm (Database Functions) và logic cốt lõi của hệ thống để đảm bảo tính nhất quán và tránh trùng lặp theo Điều 13 của bctam.md.

## 1. Logic Tính Tiền (Billing Engine)
Tất cả logic tính tiền tập trung tại file: `src/lib/billing_engine.sql`

### 1.1. fn_calculate_room_charge
- **Chức năng**: Tính tiền phòng dựa trên loại hình thuê (giờ, ngày, qua đêm).
- **Tham số**: `p_booking_id`, `p_check_in`, `p_check_out`, `p_rental_type`, `p_room_cat_id`.
- **Đặc điểm**:
  - Hỗ trợ giá trần (ceiling_percent) cho thuê giờ.
  - Xử lý thời gian ân hạn (grace_minutes).
  - Tự động chuyển đổi logic nếu thuê qua đêm ngoài khung giờ quy định.

### 1.2. fn_calculate_surcharge
- **Chức năng**: Tính phụ thu vào sớm (Early Check-in) và trả trễ (Late Check-out).
- **Tham số**: `p_check_in`, `p_check_out`, `p_room_cat_id`, `p_rental_type`.
- **Đặc điểm**:
  - Hỗ trợ 2 chế độ: `percent` (theo % giá ngày) và `amount` (số tiền cố định mỗi giờ).
  - Lấy luật phụ thu từ `settings` hoặc ghi đè tại `room_categories`.
  - Xử lý mốc 100% (full_day_cutoff) để tính thêm 1 ngày.
  - **Lưu ý**: Nếu không tìm thấy luật phù hợp, phụ thu sẽ trả về 0 (không tự ý áp dụng % mặc định để đảm bảo tính minh bạch).

### 1.3. fn_calculate_extra_person_charge
- **Chức năng**: Tính phụ thu thêm người lớn và trẻ em.
- **Tham số**: `p_booking_id`.
- **Đặc điểm**: Lấy số lượng người từ `bookings` và đơn giá từ `room_categories`.

### 1.4. calculate_booking_bill_v2
- **Chức năng**: Hàm Master tổng hợp toàn bộ hóa đơn.
- **Tham số**: `p_booking_id`.
- **Trả về**: JSON chi tiết bao gồm tiền phòng, phụ thu, dịch vụ, giảm giá, thuế và phí.

## 2. Nghiệp Vụ Phòng (Room Operations)

### 2.1. check_in_customer
- **Vị trí**: `src/lib/check_in_customer.sql`
- **Chức năng**: Thực hiện check-in cho khách hàng.
- **Đặc điểm**:
  - Cập nhật trạng thái phòng thành `occupied`.
  - Cập nhật trạng thái booking thành `checked_in`.
  - Ghi nhận thời gian check-in thực tế.
  - Sử dụng Transaction để đảm bảo tính đồng bộ dữ liệu.

## 3. Quy Định Trạng Thái (Enum Values)
- **Room Status**: `available`, `occupied`, `dirty`, `repair`.
- **Booking Status**: `pending`, `checked_in`, `checked_out`, `cancelled`.
- **Rental Type**: `hourly`, `daily`, `overnight`.

---
*Cập nhật lần cuối: 2026-01-15 bởi AI Assistant*
