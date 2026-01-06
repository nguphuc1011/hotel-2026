# BÁO CÁO TỔNG LỰC: KIỂM SOÁT CÔNG NỢ & ĐỒNG BỘ LEDGER
*Ngày báo cáo: 05/01/2026*
*Người thực hiện: Trae (AI Assistant)*

---

## 1. DANH SÁCH ĐIỂM CHẠM (UI/UX)

Dưới đây là các tệp tin (.tsx) có hiển thị hoặc thao tác trực tiếp với công nợ của khách hàng:

| Tệp tin (File) | Chức năng hiển thị/thao tác | Nguồn dữ liệu (Data Source) |
| :--- | :--- | :--- |
| `CheckInModal.tsx` | Hiển thị cảnh báo nợ cũ khi chọn khách hàng vào phòng. | `customers.balance` |
| `CheckOutModal.tsx` | Hiển thị nợ cũ, tính toán nợ mới nếu trả thiếu tiền, cảnh báo tổng nợ sau checkout. | `customers.balance` |
| `FolioModal.tsx` | Hiển thị số dư hiện tại, lịch sử giao dịch nợ (Ledger) và có nút "Thu nợ" nhanh. | `customers.balance`, `ledger` |
| `CustomerManagement.tsx` | Danh sách khách hàng kèm số dư công nợ (Nợ/Dư). | `customers.balance` |
| `CustomerDetail.tsx` | Chi tiết hồ sơ khách, lịch sử lưu trú và lịch sử dòng tiền (Ledger). | `customers.balance`, `ledger` |
| `CheckOutForm.tsx` | Form checkout nhanh (dùng cho mobile/đơn giản), gọi RPC handle_checkout. | Thông qua RPC |

---

## 2. LOGIC CẢNH BÁO & TÍNH TOÁN

### Cơ chế cảnh báo:
- **Quy ước số dư (`balance`):** 
  - `balance > 0`: Khách đang **NỢ** khách sạn.
  - `balance < 0`: Khách đang **DƯ** tiền (trả trước hoặc cọc dư).
- **Cảnh báo Check-in:** Khi chọn khách hàng, nếu `balance > 0`, hệ thống hiện popup/badge cảnh báo "Khách đang nợ: [Số tiền]".
- **Cảnh báo Check-out:** Nếu `Số tiền thực trả < Tổng thu thực tế`, hệ thống tính toán khoản nợ phát sinh và cộng dồn với nợ cũ để cảnh báo người dùng trước khi xác nhận.

### Công thức tính "Tổng thu thực tế" (Frontend):
Hệ thống tính toán tại `CheckOutModal.tsx` (sử dụng logic từ `pricing.ts`):

$$ \text{Tổng thu thực tế} = (\text{Tiền phòng} + \text{Tiền dịch vụ} + \text{Phụ thu} - \text{Giảm giá}) + \text{VAT} - \text{Tiền cọc} $$

- **Tiền phòng:** Tính dựa trên thời gian thực tế và loại hình thuê (Giờ/Ngày/Đêm).
- **Tiền dịch vụ:** Tổng các item trong `services_used`.
- **Phụ thu:** Gồm phụ thu check-in sớm, check-out muộn và phụ thu tùy chỉnh.
- **Tiền cọc:** Số tiền khách đã đưa lúc check-in hoặc nộp thêm trong quá trình ở.

---

## 3. ĐỒNG BỘ LEDGER (SỔ CÁI)

### Các hàm Service ghi Ledger:
Các hàm này nằm trong `src/services/hotel.ts`:
1. `recordLedger`: Ghi entry thủ công hoặc từ các nghiệp vụ khác qua RPC `handle_ledger_entry`.
2. `checkIn`: Gọi RPC `handle_check_in` (Ghi nhận tiền cọc vào Ledger nếu có).
3. `checkOut`: Gọi RPC `handle_checkout` (Ghi nhận doanh thu phòng, dịch vụ, phụ thu và khoản thanh toán thực tế vào Ledger).
4. `payDebt`: Gọi RPC `handle_debt_payment` (Ghi nhận phiếu thu nợ vào Ledger).

### Dấu vết `include_debt` còn sót lại:
Cột `include_debt` là tàn dư của logic cũ (lưu cờ nợ vào bảng `bookings`). Hiện tại đã được thay thế hoàn toàn bằng logic Ledger tự động dựa trên `customer_id`.
- **Vị trí còn "gọi hồn":**
  - `AI_MEMORY/db.md`: Tài liệu cấu trúc DB cũ.
  - `DATABASE_SCHEMA.md`: Tài liệu schema cũ.
  - `DOCS_DEBT_MANAGEMENT.md`: Tài liệu hướng dẫn cũ.
  - `scripts/check_db_status.ts`: Script kiểm tra DB vẫn đang check cột này.
  - Các file migration lịch sử: Cần giữ nguyên để đảm bảo tính toàn vẹn của repo nhưng không được tham chiếu trong code mới.

---

## 4. ĐỀ XUẤT QUY TRÌNH KHOA HỌC (Ledger-Centric)

Để đảm bảo tính nhất quán, luồng dữ liệu sẽ chảy như sau:

1. **Tìm kiếm KH:** Lấy `customers.balance` thông qua Hook `useCustomerBalance`. Nếu balance < 0, hiển thị cảnh báo đỏ ngay lập tức.
2. **Check-in:** Không gửi cờ nợ. Tiền cọc (nếu có) được ghi vào Ledger (Type: `DEPOSIT`).
3. **Folio:** Hiển thị `balance` thời gian thực (Nợ là số âm, màu đỏ). Mọi giao dịch tiền mặt đều được ghi vào Ledger.
4. **Checkout:** 
   - Tính toán tổng bill dựa trên thực tế.
   - So sánh `Thực trả` vs `Tổng bill`.
   - RPC `handle_checkout` sẽ tự động:
     - Ghi doanh thu (Revenue).
     - Ghi khoản thanh toán (Payment).
     - Tự động bù trừ với `DEPOSIT` đã thu.
     - Cập nhật `customers.balance` (Nợ mới sẽ làm balance giảm xuống, Dư mới sẽ làm balance tăng lên).

---

## KẾT LUẬN & HÀNH ĐỘNG TIẾP THEO:
1. ✅ Đã đảo ngược quy ước công nợ: **Nợ = Số âm (balance < 0)**, **Dư = Số dương (balance > 0)**.
2. ✅ Đã tạo và tích hợp Hook `useCustomerBalance` vào tất cả các điểm chạm UI (Check-in, Check-out, Folio, RoomCard, Quản lý KH).
3. ✅ Đã cập nhật màu sắc UI: Nợ (Đỏ/Rose), Dư (Xanh/Emerald) trên toàn hệ thống.
4. ✅ Đã chạy Migration xóa vĩnh viễn cột cũ và cập nhật RPC `handle_check_in`, `handle_checkout`.
5. ✅ Đã đồng bộ logic tính toán tại Check-out: Nợ cũ/mới đều được xử lý qua Ledger và cập nhật vào Balance theo quy ước âm/dương mới.

*Báo cáo kết thúc. Công nợ hiện tại đã được quản lý tập trung và nhất quán qua Ledger.*
