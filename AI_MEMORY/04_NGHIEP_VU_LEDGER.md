# Báo cáo Nghiệp Vụ Ledger sau Đại Cải Tổ

Ngày: 05/01/2026

## 1) Luồng Check-in & Cọc

- Mục tiêu: ghi nhận tiền cọc của khách tại thời điểm check-in mà KHÔNG lẫn với doanh thu.
- Cách xử lý:
  - Tại check-in, nếu thu cọc, hệ thống ghi một dòng Ledger với:
    - type = DEPOSIT
    - category thể hiện ngữ cảnh cọc (ví dụ: BOOKING_DEPOSIT)
    - booking_id = mã đặt phòng hiện tại
    - customer_id = khách (nếu có)
    - payment_method_code = phương thức thu cọc (CASH/BANK_TRANSFER/CARD)
    - amount = số tiền cọc
  - Dòng DEPOSIT không được tính là doanh thu; nó chỉ là khoản “tiền thực thu trước” để khấu trừ khi checkout.
  - Nếu khách có nợ cũ (customers.balance < 0), hệ thống KHÔNG tự động gom nợ vào cọc. Việc thu nợ diễn ra qua luồng “Thu nợ”, ghi riêng vào Ledger:
    - type = PAYMENT
    - category = DEBT_COLLECTION
    - customer_id = khách
    - amount > 0, payment_method_code = phương thức thanh toán
    - Cập nhật balance của khách về gần 0 theo số tiền đã thu (số tiền thu làm tăng balance).

## 2) Luồng Checkout & Công nợ

- Mục tiêu: phân tách rõ doanh thu, thực thu và phần công nợ còn lại.
- Quy trình ghi Ledger khi checkout:
  1. REVENUE: Ghi nhận tổng doanh thu của kỳ lưu trú (tiền phòng + dịch vụ), thường với:
     - type = REVENUE
     - category = ROOM hoặc SERVICE tùy phân loại
     - booking_id gắn với hóa đơn
     - amount = tổng doanh thu trước khi trừ cọc
     - payment_method_code = NULL
  2. PAYMENT: Ghi nhận thực thu tại thời điểm checkout:
     - type = PAYMENT
     - category = ROOM hoặc INVOICE_PAYMENT
     - payment_method_code = CASH/BANK_TRANSFER/CARD
     - amount = số tiền khách thực trả (đã xét phần cọc sử dụng nếu có)
     
=> Phân biệt:
- REVENUE: ghi nhận doanh thu (làm GIẢM balance - tăng nợ), không mang phương thức thanh toán.
- PAYMENT: ghi nhận tiền thực thu (làm TĂNG balance - giảm nợ), luôn có payment_method_code.

## 3) Công thức tính Balance (Số dư khách hàng)

- Trên giao diện, số dư đọc từ customers.balance để đảm bảo hiệu năng và tính nhất quán.
- customers.balance được cập nhật bởi các thủ tục/RPC khi phát sinh giao dịch liên quan đến khách hàng.
- Quy ước Mới (Đại chỉnh đốn):
  - balance < 0: khách đang nợ (Âm tiền)
  - balance > 0: khách đang có tiền dư/cọc dư (Dương tiền)

- Công thức logic tham chiếu từ Ledger (diễn giải):
  - Tính số dư thuần theo các dòng ảnh hưởng đến công nợ:
    - PAYMENT: +amount (tiền khách trả làm tăng balance/giảm nợ)
    - DEPOSIT: +amount (tiền cọc làm tăng balance)
    - REVENUE: -amount (doanh thu làm giảm balance/tăng nợ)
    - REFUND: -amount (trả lại tiền làm giảm balance)

Ví dụ SQL tham chiếu (để đối chiếu khi cần kiểm toán):

```sql
SELECT COALESCE(SUM(
  CASE
    WHEN type = 'PAYMENT' THEN amount
    WHEN type = 'DEPOSIT' THEN amount
    WHEN type = 'REVENUE' THEN -amount
    WHEN type = 'REFUND' THEN -amount
    WHEN type = 'DEBT_ADJUSTMENT' THEN amount -- tùy dấu của DEBT_ADJUSTMENT
    ELSE 0
  END
), 0) AS balance
FROM public.ledger
WHERE customer_id = :customer_id
  AND status = 'completed';
```

Ghi chú: Giao diện vẫn ưu tiên hiển thị từ customers.balance; câu SQL trên dùng kiểm chứng/hậu kiểm.

## 4) Xử lý sai sót (Immutable-friendly)

Nguyên tắc: Không xóa cứng giao dịch; mọi đính chính phải bảo toàn lịch sử.

Quy trình 3 bước:
1) Void giao dịch sai:
   - Cập nhật dòng Ledger sai: status = 'void', ghi void_reason, void_by.
2) Tạo dòng bù trừ:
   - Thêm một dòng Ledger “compensation” với type/category tương ứng, amount đối dấu để triệt tiêu tác động của dòng sai (meta có tham chiếu id dòng void).
3) Tạo dòng đúng:
   - Thêm dòng Ledger mới với dữ liệu chính xác.

Lợi ích:
- Lịch sử minh bạch, dễ audit.
- Balance và báo cáo doanh thu/công nợ vẫn chính xác sau bù trừ.

## 6) Vệ sinh triệt để (The Big Clean)

Đã thực hiện "Đại chỉnh đốn" (2026-01-05):
- **Cột cũ đã xóa**: Các cột cờ nợ cũ trong bảng `bookings`.
- **RPC đã cập nhật**: `handle_check_in` và `handle_checkout` không còn tham chiếu đến cột cũ và đã đổi dấu balance.
- **Dấu Balance**: Đã đảo ngược toàn bộ dữ liệu hiện có (`balance = -balance`).

## 7) Báo cáo Logic Quy ước (The Ledger Logic)

**Quy ước Số Âm (-) và Dương (+)**:
- **Tiền vào / Tăng số dư (Tăng tài sản KH)**: Mang dấu **Dương (+)**.
  - `PAYMENT`: +amount (Khách trả tiền/Thu nợ).
  - `DEPOSIT`: +amount (Khách cọc tiền).
- **Tiền ra / Giảm số dư (Ghi nợ/Chi phí)**: Mang dấu **Âm (-)**.
  - `REVENUE`: -amount (Doanh thu - khách nợ thêm).
  - `EXPENSE`: -amount (Chi tiền ra khỏi quỹ).
  - `REFUND`: -amount (Trả lại tiền cho khách).

**Công thức tính `customers.balance`**:
```sql
balance = SUM(amount_signed) WHERE status = 'completed'
```
*(Lưu ý: Logic này yêu cầu Ledger lưu amount mang dấu hoặc khi SUM phải áp dụng CASE WHEN).*

## 8) Kiểm tra luồng Tiền mặt (Cashflow Integration)

Báo cáo "Tiền mặt tại quỹ" được truy vấn trực tiếp từ `ledger`:
- **Công thức lọc Tiền mặt**:
  ```sql
  SELECT SUM(
    CASE 
      WHEN type IN ('PAYMENT', 'DEPOSIT') THEN amount 
      WHEN type IN ('EXPENSE', 'REFUND') THEN -amount 
      ELSE 0 
    END
  ) 
  FROM ledger 
  WHERE status = 'completed' 
    AND payment_method_code = 'CASH'
  ```

## 9) Tối ưu Frontend (Component Audit)

Đã cập nhật Hook dùng chung `useCustomerBalance` để quản lý hiển thị:
- **Nợ**: `balance < 0` (Hiển thị màu đỏ, ví dụ: -100,000đ).
- **Dư**: `balance > 0` (Hiển thị màu xanh, ví dụ: +50,000đ).
- **Hợp nhất**: Toàn bộ UI sử dụng Hook này để đảm bảo tính nhất quán.

