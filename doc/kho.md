# BÁO CÁO HỆ THỐNG QUẢN LÝ KHO VÀ DÒNG TIỀN (INVENTORY & CASH FLOW)

Hệ thống được thiết kế để quản lý chặt chẽ hàng hóa, chống thất thoát và tự động hóa việc tính toán lãi lỗ dựa trên nguyên tắc **Dòng tiền đi kèm Hàng hóa**.

---

## 1. CẤU TRÚC DATABASE (SCHEMA)

### A. Bảng `services` (Danh mục dịch vụ & Kho)
Lưu trữ thông tin cơ bản và trạng thái kho hiện tại.
- `stock`: Số lượng tồn kho hiện tại (tính theo đơn vị bán lẻ).
- `cost_price`: Giá vốn bình quân (Weighted Average Cost - WAC). Dùng để tính lãi lỗ.
- `unit_buy`: Đơn vị khi nhập hàng (ví dụ: Thùng, Két).
- `unit_sell`: Đơn vị khi bán cho khách (ví dụ: Chai, Lon, Gói).
- `conversion_factor`: Hệ số quy đổi (ví dụ: 1 Thùng = 24 Chai).
- `track_inventory`: Bật/Tắt chức năng quản lý kho cho dịch vụ này.

### B. Bảng `inventory_logs` (Nhật ký kho - Audit Trail)
Lưu lại mọi biến động kho, không bao giờ xóa.
- `type`: Loại biến động (`IMPORT` - Nhập hàng, `SALE` - Bán hàng, `RETURN` - Khách trả, `ADJUST` - Kiểm kê).
- `quantity`: Số lượng biến động (theo đơn vị bán).
- `unit_cost`: Giá vốn tại thời điểm ghi log.
- `total_value`: Tổng giá trị biến động (`quantity * unit_cost`).
- `balance_before / after`: Số dư kho trước và sau khi biến động.
- `reference_id`: ID tham chiếu (liên kết tới `cash_flow_id` khi nhập hàng hoặc `booking_id` khi bán hàng).

### C. Bảng `cash_flow` (Dòng tiền)
Mọi giao dịch mua hàng phải được ghi nhận tại đây để đối soát.
- `flow_type`: `OUT` (Chi phí nhập hàng).
- `category`: `Nhập hàng`.
- `amount`: Tổng số tiền chi ra.
- `description`: Lưu thông tin chi tiết lô hàng.

---

## 2. CÁC LOGIC CỐT LÕI (CORE LOGIC)

### A. Quy đổi Đơn vị (Unit Conversion)
- **Công thức:** `Số lượng tồn kho (bán lẻ) = Số lượng nhập (thùng) * Hệ số quy đổi`.
- **Lợi ích:** Nhân viên nhập "1 Thùng", hệ thống tự hiểu là cộng 24 chai vào kho. Giảm thiểu sai sót tính toán thủ công.

### B. Giá vốn Bình quân Gia quyền (Weighted Average Cost - WAC)
Đây là phương pháp tính lãi lỗ chính xác nhất cho khách sạn.
- **Công thức:** `Giá vốn mới = (Tồn cũ * Giá vốn cũ + Nhập mới * Giá nhập mới) / Tổng tồn mới`.
- **Ví dụ:** 
    - Đang tồn 10 chai giá 10k.
    - Nhập mới 10 chai giá 12k.
    - Giá vốn mới = `(10*10 + 10*12) / 20 = 11k`.
- **Ứng dụng:** Khi bán 1 chai giá 20k, lợi nhuận sẽ là `20k - 11k = 9k`.

### C. Bảo vệ kho (Fraud Prevention)
- **Chống kho âm:** Trigger database sẽ chặn đứng hành động xuất bán nếu `stock < quantity`. Nhân viên không thể bán hàng nếu chưa nhập kho.
- **Audit Trail:** Khi xóa một món dịch vụ đã dùng trong phòng, hệ thống không `DELETE` mà chuyển trạng thái thành `voided` kèm lý do. Kho sẽ được hoàn lại tự động nhưng lịch sử vẫn còn đó để Bệ Hạ kiểm tra.

---

## 3. QUY TRÌNH VẬN HÀNH (WORKFLOW)

### Bước 1: Nhập hàng (Import)
1. Lễ tân/Quản lý vào giao diện Nhập kho.
2. Chọn hàng hóa, chọn đơn vị "Thùng", nhập số lượng và **Tổng số tiền thanh toán**.
3. Hệ thống thực hiện 3 việc đồng thời:
    - Cập nhật `stock` và `cost_price` trong bảng `services`.
    - Tạo 1 phiếu chi `OUT` trong `cash_flow` (Dòng tiền thực chi).
    - Tạo 1 dòng nhật ký trong `inventory_logs` (Biến động hàng hóa).

### Bước 2: Bán hàng (Sale)
1. Khi thêm dịch vụ vào phòng (Folio), hệ thống tự động trừ `stock`.
2. Ghi nhật ký `SALE` vào `inventory_logs` kèm theo giá vốn tại thời điểm đó.
3. Tiền bán hàng sẽ nằm trong `booking_bill`, khi khách thanh toán sẽ được ghi nhận vào `cash_flow` dưới dạng `INCOME` (hoặc `IN` trong hệ thống mới).

### Bước 3: Báo cáo Lãi/Lỗ (P&L)
- **Doanh thu:** Tổng tiền thu từ việc bán dịch vụ.
- **Giá vốn (COGS):** Tổng `total_value` của các log loại `SALE` trong kỳ.
- **Lợi nhuận gộp:** `Doanh thu - Giá vốn`.
- **Dòng tiền thực tế:** Đối soát giữa tổng tiền chi nhập hàng trong `cash_flow` và tiền mặt thực tế tại quầy.

---

## 4. TỔNG KẾT ƯU ĐIỂM
1. **Minh bạch:** Mọi chai nước bán ra đều biết giá vốn là bao nhiêu, lời bao nhiêu.
2. **Chống thất thoát:** Nhân viên không thể "quên" nhập kho mà vẫn bán được hàng.
3. **Đơn giản:** Người dùng chỉ nhập 1 lần, hệ thống tự lo phần kế toán phức tạp đằng sau.

---

## 5. HÀM RPC (SERVER FUNCTIONS)

### A. `import_inventory` (Nhập kho)
- **Mục đích:** Xử lý logic nhập kho, tính giá vốn, ghi sổ cái, ghi log kho trong 1 transaction.
- **Tham số:** `service_id`, `qty_buy` (số lượng mua), `total_amount` (tổng tiền), `payment_method`.
- **Logic:**
  1. Quy đổi số lượng nhập ra đơn vị bán lẻ.
  2. Tính lại giá vốn bình quân (WAC).
  3. Cộng tồn kho.
  4. Ghi nhận chi phí vào bảng `cash_flow`.
  5. Ghi nhật ký vào `inventory_logs`.

### B. `register_service_usage` (Xuất bán)
- **Mục đích:** Ghi nhận việc khách sử dụng dịch vụ (Minibar/Dịch vụ).
- **Tham số:** `booking_id`, `service_id`, `quantity`.
- **Logic:**
  1. Kiểm tra tồn kho (Trigger chặn nếu thiếu).
  2. Thêm dòng vào `booking_services`.
  3. Trigger tự động trừ kho và ghi log `SALE`.
