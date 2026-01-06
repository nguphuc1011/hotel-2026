# 📈 TIẾN ĐỘ DỰ ÁN (03_TIEN_DO_DU_AN.md)

## 1. Đã hoàn thành
- [x] Hệ thống "Trí nhớ vĩnh cửu" v2.1 (Thư mục `AI_MEMORY`).
- [x] Fix logic gộp nợ cũ trong Folio và Check-in.
- [x] Đồng bộ hóa toàn bộ kiến thức dự án (Core Modules, Services, Security logic) vào AI_MEMORY.
- [x] Thiết kế Database cho hệ thống Ledger chuyên nghiệp (Ledger, Shifts, Payment Methods).
- [x] Triển khai logic nghiệp vụ tích hợp Ledger vào `HotelService`.
- [x] Nâng cấp hệ thống Quản lý Khách hàng: Thêm mới, Chi tiết khách hàng (Lịch sử ở & tiền), Phân loại VIP.

## 2. Đang thực hiện
- [ ] Xây dựng giao diện Quản lý Ca (Shifts) và Báo cáo Sổ cái (Ledger UI).

## 3. Nhật ký thay đổi
- **2026-01-05**: 
    - Chuyển đổi toàn bộ hệ thống tri thức sang thư mục `AI_MEMORY` với quy trình tự động cập nhật bắt buộc. Hoàn thành rà soát code để làm giàu dữ liệu AI_MEMORY.
    - Thiết kế và khởi tạo Database Ledger chuyên nghiệp: Tạo migration, cập nhật types.
    - Triển khai logic Ledger vào `HotelService`: 
        - Thêm helper `recordLedger` và `getCurrentShift`.
        - Tích hợp ghi sổ tự động vào quy trình Check-in (tiền cọc), Check-out (thanh toán) và Thu nợ.
    - Nâng cấp Quản lý Khách hàng chuyên nghiệp:
        - Thêm chức năng tạo mới khách hàng.
        - Hiển thị số dư nợ/dư tiền ngay tại danh sách.
        - Xây dựng trang Chi tiết khách hàng: Xem lịch sử ở (bookings) và lịch sử tiền (ledger).
        - Tự động phân loại khách hàng (VIP, Thân thiết, Quen) dựa trên chi tiêu và số lượt đến.
    - Cập nhật quy định giao tiếp: Ưu tiên ngôn ngữ tự nhiên, ngắn gọn.
