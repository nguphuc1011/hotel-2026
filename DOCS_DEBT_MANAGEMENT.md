# TÀI LIỆU KỸ THUẬT: MODULE QUẢN LÝ CÔNG NỢ QUA LEDGER (DEBT MANAGEMENT)

Tài liệu này mô tả chi tiết quy trình nghiệp vụ, thiết kế cơ sở dữ liệu và logic xử lý cho tính năng Quản lý Công Nợ thông qua hệ thống Ledger (Sổ cái) trong hệ thống Khách sạn 2026.

## 1. TỔNG QUAN NGHIỆP VỤ

### Mục tiêu
Thay thế cơ chế gộp nợ thủ công bằng hệ thống Ledger tự động. Nợ được quản lý tập trung theo `customer_id` thay vì dựa trên cờ hiệu tại từng đơn đặt phòng (`bookings`).
1.  Tự động hiển thị nợ cũ khi chọn khách hàng (Check-in/Folio).
2.  Tự động bù trừ công nợ khi Check-out thông qua Ledger.
3.  Cho phép thu nợ lẻ bất cứ lúc nào mà không cần mở phòng.

## 2. THIẾT KẾ CƠ SỞ DỮ LIỆU (DATABASE SCHEMA)

### Bảng `customers`
Theo dõi trạng thái tài chính tổng quát của khách hàng.
- `balance` (numeric): Số dư hiện tại.
  - **Giá trị > 0: Khách đang nợ khách sạn.**
  - **Giá trị < 0: Khách có tiền dư (trả trước/cọc thừa).**
- `total_spent` (numeric): Tổng chi tiêu tích lũy.

### Bảng `ledger` (Sổ cái)
Lưu vết mọi biến động tài chính. Đây là nguồn dữ liệu duy nhất để tính toán `balance`.
- `type`: `REVENUE` (Doanh thu), `PAYMENT` (Thanh toán), `DEPOSIT` (Cọc), `REFUND` (Hoàn tiền), `DEBT_ADJUSTMENT` (Điều chỉnh nợ).
- `amount`: Số tiền (luôn lưu giá trị dương).
- `customer_id`: Liên kết khách hàng.
- `booking_id`: Liên kết đơn phòng (nếu giao dịch phát sinh từ phòng).

## 3. LOGIC XỬ LÝ (CORE LOGIC)

### A. Quy trình Check-in (Nhận phòng)
1.  **Phát hiện nợ**: Hệ thống kiểm tra `customers.balance`. Nếu `balance > 0`, hiển thị cảnh báo đỏ.
2.  **Không cần gộp nợ**: Không còn checkbox "Gộp nợ". Mọi nợ cũ sẽ được tự động hiển thị trong báo cáo tổng thu khi Check-out để nhân viên nhắc khách.

### B. Quy trình Check-out (Trả phòng)
1.  **Tính toán Phải thu**:
    - `TotalBill` = Tiền phòng + Dịch vụ + Phụ thu - Giảm giá + Thuế.
    - `NetToCollect` = TotalBill - Deposit.
2.  **Xử lý Backend (RPC `handle_checkout`)**:
    - Ghi nhận doanh thu (Revenue) tương ứng với `TotalBill`.
    - Ghi nhận thanh toán (Payment) tương ứng với số tiền khách trả thực tế (`p_amount_paid`).
    - Hệ thống tự động cập nhật `customers.balance` dựa trên chênh lệch giữa tổng Revenue và tổng Payment/Deposit trong Ledger.

### C. Thu nợ lẻ (Pay Debt)
- Cho phép thu nợ trực tiếp từ `FolioModal` hoặc `CustomerManagement`.
- Sử dụng RPC `handle_debt_payment` để ghi một entry `PAYMENT` (Category: `DEBT_COLLECTION`) vào Ledger.

## 4. CẤU TRÚC CODE & TRÁNH TRÙNG LẶP

- **`src/services/hotel.ts`**: Chứa các hàm Service tập trung gọi RPC (`checkIn`, `checkOut`, `payDebt`).
- **`src/lib/pricing.ts`**: Chứa logic tính toán tiền phòng đồng nhất giữa Frontend và Backend.
- **`src/components/shared/CustomerDetail.tsx`**: Hiển thị hồ sơ nợ và lịch sử Ledger duy nhất cho toàn ứng dụng.

---
*Tài liệu này được cập nhật ngày 05/01/2026 - Đã xóa bỏ các tham chiếu cũ.*
