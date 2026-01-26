# BÁO CÁO CẬP NHẬT CẤU TRÚC & LOGIC TÀI CHÍNH (BCTAM.MD)

## 1. Cấu trúc Database (Đã triển khai)

### 1.1. Bảng `master_transactions` (Alias của `cash_flow`)
Đã nâng cấp bảng `cash_flow` để quản lý toàn diện theo chuẩn Sổ cái trung tâm.
- **Các cột mới**:
  - `status` (text): Mặc định `completed`. Hỗ trợ `pending` (tranh chấp), `void` (hủy).
  - `transaction_type` (text): Phân loại nghiệp vụ (`ROOM`, `SERVICE`, `DEPOSIT`, `DEBT_COLLECTION`, `REFUND`).
  - `wallet_id` (text): Định danh quỹ bị tác động (FK tới `wallets`).

### 1.2. Bảng `wallets` (Hệ thống 5 Quỹ)
Đã tạo mới để quản lý số dư thời gian thực.
- **Danh sách quỹ**: `CASH`, `BANK`, `ESCROW` (Cọc), `RECEIVABLE` (Công nợ), `REVENUE` (Doanh thu).
- **Cơ chế**: Tự động cập nhật qua Trigger `trg_update_wallets` khi có giao dịch mới trong `cash_flow`.

### 1.3. Module Ca làm việc (`shifts` & `shift_reports`)
Đã tạo bảng phục vụ quy trình "Đếm tiền mù".
- **`shifts`**: Quản lý phiên làm việc của nhân viên (Giờ vào/ra, Tiền đầu ca).
- **`shift_reports`**: Lưu kết quả chốt ca.
  - `declared_cash`: Tiền nhân viên tự đếm.
  - `system_cash`: Tiền hệ thống tính toán (Start + Thu - Chi).
  - `variance`: Chênh lệch (Dương = Thừa, Âm = Thất thoát).

## 2. Các Ràng buộc (Constraints) Bảo vệ Dòng tiền
1.  **Immutable Audit (Bất biến)**:
    - Trigger `fn_prevent_modification` đang hoạt động trên `cash_flow` và `audit_logs`.
    - **Hành động bị cấm**: `UPDATE`, `DELETE`.
    - **Giải pháp**: Sai sót phải dùng bút toán đảo (Reversal Entry).
2.  **Role-based PIN**:
    - Hàm `process_checkout` bắt buộc kiểm tra `role` của nhân viên.
    - Chỉ `admin` hoặc `manager` được phép xác thực các giao dịch có `discount > 0`.

## 3. Logic "Mùi gian lận" & Đối soát
Hệ thống phát hiện gian lận thông qua 2 lớp rào chắn:

1.  **Lớp Ca làm việc (Blind Close)**:
    - Nhân viên không nhìn thấy số `system_cash` khi chốt ca.
    - Mọi chênh lệch (`variance`) được ghi vĩnh viễn vào `shift_reports`.
    - Quản lý có thể truy vấn báo cáo để tìm nhân viên thường xuyên bị lệch quỹ.

2.  **Lớp Giao dịch (Transaction Audit)**:
    - Mọi giao dịch Giảm giá/Hủy đều lưu rõ `verified_by_staff_id`.
    - Trigger bảo vệ đảm bảo không ai có thể "xóa dấu vết" sau khi đã thực hiện gian lận.

## 4. Trạng thái thực thi
- [x] Nâng cấp `cash_flow`.
- [x] Tạo bảng `wallets`.
- [x] Tạo bảng `shifts`, `shift_reports`.
- [x] Viết RPC `open_shift`, `close_shift`.
- [x] Viết Trigger đồng bộ `wallets`.

---
*Cập nhật lần cuối: 2026-01-22*
