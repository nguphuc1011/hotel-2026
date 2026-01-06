# ⚖️ NGHIỆP VỤ KHÁCH SẠN (02_NGHIEP_VU_KHACH_SAN.md)

## 1. Quy trình Nhận phòng (Check-in Flow)
1. Chọn phòng -> Mở `CheckInModal`.
2. Nhập thông tin khách (Tìm khách cũ theo SĐT/CCCD hoặc tạo mới).
3. Chọn loại hình thuê: **Giờ (Hourly)**, **Ngày (Daily)**, **Qua đêm (Overnight)**.
4. **Gộp nợ cũ**: Nếu khách có số dư nợ (`balance > 0`), hệ thống hiển thị cảnh báo và tùy chọn gộp nợ.
5. Thu tiền cọc (Deposit): Tiền cọc được ghi nhận vào `balance` khách hàng và tạo một `transaction`.
6. Gọi RPC `handle_check_in` để khóa phòng và tạo Booking. Xử lý tiền cọc thủ công nếu RPC không hỗ trợ.

## 2. Quy trình Tính tiền (Pricing Logic)
- **Hàm xử lý**: `calculateRoomPrice` trong `src/lib/pricing.ts`.
- **Cơ chế tính Giờ**: Giá giờ đầu + Giá các giờ tiếp theo (có grace period).
- **Cơ chế tính Đêm**: Giá cố định theo khung giờ (ví dụ: 22h - 8h sáng mai).
- **Cơ chế tính Ngày**: Giá theo ngày, check-out sau giờ quy định sẽ tính thêm phụ phí.

## 3. Quy trình Trả phòng (Check-out Flow)
1. Mở `CheckOutModal`.
2. Hệ thống tính toán: `Tiền phòng + Dịch vụ + Phụ phí - Giảm giá - Tiền cọc`.
3. Thanh toán: Chọn phương thức (Tiền mặt, Chuyển khoản, Thẻ).
4. **Xử lý công nợ**: 
    - Nếu trả thiếu: Phần còn lại tự động cộng vào `balance` của khách.
    - Nếu trả dư: Phần thừa trừ vào `balance` (khách có tiền dư).
5. Gọi RPC `handle_checkout` để hoàn tất, giải phóng phòng và lưu hóa đơn.

## 4. Chống gian lận & Giám sát (Security & Audit)
- **Chốt chặn in ấn (Folio)**: Một khi Folio đã được in nháp (`is_printed: true`), nhân viên không thể tự ý xóa/giảm số lượng dịch vụ. Chỉ Admin/Manager mới có quyền ghi đè (Bypass) và phải nhập lý do.
- **Mắt Thần (Push Notification)**: Tự động gửi thông báo đến quản lý khi có các sự kiện nhạy cảm: Check-in, Check-out, Đổi phòng, Sửa booking.
- **Audit Trail**: Mọi thay đổi dịch vụ hoặc đổi phòng đều được ghi log vào `EventService`.

## 5. Quản lý Sổ cái & Ca làm việc (Ledger & Shifts)
- **Cơ chế ghi sổ (Ledger)**:
    - Mọi giao dịch tiền mặt, chuyển khoản đều được ghi nhận vào bảng `ledger`.
    - Giao dịch phải gắn với một Ca đang mở (`shift_id`).
    - Các loại giao dịch: `REVENUE` (Doanh thu), `PAYMENT` (Thanh toán), `DEPOSIT` (Tiền cọc), `REFUND` (Hoàn tiền), `EXPENSE` (Chi phí), `DEBT_ADJUSTMENT` (Điều chỉnh nợ).
- **Quản lý Ca (Shifts)**:
    - Nhân viên phải mở ca trước khi thực hiện các giao dịch tài chính.
    - Khi đóng ca, hệ thống tự động đối soát tiền mặt dự kiến dựa trên các bản ghi trong Ledger.
- **Thu nợ (Debt Collection)**: 
    - Sử dụng `HotelService.payDebt` để vừa cập nhật số dư khách hàng, vừa ghi nhận vào Sổ cái.
