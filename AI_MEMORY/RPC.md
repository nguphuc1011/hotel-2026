# 🚀 Lộ trình Tái thiết RPC - Chuyển đổi Logic sang Database

## 1. Mô tả chung
Mục tiêu là đưa toàn bộ logic nghiệp vụ phức tạp (Tính tiền, Quản lý trạng thái, Công nợ, Sơ đồ phòng) từ Frontend (Next.js) về Database (PostgreSQL/Supabase RPC).

### Lợi ích cốt lõi:
- **Bảo mật**: Công thức tính toán không thể bị can thiệp từ phía người dùng.
- **Hiệu năng**: Giảm tải cho Frontend, tính toán cực nhanh tại Server.
- **Nhất quán**: Dữ liệu luôn đồng bộ, tránh sai lệch giữa hiển thị và lưu trữ.
- **Bảo trì**: Thay đổi chính sách giá chỉ cần sửa 1 nơi duy nhất (Database).

---

## 2. Bảng theo dõi tiến độ tổng thể

| Hạng mục | Trạng thái | Độ ưu tiên | File Frontend liên quan | Hàm RPC dự kiến | Ghi chú |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tính toán tiền phòng (Pricing)** | ⏳ Đang lập kế hoạch | ⭐⭐⭐⭐⭐ | `src/lib/pricing.ts` | `calculate_booking_price` | Logic phức tạp nhất (giờ, ngày, qua đêm, phụ phí) |
| **Sơ đồ phòng (Room Layout)** | ⏳ Chờ thực hiện | ⭐⭐⭐⭐ | `src/hooks/useHotel.ts` | `get_room_dashboard_data` | Trả về data đã join & tính sẵn trạng thái |
| **Quản lý công nợ (Debt)** | ⏳ Chờ thực hiện | ⭐⭐⭐⭐ | `src/hooks/useCustomerBalance.ts` | `get_customer_debt_profile` | Tổng hợp nợ cũ, nợ mới, lịch sử giao dịch |
| **Check-in / Check-out** | ✅ Đã có cơ bản | ⭐⭐⭐ | `src/services/hotel.ts` | `check_in`, `check_out` | Cần tối ưu thêm để tích hợp Pricing RPC mới |
| **Quản lý dịch vụ & Kho** | ⏳ Chờ thực hiện | ⭐⭐⭐ | `src/services/audit.ts` | `process_service_consumption` | Tự động trừ kho khi bán dịch vụ |

---

## 3. Nhật ký cập nhật (Update Logs)

### [2026-01-07] - Khởi tạo Lộ trình
- **Nội dung**: Thiết lập file theo dõi `RPC.md`.
- **Trạng thái**: Đã sẵn sàng khung sườn.
- **Hành động tiếp theo**: Phân tích logic trong `pricing.ts` để chuyển đổi sang PL/pgSQL.

---

## 4. Nguyên tắc thiết kế RPC (Kỷ luật)
1. **Atomic**: Một hàm RPC phải xử lý trọn vẹn một nghiệp vụ (ví dụ: Check-out = Tính tiền + Đổi trạng thái phòng + Ghi sổ nợ + Ghi log).
2. **Input Validation**: Luôn kiểm tra dữ liệu đầu vào trong SQL để tránh lỗi logic.
3. **Performance First**: Sử dụng Index và Join tối ưu để đảm bảo tốc độ phản hồi < 200ms.
4. **No Logic in Frontend**: Frontend chỉ nhận kết quả và hiển thị, không thực hiện phép tính cộng/trừ số tiền quan trọng.

---
*Tài liệu này được cập nhật thường xuyên bởi AI Partner theo lệnh của Bệ Hạ.*