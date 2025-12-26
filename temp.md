# SUPREME TECHNICAL SPECIFICATION: MODAL FOLIO (NEXT.JS REPLICATION)

Bản đặc tả này cung cấp chi tiết tuyệt đối về Giao diện, Chức năng và Logic của Modal Folio (Chi tiết phòng & Thanh toán) để tái lập hoàn hảo sang dự án Next.js.

---

## 1. CẤU TRÚC TỔNG THỂ & LAYOUT (STRUCTURAL DESIGN)

### A. Quy chuẩn hiển thị (Viewport & Containers)
- **Mobile First:** Mặc định tràn toàn màn hình (`h-full w-full`).
- **PC Protection:** Trên màn hình lớn (`md:`), Modal nằm giữa, `max-w-[600px]`, chiều cao tối đa `92vh`, bo góc cực lớn `rounded-[3rem]`.
- **Hiệu ứng mở:** Sử dụng Animation `slideUp` (trượt từ dưới lên) với `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Backdrop:** Phông nền đen mờ `bg-black/60` với hiệu ứng `backdrop-blur-sm`.

### B. Phân rã 3 vùng chính (Modular Sections)
1. **Header (Cố định):** Chứa thông tin phòng và loại khách.
2. **Body (Cuộn):** Chứa Action Grid, Hero Card, Service Search, Catalog, và Service List.
3. **Footer (Cố định):** Chứa nút hành động chính (Thanh toán hoặc Lưu).

---

## 2. CHI TIẾT TỪNG THÀNH PHẦN GIAO DIỆN (COMPONENTS)

### 2.1. Header Section
- **Vị trí:** `sticky top-0`, `bg-white`, `border-b`.
- **Thành phần:**
    - Tiêu đề: `Phòng [Tên Phòng]` (font-black, size 18px, uppercase).
    - Sub-title: `KHÁCH GIỜ` hoặc `KHÁCH NGÀY` (màu blue-600, font-black, size 12px, tracking-[0.2em]).
    - Nút đóng (X): Hình tròn, `bg-slate-100`, chỉ hiện trên PC.

### 2.2. Quick Action Grid (Bảng 5 nút chức năng)
- **Layout:** Grid 5 cột, khoảng cách `gap-3`.
- **Nội dung:** 
    1. **Đổi phòng:** Icon `fa-exchange-alt`.
    2. **Sửa:** Icon `fa-pen` (Sửa giờ vào, loại thuê).
    3. **In:** Icon `fa-print` (In hóa đơn tạm tính).
    4. **Cọc:** Icon `fa-wallet` (Thêm tiền tạm thu/đặt cọc).
    5. **Hủy:** Icon `fa-trash-alt` (Màu đỏ `rose-500`, xóa booking).
- **Style:** Mỗi nút gồm 1 vòng tròn `w-50px` chứa icon + label chữ nhỏ bên dưới.

### 2.3. Hero Summary Card (Trái tim của Folio)
- **Background:** `bg-indigo-700`, `rounded-[2.5rem]`, bóng đổ `shadow-2xl`.
- **Số dư (Balance):** Hiển thị lớn nhất `text-[44px]`, font-black.
- **Badge thông tin:** 
    - Khách hàng: `fa-user-circle` + Tên khách (rút gọn nếu quá dài).
    - Thời gian ở: `fa-clock` + "Ở: [Thời gian]" (Cập nhật tự động mỗi phút).
- **Vùng mở rộng (Expandable Detail):** Khi bấm vào Card, vùng này hiện ra (Animation `expandIn`):
    - **Giờ vào:** Hiển thị Giờ:Phút và Ngày/Tháng.
    - **Tiền phòng:** Hiển thị tổng tiền và công thức (VD: 2 giờ).
    - **Tiền dịch vụ:** Tổng tiền các món đã chọn.
    - **Tiền cọc:** Hiển thị số âm (VD: -50.000đ), màu `emerald-300`.
    - **Ghi chú:** 2 box ghi chú (Khách hàng & Phòng) với nút "Sửa" nhanh.

### 2.4. Quản lý Dịch vụ (Service Management)
- **Ô tìm kiếm:** `h-14`, `pl-12`, `bg-slate-50`, icon kính lúp bên trái.
- **Catalog (Danh mục món):**
    - Layout: Cuộn ngang (`overflow-x-auto`), hỗ trợ kéo thả (Drag scroll) trên PC.
    - Card món: Hình chữ nhật đứng, bo góc lớn, icon đoán theo tên (AI Guess), giá tiền màu xanh.
    - **Badge số lượng:** Khi thêm món, hiện badge đỏ `+1` ở góc card món trong catalog (Animation `bounce`).
- **Used Services (Món đã chọn):**
    - Thiết kế dạng Accordion (có thể thu gọn).
    - Header hiện tổng số món (Badge indigo).
    - Danh sách món: Mỗi dòng gồm Số lượng (x2), Tên món, Giá, Tổng tiền, và Bộ tăng giảm (+/-).

### 2.5. Nhật ký hệ thống (System Logs)
- Hiển thị cuối cùng, màu xám nhạt.
- Ghi lại mọi hành động: Ai thêm món gì, lúc mấy giờ, sửa ghi chú gì.

---

## 3. NÚT HÀNH ĐỘNG CHÍNH (THE PRIMARY ACTION BUTTON) - CỰC KỲ QUAN TRỌNG

Đây là thành phần có logic thay đổi trạng thái dựa trên dữ liệu tạm thời (`tempServices`).

### A. Trạng thái "THANH TOÁN" (Mặc định)
- **Hiển thị:** Màu đỏ `bg-rose-600`, text "THANH TOÁN", icon `fa-check-circle`.
- **Điều kiện:** Khi danh sách dịch vụ hiện tại trùng khớp hoàn toàn với dữ liệu đã lưu trong Database.
- **Hành động:** Xác nhận thanh toán -> Chốt bill -> Chuyển phòng sang trạng thái Trống/Dọn dẹp.

### B. Trạng thái "LƯU CẬP NHẬT" (Dynamic Save)
- **Vị trí:** Nút thanh toán sẽ **biến đổi trực tiếp** (Transform) sang nút này.
- **Hiển thị:** 
    - Màu sắc: Đổi sang xanh tím `bg-indigo-600`.
    - Hiệu ứng: Chớp tắt nhẹ `animate-pulse` để thu hút sự chú ý.
    - Text: "LƯU CẬP NHẬT".
    - Icon: `fa-save`.
- **Điều kiện xuất hiện:** Ngay khi người dùng thực hiện bất kỳ thay đổi nào trên danh sách dịch vụ (Thêm món mới từ Catalog, bấm nút + hoặc - trên món đã chọn).
- **Logic So sánh (Diff):** 
    - Trong khi nút "LƯU CẬP NHẬT" chưa được bấm, số tiền trên Balance sẽ hiển thị dạng: `[Tiền cũ] + [Số tiền chênh lệch nhấp nháy]`.
    - Các món có thay đổi số lượng sẽ hiện Badge `+1` hoặc `-1` bên cạnh tên món.
- **Hành động:** Khi bấm, hệ thống so sánh `tempServices` với `savedServices`, ghi nhật ký (log) các món thay đổi, cập nhật Database, sau đó trả nút về trạng thái "THANH TOÁN".

---

## 4. LOGIC TÍNH TIỀN (PRICING LOGIC)

Cần tái lập chính xác các quy tắc sau vào code Next.js:
1. **Dữ liệu nguồn:** Toàn bộ mốc giờ (`checkIn`, `checkOut`, `overnight`, `lateRules`) PHẢI đọc từ `data.settings.timeRules`. Không hardcode.
2. **Ân hạn 15 phút (Grace Period):** 
   - Nếu số phút lẻ `<= 15`: Không tính thêm giờ.
   - Nếu số phút lẻ `> 15`: Tính tròn lên 1 giờ (Dùng `Math.ceil`).
3. **Giá qua đêm (Overnight):**
   - Chỉ áp dụng nếu: Giờ vào nằm trong khung `overnight.start` đến `overnight.end` VÀ phòng đó có bật `enableOvernight: true`.
4. **Phụ thu tự động (Auto Surcharge):**
   - Chỉ tính nếu `enableAutoSurcharge: true` trong cài đặt.
   - Trễ giờ trả phòng: Nếu sau mốc `fullDayLateAfter`, tự động tính thêm 1 ngày tiền phòng.

---

## 5. LUỒNG DỮ LIỆU (DATA FLOW)

1. **Khởi tạo:** Clone `session.services` sang `tempServices`.
2. **Thao tác:** Người dùng sửa `tempServices` -> UI cập nhật real-time -> Nút biến thành "LƯU CẬP NHẬT".
3. **Lưu trữ:** Bấm "LƯU CẬP NHẬT" -> Ghi đè `tempServices` vào `session.services` -> Lưu DB.
4. **Kết thúc:** Bấm "THANH TOÁN" -> Chốt bill vĩnh viễn.

*Lưu ý cho Trae: Luôn đảm bảo Zero-Deletion Policy - giữ lại toàn bộ các trường dữ liệu phụ (note, badge, logs) khi cập nhật giao diện.*
