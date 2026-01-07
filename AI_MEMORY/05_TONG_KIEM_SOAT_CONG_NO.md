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

### Cơ chế cảnh báo (Quy ước chuẩn 2026):
- **Quy ước số dư (`balance`):** 
  - `balance < 0`: Khách đang **NỢ** khách sạn (Âm tiền).
  - `balance > 0`: Khách đang **DƯ** tiền/Cọc dư (Dương tiền).
- **Cảnh báo Check-in:** Khi chọn khách hàng, nếu `balance < 0`, hệ thống hiện popup/badge cảnh báo màu đỏ: "Khách đang nợ: [Số tiền]".
- **Cảnh báo Check-out:** Hệ thống lấy nợ cũ cộng dồn với chênh lệch hóa đơn hiện tại để đưa ra con số nợ mới chuẩn xác.

### Công thức tính "Tổng thu thực tế" (Database RPC):
Từ phiên bản 2.2, toàn bộ việc tính toán hóa đơn được thực hiện bởi RPC `calculate_booking_bill_v2` trong Database để đảm bảo Single Source of Truth:

$$ \text{Total\_Final} = (\text{Room\_Charge} + \text{Service\_Charge} + \text{Surcharge}_{Early/Late} + \text{Surcharge}_{Custom}) - \text{Discount} $$

---

## 3. ĐỒNG BỘ LEDGER & TỰ ĐỘNG HÓA SỐ DƯ (2026-01-08)

### Loại bỏ Double-Counting (Nhân đôi nợ):
Trước đây, hệ thống vừa cập nhật balance thủ công vừa ghi Ledger gây ra lỗi cộng dồn sai. 
**Giải pháp mới:** 
1. RPC `handle_checkout` CHỈ thực hiện ghi chép các bút toán vào Ledger.
2. Trigger `fn_sync_customer_balance` tự động theo dõi bảng Ledger và cập nhật `customers.balance` theo thời gian thực.

### Luồng ghi chép chuẩn:
- **Tiền phòng/Dịch vụ/Phụ phí:** Ghi `type = 'REVENUE'` (làm GIẢM balance - tăng nợ).
- **Thanh toán của khách:** Ghi `type = 'PAYMENT'` (làm TĂNG balance - giảm nợ).
- **Giảm giá (Discount):** Ghi `type = 'EXPENSE'`, `category = 'DISCOUNT'` (làm TĂNG balance - giảm nợ).

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
