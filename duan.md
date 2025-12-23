LỘ TRÌNH TRIỂN KHAI DỰ ÁN HOTEL-2026
Tuyên ngôn: "Giao diện đơn giản cho Cô Chú - Sức mạnh AI bảo vệ từng đồng xu."

🏛 GIAI ĐOẠN 1: ĐỔ MÓNG (FOUNDATION) - Chúng ta đang ở đây
Mục tiêu: Xây dựng kho chứa dữ liệu (Database) và Trang cài đặt để nạp "Luật chơi" vào hệ thống.

[ ] 1.1. Database: Tạo các bảng SQL có tích hợp sẵn các cột cho AI (Thuế, Giọng nói, Chống gian lận).

[ ] 1.2. UI Cài đặt (Settings): Giao diện to, rõ, dễ nhập liệu các mốc giờ (Check-in, Check-out) và Quy tắc phụ thu.

🧠 GIAI ĐOẠN 2: LẮP RÁP "BỘ NÃO" (CORE LOGIC)
Mục tiêu: Viết các hàm tính toán tiền nong chính xác tuyệt đối, không giao diện.

[ ] 2.1. Logic Giá (Pricing Engine): Xử lý thuê Giờ (làm tròn), thuê Ngày (cộng ngày khi trễ), thuê Đêm (tự động).

[ ] 2.2. Logic Kho & Thuế: Tự động trừ kho khi bán. Tự động gắn nhãn thuế (Dịch vụ/Lưu trú) cho từng món.

📱 GIAI ĐOẠN 3: XÂY DỰNG "GƯƠNG MẶT" (OPERATIONS UI)
Mục tiêu: Các màn hình thao tác hàng ngày cho Lễ tân/Chủ.

[ ] 3.1. Dashboard: Sơ đồ phòng trực quan (Xanh/Đỏ/Vàng).

[ ] 3.2. Check-in Modal: Tự động gợi ý khách quen, tự chọn loại thuê Ngày/Đêm.

[ ] 3.3. Folio (Quản lý phòng): Vuốt ngang chọn dịch vụ, Badge số lượng, chốt tiền Real-time.

[ ] 3.4. Checkout & Invoice: Xuất hóa đơn, lưu vào lịch sử.

🤖 GIAI ĐOẠN 4: KÍCH HOẠT "SIÊU NĂNG LỰC" AI
Mục tiêu: Biến phần mềm thành Trợ lý thông minh.

[ ] 4.1. Thám tử AI: Quét Audit Logs, báo động đỏ khi thấy sửa giá/xóa phòng nghi vấn.

[ ] 4.2. Trợ lý Giọng nói: Tích hợp nút Micro để ra lệnh "Tính tiền phòng 101".

[ ] 4.3. OCR: Chụp ảnh CCCD tự điền thông tin.

📂 HỒ SƠ KỸ THUẬT CHI TIẾT - BƯỚC 1
(Dùng để đưa cho Trae thực hiện ngay bây giờ)

A. YÊU CẦU CƠ SỞ DỮ LIỆU (DATABASE SCHEMA)
Hệ quản trị: Supabase (PostgreSQL)

1. Bảng settings (Cấu hình hệ thống)

check_in_time, check_out_time (Time): Giờ chuẩn.

overnight_start, overnight_end (Time): Khung giờ đêm.

full_day_late_after (Time): Mốc trễ 18h tính thêm 1 ngày.

tax_config (JSONB): Cấu hình mức thuế 2026 (VD: { room: 5, service: 1.5 }). (Cột AI)

2. Bảng rooms (Danh sách phòng)

name, status, area.

prices (JSONB): { hourly, daily, overnight, next_hour }.

voice_alias (Text): Tên gọi phụ (VD: "Phòng trệt 1") để AI giọng nói nhận diện. (Cột AI)

3. Bảng services (Kho & Dịch vụ)

name, price, stock, unit, icon.

tax_type (Text): Phân loại 'service' (nước/mì) hoặc 'goods' để báo cáo thuế. (Cột AI)

keywords (Array Text): Từ khóa đồng nghĩa (VD: ["Coca", "Coke", "Nước ngọt đen"]) cho AI giọng nói. (Cột AI)

4. Bảng audit_logs (Nhật ký chống gian lận)

user_id, action, entity_id, old_value, new_value.

suspicion_score (Float): Điểm nghi vấn do AI chấm (0-100). (Cột AI)

Quy tắc bảo mật (RLS): Chỉ cho phép INSERT (Ghi), cấm tuyệt đối DELETE/UPDATE (Xóa/Sửa).

5. Bảng customers (Khách hàng)

name, phone, id_card.

ocr_data (JSONB): Dữ liệu thô từ ảnh chụp CCCD. (Cột AI)

B. YÊU CẦU GIAO DIỆN (UI SPECS) - TRANG CÀI ĐẶT
Đường dẫn: src/app/settings/page.tsx

1. Phong cách thiết kế (Visual Style)

Big & Bold: Font chữ tối thiểu 16px. Input cao 50px.

Grouped Layout: Chia thành các khối bo góc (giống Cài đặt trên iPhone).

2. Các khối chức năng (Sections)

Khối 1: Giờ giấc (Time Rules)

Dùng bộ chọn giờ (Time Picker) native của điện thoại.

Hiển thị rõ ràng: "Giờ nhận", "Giờ trả", "Bắt đầu đêm".

Khối 2: Quy tắc phụ thu (Surcharges)

Danh sách các mốc "Quá giờ" (Late Rules).

Nút "Thêm mốc" to, dễ bấm.

Khối 3: Cấu hình Thuế (Tax 2026)

Input nhập % thuế cho Lưu trú và Dịch vụ riêng biệt.

3. Logic Validate

Không cho phép nhập Giờ trả muộn hơn Giờ nhận (trong cùng 1 ngày logic).

Không cho phép bỏ trống các trường quan trọng.