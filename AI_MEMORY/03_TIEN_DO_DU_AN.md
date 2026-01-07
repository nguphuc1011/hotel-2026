# 📈 TIẾN ĐỘ DỰ ÁN (03_TIEN_DO_DU_AN.md)

## 1. Đã hoàn thành
- [x] Hệ thống "Trí nhớ vĩnh cửu" v2.1 (Thư mục `AI_MEMORY`).
- [x] Fix logic gộp nợ cũ trong Folio và Check-in.
- [x] Đồng bộ hóa toàn bộ kiến thức dự án (Core Modules, Services, Security logic) vào AI_MEMORY.
- [x] Thiết kế Database cho hệ thống Ledger chuyên nghiệp (Ledger, Shifts, Payment Methods).
- [x] Triển khai logic nghiệp vụ tích hợp Ledger vào `HotelService`.
- [x] Nâng cấp hệ thống Quản lý Khách hàng: Thêm mới, Chi tiết khách hàng (Lịch sử ở & tiền), Phân loại VIP.
- [x] Chuẩn hóa giao diện Tab Cài đặt chung (Modern UI, Sticky Header, Icon integration).
- [x] Xây dựng giao diện Quản lý Ca (Shifts) và Báo cáo Sổ cái (Ledger UI).
- [x] Cập nhật nhãn giá phòng trong Quản lý phòng khớp với quy tắc tính block mới.
- [x] **Pricing Brain V2 (Single Source of Truth)**: Di chuyển toàn bộ logic tính giá sang RPC Database.
- [x] **Hoàn thiện luồng Checkout**: Tích hợp Giảm giá, Phụ phí và Thanh toán thiếu (Nợ) đồng bộ giữa Frontend và Database.

## 2. Đang thực hiện
- [ ] Tối ưu hóa hiệu năng và trải nghiệm người dùng trên các thiết bị di động.
- [ ] Xây dựng hệ thống báo cáo doanh thu theo tháng/năm chuyên sâu.

## 3. Nhật ký thay đổi
- **2026-01-07**:
    - **Sửa lỗi Runtime (UI Crash)**:
        - Khắc phục lỗi `ReferenceError: RefreshCw is not defined` tại trang Thu chi.
        - Đồng bộ hóa các thành phần UI với thư viện `lucide-react`.
    - **Sửa lỗi nghiêm trọng Công nợ (Điều 14.3)**:
        - Phát hiện và khắc phục lỗi `handle_checkout` ghi nhận doanh thu bằng 0 do tin vào cột dữ liệu cũ.
        - Hợp nhất `handle_checkout` với `Pricing Brain (calculate_booking_bill_v2)` để lấy doanh thu thực tế.
        - Đồng nhất quy ước dấu Balance trên toàn bộ tài liệu: **Số âm là Nợ, Số dương là Dư tiền**.
    - **Thanh trừng và Chuẩn hóa Hệ thống Checkout (Điều 11)**:
        - Xóa bỏ 6 phiên bản lỗi của hàm `handle_checkout` gây xung đột tính toán.
        - Cài đặt hàm `handle_checkout` duy nhất (Unified RPC) với logic tính toán chặt chẽ: `Balance = Balance - Revenue + Payment`.
        - Sửa lỗi nghiêm trọng `column "actual_check_out" does not exist` bằng cách đồng bộ hóa toàn bộ logic về cột `check_out_at` chuẩn của bảng `bookings`.
    - **Pricing Brain V2 (Single Source of Truth)**:
        - Chuyển toàn bộ logic tính giá phức tạp (Phụ phí sớm/muộn, Block giờ, Thuế, Nợ cũ, Tiền cọc) từ Frontend vào Database RPC (`calculate_booking_bill_v2`).
        - Loại bỏ lỗi double-counting (tính nợ 2 lần) bằng cách hợp nhất logic thanh toán trong `handle_checkout`.
        - Nâng cấp `FolioModal` & `CheckOutModal`: Hiển thị chi tiết hóa đơn minh bạch lấy trực tiếp từ kết quả RPC.
        - Hỗ trợ Giảm giá (`discount`) và Phụ phí thủ công ngay lúc checkout, đảm bảo doanh thu và công nợ khách hàng luôn chính xác.
    - **Chuẩn hóa giao diện Cài đặt**:
        - Phong cách Modern UI với hiệu ứng đổ bóng, bo góc và Sticky Header.
        - Cải tiến `TabButton` với hiệu ứng chuyển động `framer-motion`.
    - **Hoàn thiện hệ thống Tài chính**:
        - Xây dựng `FinanceManagement` tích hợp báo cáo Sổ cái (Ledger) thời gian thực.
        - Triển khai `ShiftHandoverModal` hỗ trợ quy trình Mở/Đóng ca và đối soát tiền mặt.
- **2026-01-05**: 
    - Chuyển đổi hệ thống tri thức sang `AI_MEMORY`.
    - Thiết kế và khởi tạo Database Ledger chuyên nghiệp.
    - Triển khai logic Ledger vào `HotelService`.
    - Nâng cấp Quản lý Khách hàng: Xem lịch sử ở và lịch sử tiền.
