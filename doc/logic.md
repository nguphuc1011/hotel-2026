# ⚖️ HIẾN PHÁP VẬN HÀNH (logic.md) - PHIÊN BẢN V2 (TINH KHIẾT)

> **Trạng thái:** Tuân thủ Quân lệnh tối cao - Chờ phê duyệt logic.
> **Nguyên tắc vàng:** Toàn bộ logic tính toán nằm tại Database (RPC), Frontend chỉ hiển thị.

## 1. Trụ cột A: Thuê GIỜ (Cơ chế Block linh hoạt)
Tính toán dựa trên các gói thời gian định sẵn trong `room_categories`.
- **Công thức:** `Tổng tiền = base_price + (Số block vượt quá * step_price)`.
- **Cách tính Số block vượt quá:** Làm tròn lên (ceil) của: `(Tổng phút ở - base_time) / step_time`.
- **Lưu ý đặc biệt:** 
  - KHÔNG áp dụng các mốc trả muộn 12h, 14h của khách ngày vào đây.
  - Khách vào giờ nào tính từ giờ đó, không quan tâm mốc check-out chuẩn của hệ thống.

## 2. Trụ cột B: Thuê NGÀY/ĐÊM (Phụ thu trả muộn linh hoạt)
Áp dụng khi khách trả phòng muộn so với `check_out_time` (mặc định 12:00).
- **Cơ chế chọn cách tính:** Hệ thống kiểm tra `surcharge_mode` trong Settings:
  - **Cách 1 (Theo %)**: Dựa trên bảng % quy định trong Settings (Ví dụ: muộn 2h phụ thu 30%).
  - **Cách 2 (Theo số tiền)**: `Phụ thu = (Số giờ muộn * hourly_surcharge_amount)` của hạng phòng đó.
- **Ngưỡng nhảy ngày (Late Check-out Limit)**:
  - Nếu giờ trả phòng thực tế vượt quá `late_checkout_limit` (Ví dụ: sau 18:00).
  - Hệ thống **tự động hủy** toàn bộ phụ thu lẻ.
  - Hệ thống **tự động cộng thêm tròn 01 ngày** tiền phòng vào hóa đơn.

## 3. Trụ cột C: Thuê ĐẾN SỚM (Early Check-in)
Áp dụng khi khách nhận phòng sớm hơn `check_in_time` (mặc định 14:00).
- **Cách tính**: Tương tự trả muộn, tính theo % hoặc theo số tiền/giờ dựa vào `surcharge_mode`.
- **Mốc tính thêm ngày khi đến sớm (Early Check-in Limit)**:
  - Nếu khách đến trước `early_checkin_limit` (Ví dụ: trước 05:00 sáng).
  - Hệ thống **tự động tính tròn thêm 01 ngày** tiền phòng.

## 4. Trụ cột D: Vận hành & Bảo mật
- **Chốt ca (Night Audit)**:
  - Thực hiện vào mốc `night_audit_hour` (Ví dụ: 00:00).
  - Tổng hợp toàn bộ doanh thu thực tế từ các hóa đơn đã thanh toán trong ngày.
- **Doanh thu dự kiến (Expected Revenue)**:
  - Dùng chung mốc `night_audit_hour` nhưng là một kết quả tách biệt.
  - Tính toán tổng số tiền (Tiền phòng tính đến hiện tại + Dịch vụ) của tất cả các phòng đang có khách (In-house).
- **Quyền hạn sửa giá**:
  - Chỉ tài khoản có Role `Admin` hoặc `Manager` mới có quyền "Sửa giá thủ công".
  - Khi thực hiện, hệ thống **bắt buộc** yêu cầu nhập lý do.
  - Mọi dữ liệu (Giá cũ, Giá mới, Người sửa, Lý do) phải được ghi lại vào bảng `transactions` (Audit Log).
- **VAT & In Bill**:
  - Tự động cộng % VAT vào tổng thanh toán nếu `enable_vat` được bật.
  - Chỉ cho phép in hóa đơn nếu `enable_print_bill` được bật.
