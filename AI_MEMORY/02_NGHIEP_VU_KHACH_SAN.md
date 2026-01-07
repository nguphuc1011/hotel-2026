# ⚖️ NGHIỆP VỤ KHÁCH SẠN (02_NGHIEP_VU_KHACH_SAN.md)

## 1. Quy trình Nhận phòng (Check-in Flow)
1. Chọn phòng -> Mở `CheckInModal`.
2. Nhập thông tin khách (Tìm khách cũ theo SĐT/CCCD hoặc tạo mới).
3. Chọn loại hình thuê: **Giờ (Hourly)**, **Ngày (Daily)**, **Qua đêm (Overnight)**.
4. **Gộp nợ cũ**: Nếu khách có số dư nợ (`balance < 0`), hệ thống hiển thị cảnh báo và tùy chọn gộp nợ.
5. Thu tiền cọc (Deposit): Tiền cọc được ghi nhận vào `balance` khách hàng và tạo một `transaction`.
6. Gọi RPC `handle_check_in` để khóa phòng và tạo Booking. Xử lý tiền cọc thủ công nếu RPC không hỗ trợ.

## 2. Quy trình Tính tiền (Pricing Logic - Pricing Brain V2)
- **Kiến trúc "Trung dung" (Compiler & Engine)**:
    - **Bộ biên dịch (Strategy Compiler)**: Một Trigger trên bảng `settings` tự động biên dịch các quy tắc phức tạp (giờ, ngày, đêm, phụ phí sớm/muộn) thành một "Bản đồ số học" (JSONB) lưu tại `settings.compiled_pricing_strategy`.
    - **Động cơ tính tiền (Arithmetic Engine)**: RPC `public.calculate_booking_bill` chỉ thực hiện các phép tính số học dựa trên "Bản đồ" đã có sẵn, triệt tiêu hoàn toàn các câu lệnh IF/ELSE phức tạp tại thời điểm runtime, đảm bảo tốc độ phản hồi cực nhanh và logic nhất quán 100%.
- **Nguồn dữ liệu (Source of Truth)**: Toàn bộ logic tính giá được tập trung tại Database RPC. Frontend tuyệt đối không tự tính lại giá để tránh sai lệch.
- **Cơ chế tính Giờ**: Giá gói đầu (ví dụ: 1h hoặc 2h) + Giá các giờ tiếp theo. Hỗ trợ thời gian ân hạn (Grace period) cấu hình trong `settings`.
- **Cơ chế tính Đêm**: Giá cố định cho khung giờ qua đêm. Hỗ trợ tự động tính phụ phí check-in sớm hoặc check-out muộn dựa trên `early_rules` và `late_rules` đã được biên dịch sẵn.
- **Cơ chế tính Ngày**: Tính theo số đêm. Check-out sau giờ quy định (ví dụ: 12h trưa) sẽ tính thêm phụ phí hoặc cộng thêm ngày tùy theo mức độ trễ dựa trên bản đồ chiến lược.
- **Hợp nhất Công nợ & Tiền cọc**:
    - `Tổng thanh toán = Doanh thu phòng + Dịch vụ + Thuế + Phụ phí - Tiền cọc + Nợ cũ`.
    - Con số cuối cùng được RPC tính toán sẵn giúp nhân viên thu tiền chính xác 100%.

## 3. Quy trình Trả phòng (Check-out Flow)
1. Mở `FolioModal` để kiểm tra dịch vụ và in nháp (nếu cần). Nhân viên phải lưu mọi thay đổi dịch vụ trước khi thanh toán.
2. Nhấn "Thanh toán" để mở `CheckOutModal`.
3. Hệ thống hiển thị con số `Cần thu` đã được tính toán từ RPC (đã trừ cọc và cộng nợ cũ).
4. Thanh toán: Chọn phương thức (Tiền mặt, Chuyển khoản, Thẻ).
5. **Giảm giá & Phụ phí**: Hỗ trợ nhập giảm giá hoặc phụ phí phát sinh ngay lúc checkout. Các giá trị này được truyền vào RPC `handle_checkout` để tính toán lại doanh thu cuối cùng một cách chính xác.
6. **Xử lý công nợ**: 
    - Logic nợ được xử lý nguyên tử (Atomic) trong RPC `handle_checkout`.
    - `Số dư mới = Số dư cũ - Doanh thu đơn này (đã trừ discount) + Số tiền thực trả`.
7. Gọi RPC `handle_checkout` để hoàn tất, giải phóng phòng, ghi sổ Ledger và lưu hóa đơn.

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
