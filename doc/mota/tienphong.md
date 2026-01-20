# BẢN MÔ TẢ CHI TIẾT LOGIC TÍNH TIỀN HỆ THỐNG (DỰA TRÊN DATABASE THỰC)

Tài liệu này mô tả chi tiết quy trình tính toán hóa đơn (Billing Engine) của hệ thống, được trích xuất trực tiếp từ các hàm lưu trữ (Stored Procedures) trong PostgreSQL: `calculate_booking_bill`, `fn_calculate_room_charge`, `fn_calculate_surcharge`, v.v.

---

## I. CÁC THÔNG SỐ CẤU HÌNH HỆ THỐNG (SETTINGS)

Hệ thống hoạt động dựa trên các "Nút gạt" và "Mốc thời gian" trong bảng `public.settings` (key = 'config'):

### 1. Nhóm Ân hạn (Grace Period)
- **Ân hạn nhận (`grace_in_enabled`)**: Cho phép khách nhận phòng sớm mà không tính thêm tiền/ngày.
- **Ân hạn trả (`grace_out_enabled`)**: Cho phép khách trả phòng muộn mà không tính thêm tiền/phụ phí.
- **Số phút ân hạn (`grace_minutes`)**: Khoảng thời gian miễn phí (Ví dụ: 15 phút).

### 2. Nhóm Thuê giờ
- **Đơn vị giờ (`hourly_unit`)**: Mặc định 60 phút/block.
- **Số giờ gói đầu (`base_hourly_limit`)**: Số giờ tối thiểu tính tiền gói đầu (thường là 1 hoặc 2 giờ).
- **Chặn trần giá ngày (`hourly_ceiling_enabled`)**: Nếu bật, tổng tiền giờ sẽ không vượt quá X% giá ngày.
- **Tỉ lệ chặn trần (`hourly_ceiling_percent`)**: Mặc định 100% (Tiền giờ tối đa bằng giá ngày).

### 3. Nhóm Thuê ngày & Qua đêm
- **Giờ nhận chuẩn (`check_in_time`)**: Mặc định 14:00.
- **Giờ trả chuẩn (`check_out_time`)**: Mặc định 12:00.
- **Giờ trả qua đêm (`overnight_checkout_time`)**: Giờ trả cố định cho khách thuê qua đêm (thường là 12:00).
- **Khung giờ Qua đêm (`overnight_start_time` - `overnight_end_time`)**: Ví dụ từ 22:00 đến 06:00 sáng hôm sau.

### 4. Nhóm Tự động chuyển đổi & Phụ thu
- **Tự động chuyển Qua đêm (`auto_overnight_switch`)**: Nếu khách nhận phòng trong khung giờ qua đêm, hệ thống tự động áp dụng giá Qua đêm thay vì giá Giờ/Ngày.
- **Tự động tính Ngày (Sớm) (`auto_full_day_early`)**: Nếu nhận phòng trước mốc `full_day_early_before` (mặc định 05:00), tính thêm 1 ngày phòng.
- **Tự động tính Ngày (Muộn) (`auto_full_day_late`)**: Nếu trả phòng sau mốc `full_day_late_after` (mặc định 18:00), tính thêm 1 ngày phòng.
- **Tự động tính phụ phí (`auto_surcharge_enabled`)**: Bật/Tắt tính tiền Nhận sớm/Trả muộn.

---

## II. QUY TRÌNH TÍNH TOÁN CHI TIẾT (5 BƯỚC)

Hệ thống tính toán theo thứ tự ưu tiên từ phòng -> phụ thu -> người thêm -> dịch vụ -> thuế/phí.

### BƯỚC 1: TÍNH TIỀN PHÒNG CHÍNH (`fn_calculate_room_charge`)

#### 1.1. Thuê theo Giờ (`hourly`)
- **Gói đầu**: Tính tròn số tiền `price_hourly` cho `base_hourly_limit` giờ đầu tiên.
- **Giờ tiếp theo**: 
  - Sau khi hết gói đầu + thời gian ân hạn (`grace_minutes`), mỗi block lẻ (dù chỉ 1 phút) sẽ được làm tròn lên 1 block (`hourly_unit`) và tính tiền theo giá `price_next_hour`.
  - **Chống vượt trần**: Nếu `hourly_ceiling_enabled` bật, tổng tiền giờ nếu vượt quá `price_daily * percent` sẽ tự động chuyển sang tính theo giá Ngày.

#### 1.2. Thuê Qua đêm (`overnight`)
- **Điều kiện**: Hạng phòng phải bật `overnight_enabled`.
- **Cơ chế**:
  - Nếu `auto_overnight_switch` bật và giờ nhận nằm trong khung (`overnight_start` - `overnight_end`), hệ thống áp dụng giá `price_overnight`.
  - Số đêm được tính bằng cách lấy (Ngày trả - Ngày nhận). Tối thiểu tính 1 đêm.
  - Nếu nhận phòng ngoài khung giờ qua đêm, hệ thống sẽ tự động chuyển sang tính giá Ngày (`price_daily`).

#### 1.3. Thuê theo Ngày (`daily`)
- **Số ngày gốc**: (Ngày trả - Ngày nhận). Tối thiểu 1 ngày.
- **Cộng thêm ngày (Sớm/Muộn)**:
  - **Nhận sớm**: Nếu `auto_full_day_early` bật và giờ nhận < `full_day_early_before` (05:00) -> Cộng thêm 1 ngày tiền phòng. (Áp dụng ân hạn nhận nếu có).
  - **Trả muộn**: Nếu `auto_full_day_late` bật và giờ trả > `full_day_late_after` (18:00) -> Cộng thêm 1 ngày tiền phòng. (Áp dụng ân hạn trả nếu có).

---

### BƯỚC 2: TÍNH PHỤ THU SỚM/MUỘN (`fn_calculate_surcharge`)

*Lưu ý: Không áp dụng phụ thu cho loại hình thuê Giờ.*

Dựa trên `surcharge_mode` tại Hạng phòng, hệ thống chọn 1 trong 2 cách:

#### 2.1. Cách 1: Tính theo Số tiền cố định (`amount`)
- Tính số phút chênh lệch so với giờ chuẩn (`check_in_time` / `check_out_time` / `overnight_checkout_time`).
- Trừ đi số phút ân hạn (`grace_minutes`).
- Làm tròn lên theo giờ (ví dụ lố 61 phút tính là 2 giờ).
- Tiền phụ thu = Số giờ lố x `hourly_surcharge_amount`.

#### 2.2. Cách 2: Tính theo Phần trăm (`percent`)
- Hệ thống quét danh sách `surcharge_rules` (JSON) để tìm khung thời gian tương ứng.
- **Trả muộn (Late)**: Tìm rule loại 'Late' có `from_minute` < phút_lố <= `to_minute`.
- **Nhận sớm (Early)**: Tìm rule loại 'Early' tương tự.
- Tiền phụ thu = `price_daily` x `% quy định`.

*Quy tắc loại trừ: Nếu khách đã bị cộng thêm 1 ngày phòng ở Bước 1 (do quá mốc 05:00 hoặc 18:00), hệ thống sẽ không tính thêm phụ thu ở Bước 2 nữa.*

---

### BƯỚC 3: PHỤ THU THÊM NGƯỜI (`fn_calculate_extra_person_charge`)
- **Điều kiện**: `extra_person_enabled` phải bật ở cả Cấu hình hệ thống và Hạng phòng.
- **Cơ chế**:
  - Tính số người lớn vượt quá `max_adults` x `price_extra_adult`.
  - Tính số trẻ em vượt quá `max_children` x `price_extra_child`.

---

### BƯỚC 4: TIỀN DỊCH VỤ (SERVICES)
- Tổng hợp từ bảng `booking_services`: `Số lượng` x `Giá tại thời điểm gọi đồ`.

---

### BƯỚC 5: ĐIỀU CHỈNH CUỐI & THUẾ/PHÍ (`fn_calculate_bill_adjustments`)

#### 5.1. Giảm giá & Phụ phí thủ công
- **Giảm giá (`discount_amount`)**: Trừ trực tiếp vào tổng tiền.
- **Phụ phí cộng thêm (`custom_surcharge`)**: Cộng trực tiếp (Dành cho các khoản phí phát sinh khác).

#### 5.2. Phí phục vụ (SVC)
- Nếu `service_fee_enabled` bật: `(Tổng sau giảm giá) * service_fee_percent`.

#### 5.3. Thuế VAT
- Nếu `vat_enabled` bật: `(Tổng sau giảm giá + Phí phục vụ) * vat_percent`.

---

## III. TỔNG KẾT CÔNG THỨC CUỐI CÙNG

```text
Tổng cộng = (Tiền phòng + Phụ thu Sớm/Muộn + Phụ thu người + Tiền dịch vụ) 
           - Giảm giá 
           + Phụ phí thủ công
           + Phí phục vụ (nếu có)
           + Thuế VAT (nếu có)

Số tiền cần thanh toán = Tổng cộng - Tiền đặt cọc (deposit_amount)
```

---
*Ghi chú: Mọi mốc thời gian đều được xử lý theo múi giờ `Asia/Ho_Chi_Minh`.*
