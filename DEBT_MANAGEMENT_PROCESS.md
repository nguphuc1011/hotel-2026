# QUY TRÌNH QUẢN LÝ CÔNG NỢ KHÁCH HÀNG (DEBT MANAGEMENT PROCESS)

Tài liệu này mô tả chi tiết các luồng thao tác (workflow) liên quan đến quản lý công nợ khách hàng trong hệ thống khách sạn.

## 1. Quy trình Ghi Nợ (Khách Check-out)

Khi khách hàng làm thủ tục trả phòng (Check-out) nhưng chưa thanh toán đủ số tiền.

**Các bước thực hiện:**
1.  **Mở Modal Thanh Toán:** Lễ tân chọn phòng cần check-out.
2.  **Xác nhận số tiền:** Hệ thống hiển thị tổng số tiền cần thu.
3.  **Nhập số tiền thực trả (Mới):**
    *   Lễ tân nhập số tiền khách đưa vào ô "Khách đưa / Thực trả".
    *   Nếu số tiền < Tổng tiền => Hệ thống tự động tính toán phần còn thiếu (Nợ).
    *   Hệ thống hiển thị cảnh báo "Nợ: xxx đ" màu đỏ.
4.  **Hoàn tất Check-out:**
    *   Lễ tân xác nhận thanh toán.
    *   Hệ thống ghi nhận Ledger loại `PAYMENT` với số tiền thực thu.
    *   Số tiền còn thiếu được cộng vào `balance` (số dư) của khách hàng (Balance sẽ dương).
    *   Trạng thái thanh toán của Booking được đánh dấu là `completed` nhưng Ledger sẽ phản ánh khoản nợ.

## 2. Quy trình Khách Nợ Quay Lại (Returning Guest)

Khi một khách hàng đang có nợ cũ quay lại để Check-in phòng mới.

**Các bước thực hiện:**
1.  **Nhập thông tin khách:** Lễ tân nhập tên hoặc SĐT/CCCD vào Modal Check-in.
2.  **Cảnh báo Công nợ (Tự động):**
*   Hệ thống kiểm tra `balance` của khách.
    *   Nếu `balance > 0`, hiển thị cảnh báo **"KHÁCH ĐANG CÓ NỢ CŨ: [Số tiền]"** ngay trên giao diện Check-in.
    *   Cảnh báo cũng xuất hiện trong modal "Chào mừng trở lại" (Customer Insights).
3.  **Quyết định Check-in:** Lễ tân vẫn có thể cho khách Check-in bình thường. Khoản nợ cũ vẫn được bảo lưu trong hồ sơ khách hàng.

## 3. Quy trình Xử Lý Nợ Trong Folio (Khi khách đang ở)

Khi khách đang ở và Lễ tân mở xem Folio (Chi tiết phòng).

**Các bước thực hiện:**
1.  **Cảnh báo Nợ Cũ:**
    *   Nếu khách có nợ cũ, một thanh cảnh báo màu đỏ sẽ xuất hiện trên đầu Folio: **"Phát hiện nợ cũ: [Số tiền]"**.
2.  **Chọn Thao Tác Xử Lý:** Lễ tân có 2 lựa chọn bắt buộc (nếu muốn xử lý ngay):
    *   **Thanh toán ngay qua Folio (Pay Debt):**
        *   Hệ thống cho phép thu nợ trực tiếp bằng nút "Thu nợ".
        *   Tạo Ledger loại `PAYMENT` (Category: `DEBT_COLLECTION`).
        *   Số dư nợ cũ trong hồ sơ khách hàng tự động giảm xuống.
    *   **Để treo (Suspend):**
        *   Lễ tân chọn "Để treo" nếu khách chưa muốn trả ngay hoặc muốn trả sau.
        *   Cảnh báo vẫn giữ nguyên để nhắc nhở.
*   Khoản nợ vẫn nằm trong hồ sơ khách hàng (`balance` vẫn dương).

## 4. Quy trình Trả Nợ 1 Phần (Partial Repayment)

Khách hàng trả nợ dần, không trả hết một lần.

**Trường hợp 1: Trả khi Check-out (đã mô tả ở mục 1)**

**Trường hợp 2: Khách quay lại trả bớt nợ (Không ở)**
*   *(Tính năng sắp tới trong trang Quản lý Khách hàng)*
*   Lễ tân vào "Cài đặt" -> "Khách hàng" -> Tìm khách nợ.
*   Chọn chức năng "Thu nợ".
*   Nhập số tiền khách trả.
*   Hệ thống tạo Ledger loại `PAYMENT` (Category: `DEBT_COLLECTION`).
*   Trừ số tiền vào `balance` của khách.

## 5. Quy trình Quản Lý Tổng Thể

Dành cho Quản lý/Kế toán để theo dõi toàn bộ công nợ.

**Các bước thực hiện:**
1.  **Truy cập Danh sách Khách hàng:** Vào Cài đặt -> Khách hàng.
2.  **Lọc Khách Nợ:**
    *   Nhấn nút **"Khách nợ" (Filter)**.
*   Danh sách chỉ hiển thị những khách có `balance > 0`.
3.  **Xem Tổng Quan:**
    *   Xem thẻ **"Tổng công nợ"** trên đầu trang để biết tổng số tiền khách đang nợ khách sạn.
    *   Xem chi tiết từng khách để biết lịch sử chi tiêu và số nợ cụ thể.

---
**Lưu ý kỹ thuật:**
*   **Balance (Số dư):** Là số tiền khách hàng đang có trong tài khoản tại khách sạn.
*   `Balance < 0`: Khách trả dư / Đặt cọc (Deposit).
    *   `Balance > 0`: Khách đang nợ.
    *   `Balance = 0`: Hết nợ.
*   **Transaction (Giao dịch):** Luôn ghi nhận dòng tiền thực tế (Cash Flow). Nếu khách nợ, Transaction chỉ ghi số tiền khách thực đưa, không ghi tổng bill.
