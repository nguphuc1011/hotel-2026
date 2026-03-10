# TÀI LIỆU QUY ĐỊNH LOGIC TÍNH TIỀN PHÒNG (BILLING ENGINE V3)

**Ngày cập nhật:** 12/01/2026
**Trạng thái:** Đã triển khai (Production Ready)
**Hệ thống:** Billing Engine V3 (SQL-based)

---

## 1. CÁC LOẠI HÌNH THUÊ (RENTAL TYPES)

Hệ thống hỗ trợ 3 hình thức thuê chính với logic tính toán riêng biệt.

| Loại thuê | Mã (Code) | Mô tả cơ bản | Logic Phụ thu (Sớm/Muộn) |
| :--- | :--- | :--- | :--- |
| **Thuê Giờ** | `hourly` | Tính tiền theo block thời gian sử dụng. | **KHÔNG áp dụng**. (Khách thuê giờ trả muộn chỉ tính thêm giờ, không tính phụ thu check-out). |
| **Thuê Ngày** | `daily` | Tính theo đêm (Check-in 14h -> Check-out 12h hôm sau). | **CÓ áp dụng** dựa trên giờ Check-in/out thực tế so với quy định. |
| **Qua Đêm** | `overnight` | Tính giá ưu đãi cho khách vào muộn (Check-in sau 21h -> Check-out 12h hôm sau). | **CÓ áp dụng** nếu trả phòng muộn sau giờ quy định (thường là 12h). |

---

## 2. CẤU HÌNH & NÚT GẠT (SETTINGS & TOGGLES)

Các thông số này được lưu trong bảng `settings` (key=`config`) và có thể thay đổi trên giao diện mà không cần sửa code.

### A. Mốc Thời Gian (Time Thresholds)

| Tên Cấu Hình | Database Column | Giá trị mặc định | Giải thích |
| :--- | :--- | :--- | :--- |
| **Giờ nhận phòng chuẩn** | `check_in_time` | `14:00:00` | Mốc để tính phụ thu nhận phòng sớm (Early Check-in). |
| **Giờ trả phòng chuẩn** | `check_out_time` | `12:00:00` | Mốc để tính phụ thu trả phòng muộn (Late Check-out) cho khách Ngày. |
| **Giờ trả qua đêm** | `overnight_checkout_time` | `12:00:00` | Mốc để tính phụ thu trả phòng muộn cho khách Qua đêm. |
| **Giờ bắt đầu Qua đêm** | `overnight_start_time` | `21:00:00` | Giờ sớm nhất được phép chọn loại hình thuê Qua đêm (Logic UI). |

### B. Nút Gạt & Chức Năng (Toggles)

| Tên Nút Gạt | Database Column | Tác dụng |
| :--- | :--- | :--- |
| **Bật/Tắt Ân hạn (Vào)** | `grace_in_enabled` | Nếu Bật: Khách vào sớm X phút trong khoảng ân hạn sẽ KHÔNG bị tính phụ thu sớm. |
| **Bật/Tắt Ân hạn (Ra)** | `grace_out_enabled` | Nếu Bật: Khách ra trễ X phút trong khoảng ân hạn sẽ KHÔNG bị tính phụ thu muộn. |
| **Thời gian ân hạn** | `grace_minutes` | Số phút ân hạn (Ví dụ: 10, 15 phút). |
| **Trần giá giờ** | `hourly_ceiling_enabled` | Nếu Bật: Tổng tiền thuê giờ không bao giờ vượt quá giá thuê ngày của phòng đó. |
| **Phụ thu thêm người** | `extra_person_enabled` | Nút tổng. Nếu Tắt, toàn bộ logic thêm người sẽ bị vô hiệu hóa. |
| **Thuế VAT** | `vat_enabled` | Tính thêm % VAT vào tổng bill cuối cùng. |
| **Phí dịch vụ** | `service_fee_enabled` | Tính thêm % Phí dịch vụ vào tổng bill (trước VAT). |

---

## 3. CHI TIẾT LOGIC TÍNH TIỀN

### 3.1. Logic Thuê Giờ (`hourly`)

Công thức tính dựa trên cấu hình của **Hạng Phòng (`room_categories`)**:
1. **Giờ đầu tiên:** Giá cố định (`price_hourly`).
2. **Các giờ tiếp theo:** 
   - Hệ thống chia thời gian còn lại thành các block (ví dụ: block 1 giờ).
   - `Tiền = Giá giờ đầu + (Số block tiếp theo * Giá giờ tiếp theo)`.
3. **Làm tròn:** Dựa trên cấu hình `hourly_unit` (đơn vị làm tròn, ví dụ 60 phút).
4. **Quy tắc trần (Ceiling):** Nếu `Tổng tiền giờ > Giá ngày` VÀ `hourly_ceiling_enabled = true` -> `Tổng tiền = Giá ngày`.
5. **Lưu ý đặc biệt:** Loại thuê này **BỎ QUA** mọi quy tắc phụ thu Sớm/Muộn.

### 3.2. Logic Phụ Thu Sớm/Muộn (`daily` & `overnight`)

Hệ thống sử dụng cơ chế **Dynamic Rules** (Luật động) từ cấu hình.

**Quy trình xử lý:**
1. **Bước 1: Kiểm tra Ân hạn (Grace Period):**
   - Nếu thời gian quá lố <= `grace_minutes` (ví dụ 10 phút) -> **Miễn phí** (0đ).
2. **Bước 2: Đối chiếu Luật (Matching Rules):**
   - Hệ thống duyệt qua danh sách `surcharge_rules` (được lưu dạng JSON).
   - Ví dụ Rule: `12:00 - 15:00` tính `30%`.
   - Nếu giờ trả phòng thực tế rơi vào khoảng này -> Áp dụng % đó.
3. **Bước 3: Fallback (Nếu không khớp luật nào):**
   - Nếu quá giờ mà không nằm trong khung luật nào (ví dụ quá muộn sau 18h) -> Tính mặc định 1 ngày (100%) hoặc giá trị cấu hình mặc định.

**Ví dụ Cấu hình Luật (Minh họa):**
- **Trả muộn (Late Check-out):**
  - Từ `12:00` đến `15:00`: Phụ thu **30%** giá ngày.
  - Từ `15:00` đến `18:00`: Phụ thu **50%** giá ngày.
  - Sau `18:00`: Phụ thu **100%** (tính thêm 1 ngày).
- **Nhận sớm (Early Check-in):**
  - Từ `05:00` đến `09:00`: Phụ thu **50%** giá ngày.
  - Từ `09:00` đến `14:00`: Phụ thu **30%** giá ngày.

### 3.3. Logic Phụ Thu Thêm Người (Extra Person)

Đã chuyển sang cơ chế **Nhập tay (Manual Input)** hoàn toàn.

- **Dữ liệu đầu vào:** Lễ tân nhập số lượng vào ô "Người lớn thêm" (`extra_adults`) và "Trẻ em thêm" (`extra_children`) trên Booking.
- **Giá:** Lấy từ cấu hình Hạng phòng (`price_extra_adult`, `price_extra_child`).
- **Công thức:** 
  > `Tổng tiền = (Số người lớn thêm * Giá người lớn) + (Số trẻ em thêm * Giá trẻ em)`
- **Lưu ý:** Không còn tự động so sánh `số khách thực tế` vs `sức chứa tiêu chuẩn`.

---

## 4. QUY TRÌNH TÍNH TỔNG BILL (FLOW)

Thứ tự tính toán cuối cùng để ra số tiền khách phải trả:

1. **Tiền Phòng (Base Room Charge)** (bao gồm cả trần giá giờ nếu có).
2. **(+) Phụ thu Sớm/Muộn** (chỉ áp dụng cho `daily`/`overnight`).
3. **(+) Phụ thu Thêm người** (tính theo số lượng nhập tay).
4. **(+) Tiền Dịch vụ/Minibar** (Số lượng * Đơn giá tại thời điểm thêm).
5. **(-) Giảm giá (Discount)** (Trừ trực tiếp số tiền).
6. **(+) Phụ thu thủ công khác** (Custom Surcharge - nhập tay lý do bất kỳ).
7. **(=) Tổng tiền trước thuế (Subtotal)**.
8. **(+) Phí dịch vụ (Service Fee)** (% trên Subtotal).
9. **(+) Thuế VAT** (% trên (Subtotal + Service Fee)).
10. **(=) TỔNG CỘNG (Grand Total)**.
11. **(-) Đã cọc (Deposit)**.
12. **(=) CÒN LẠI CẦN THANH TOÁN**.

---

## 5. CÁC TRƯỜNG HỢP ĐẶC BIỆT CẦN LƯU Ý

1. **Thay đổi giá Hạng phòng:** Giá phòng được lấy tại thời điểm tính toán (lúc gọi hàm `get_booking_bill`). Nếu Admin đổi giá hạng phòng, bill chưa thanh toán sẽ cập nhật theo giá mới.
2. **Khách thuê giờ trả quá muộn:** Nếu khách thuê giờ nhưng ở lố sang ngày hôm sau hoặc quá số tiếng quy định, hệ thống vẫn tính theo công thức lũy tiến block giờ (trừ khi chạm trần giá ngày).
3. **Luật ưu tiên:** Nút tắt "Phụ thu tự động" (`auto_surcharge_enabled`) trong Hạng phòng có quyền lực cao nhất. Nếu tắt, mọi phụ thu Sớm/Muộn sẽ về 0 bất kể giờ giấc.
