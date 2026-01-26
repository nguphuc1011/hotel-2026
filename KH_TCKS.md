# KẾ HOẠCH CHI TIẾT CẢI TỔ HỆ THỐNG TÀI CHÍNH (KH_TCKS)

Bản kế hoạch này cụ thể hóa các bước để nâng cấp hệ thống tài chính 1HOTEL2 lên tiêu chuẩn "Bất biến & Minh bạch", tuân thủ nghiêm ngặt [rule.md](file:///c:/1hotel2/doc/rule.md) và [ketoan.md](file:///c:/1hotel2/doc/ketoan.md).

## I. MỤC TIÊU CỐT LÕI
1. **Chống gian lận tuyệt đối**: Không thể xóa/sửa lịch sử tài chính.
2. **Tách bạch dòng tiền**: Phân định rõ ràng Tiền mặt (Cash), Ngân hàng (Bank), và Doanh thu sổ sách.
3. **Cưỡng chế quyền hạn**: Mọi hành động nhạy cảm (Giảm giá, Hủy bill) phải được Backend kiểm tra quyền (Role-based).

## II. QUY TẮC THỰC THI (BẮT BUỘC)
Để đảm bảo sự an toàn tuyệt đối cho hệ thống, mọi hành động cải tổ phải tuân thủ các thiết quân luật sau:

1. **Dữ liệu thật là tối thượng**: 
    - Tuyệt đối chỉ dựa trên cấu trúc và dữ liệu lấy trực tiếp từ Database (thông qua `information_schema` hoặc truy vấn trực tiếp).
    - Cấm tuyệt đối việc suy đoán dựa trên các file `.sql` có sẵn trong mã nguồn tại local (vì có thể đã cũ hoặc chỉ là bản nháp).
2. **Kiểm tra đa lớp (Double-Check)**:
    - Trước khi thực hiện bất kỳ lệnh `ALTER` hoặc `CREATE OR REPLACE` nào, phải kiểm tra kỹ các đối tượng liên quan để tránh xung đột, dư thừa hoặc trùng lặp logic.
    - Đảm bảo các thay đổi không gây ảnh hưởng đến các chức năng không liên quan (Side effects).
3. **Tính cô lập (Isolation)**:
    - Mọi thay đổi về logic phải được đóng gói trong các RPC hoặc Trigger mới/cập nhật, không làm thay đổi luồng hoạt động của các module khác trừ khi thực sự cần thiết.

## III. CHI TIẾT CÁC BƯỚC THỰC HIỆN

### Bước 1: Gia cố Cấu trúc Dữ liệu (Database Schema)
- **Bảng `cash_flow`**:
    - Thêm cột `is_reversal` (boolean): Đánh dấu các bút toán đảo (hoàn tiền/hủy).
    - Thêm cột `is_internal` (boolean): Đánh dấu các khoản luân chuyển nội bộ (không tính vào doanh thu).
    - Thêm cột `payment_method_code` (LOWER case): `cash`, `bank`, `momo`, `vnpay`.
- **Bảng `audit_logs`**:
    - Gia cố cột `explanation` để lưu trữ JSON chi tiết các bước tính toán bill tại thời điểm checkout.

### Bước 2: Siết chặt Logic Backend (RPC Functions)
- **Hàm `calculate_booking_bill`**:
    - Phải là nguồn sự thật duy nhất cho mọi con số.
    - Cập nhật để tính toán chính xác cả phần nợ cũ của khách hàng nếu có.
- **Hàm `process_checkout`**:
    - **Kiểm tra quyền (Security)**: Backend sẽ tra cứu `staff_id` để xác định role. Nếu có `p_discount > 0`, chỉ cho phép nếu role là `manager` hoặc `admin`.
    - **Tính toán lại**: Không tin tưởng con số từ Frontend gửi lên. Backend tự gọi `calculate_booking_bill` để lấy `total_amount`.
    - **Nguyên tắc Bất biến**: Nếu khách trả thừa tiền và muốn hoàn lại, hệ thống không sửa số tiền đã thu mà tạo một dòng `OUT` trong `cash_flow` với loại `REVERSAL`.

### Bước 3: Cơ chế Bảo mật & Audit
- **Trigger Chặn Xóa/Sửa**:
    - Thiết lập Trigger trên bảng `cash_flow` và `audit_logs`. 
    - Bất kỳ lệnh `DELETE` hoặc `UPDATE` (trừ cập nhật trạng thái do hệ thống) sẽ bị từ chối ngay lập tức ở mức DB.
- **Role-based PIN**:
    - Frontend gửi mã PIN kèm theo. Backend xác thực mã PIN và quyền hạn tương ứng với hành động.

### Bước 4: Báo cáo & Đối soát (Frontend)
- **Màn hình Dòng tiền**:
    - Bổ sung bộ lọc theo `payment_method_code`.
    - Tách biệt báo cáo "Thực thu" (Tiền vào túi) và "Doanh thu" (Số tiền trên hóa đơn).
- **Màn hình Checkout**:
    - Hiển thị rõ ràng bảng kê chi tiết (Audit Trail) trước khi xác nhận thanh toán.

## IV. LỘ TRÌNH TRIỂN KHAI (Dự kiến)
1. **Ngày 1**: Cập nhật Schema DB và tạo các Trigger bảo mật.
2. **Ngày 2**: Viết lại hàm `process_checkout` và `calculate_booking_bill` theo logic mới.
3. **Ngày 3**: Tích hợp kiểm tra quyền Role-based tại Backend.
4. **Ngày 4**: Cập nhật UI Frontend để hiển thị dữ liệu đối soát mới.

---
*Ghi chú: Vụ việc "Pending Service" đã được loại bỏ theo yêu cầu của Bệ Hạ để tối giản quy trình vận hành.*