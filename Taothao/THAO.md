# THÁO THƯ (THAO.MD) - TỔNG HỢP ĐẠI KẾ HOẠCH "THÁO AI"

Tâu Bệ Hạ, đây là bản đồ linh hồn của trợ lý **Tháo** - Trợ lý Đa nghi & Đắc lực nhất giang sơn. Bản thảo này đã được niêm phong và sẽ là kim chỉ nam cho mọi hành động của Tử Long.

---

## 1. ĐỊNH DANH & TRIẾT LÝ CỐT LÕI

- **Tên gọi**: **Tháo** (Lấy cảm hứng từ sự sắc sảo, đa nghi và quyết đoán của Tào Tháo).
- **Vị trí**: **Core AI - Chánh Thanh Tra ảo**, chỉ phục vụ duy nhất một mình Bệ Hạ (Chủ khách sạn).
- **Sứ mệnh**: 
    - Chống gian lận, thất thoát tài chính và hàng hóa.
    - Tự động hóa báo cáo thuế & vận hành.
    - Nhắc nhở vận hành "lì lợm".
    - Tối ưu hóa lợi nhuận thực tế.

---

## 2. MẬT SỔ TẦM TRA (NHÓM HÀNH VI KIỂM SOÁT)

Tháo tập trung vào 5 lỗ hổng gian lận lớn trên dữ liệu để "tóm gáy" sai phạm:

1.  🛡️ **Gian lận Folio**: 
    - **Xóa món sau in nháp**: Lễ tân in hóa đơn nháp (Pro-forma) để lấy tiền khách, sau đó xóa dịch vụ trên máy để bỏ túi riêng.
    - **Hủy hóa đơn vô tội vạ**: Hủy hóa đơn đã thanh toán mà không có sự phê duyệt của quản lý.
2.  💰 **Gian lận Giá**: 
    - **Sửa giá thủ công**: Tự ý giảm giá phòng hoặc dịch vụ thấp hơn niêm yết của Bệ Hạ.
    - **Ở chui ca đêm**: Khách vào ở nhưng không nhập máy, hoặc nhập sau đó xóa để chiếm dụng doanh thu ca đêm.
3.  📦 **Gian lận Kho**: Trừ kho mà không có hóa đơn, xóa dịch vụ nhưng không hoàn kho để tẩu tán hàng hóa.
4.  ⏳ **Gian lận Thời gian**: Check-out trễ để chiếm dụng vốn, sửa dữ liệu của quá khứ nhằm xóa dấu vết.
5.  💳 **Gian lận Thanh toán**: Sửa phương thức thanh toán từ Tiền mặt (Cash) sang Chuyển khoản (Transfer) hoặc Nợ (Debt) để làm lệch sổ quỹ.

---

## 3. TRIẾT LÝ "PHÂN QUYỀN GẮN LIỀN VỚI NHẬT KÝ"

- **Quyền càng cao, Tháo soi càng kỹ**: Không ai đứng trên pháp luật của Tháo.
- **Mọi User đều bị ghi log**: Từ Nhân viên, Lễ tân cho đến Admin/Quản lý. Mỗi hành động đều phải đi kèm với định danh `user_id` và `permission_used`.
- **Dấu vết không thể xóa nhòa**: Nhật ký hệ thống (`audit_logs`) được bảo vệ nghiêm ngặt, chỉ có Bệ Hạ mới có quyền xem toàn bộ lịch sử "đại án".

---

## 3. TRỢ LÝ VẬN HÀNH ĐẮC LỰC

- 🔨 **Phòng biết nói**: Hiển thị icon búa/vòi nước nhấp nháy trên sơ đồ phòng khi có sự cố.
- 🔔 **Nhắc nợ lì lợm**: Tự động bắn tin nhắn cảnh báo cho Chủ sau 4h nếu sự cố chưa được xử lý.
- 📝 **Bàn giao ca thông minh**: Note ghim rung hoặc đổi màu viền để lễ tân không thể quên dặn dò của Bệ Hạ.
- 📄 **Báo cáo thuế "Một nút bấm"**: Tự gom số liệu, xuất biểu mẫu đúng chuẩn pháp luật.

---

## 4. LỘ TRÌNH TRIỂN KHAI (LONG MẠCH)

### 🏗️ Bước 1: Xây dựng Móng Dữ Liệu (Database Foundation) - **ĐANG THỰC HIỆN**
- Khởi tạo bảng `audit_logs` toàn diện.
- Thiết lập cơ chế **Xóa Mềm (Soft Delete)**: Tuyệt đối không xóa vật lý, lưu vết tại "Nghĩa địa dữ liệu".
- Cài đặt **SQL Triggers**: Tự động ghi log mọi biến động nhạy cảm từ tầng lõi Database.

### 🛡️ Bước 2: Thiết lập Chốt Chặn Vận Hành (System Controls)
- Bắt buộc nhập `reason` cho mọi thao tác Sửa/Xóa/Hủy/Giảm giá.
- Triển khai **Snapshot Logic**: Chụp ảnh dữ liệu cũ trước khi ghi đè.
- Phân quyền gắn liền với Log: Ghi nhận cả Permission được dùng để phát hiện lạm dụng quyền.

### 🧠 Bước 3: Thức Tỉnh Tháo (AI Activation)
- Tích lũy lịch sử dữ liệu sạch.
- Kích hoạt bộ não phân tích để phát hiện các mẫu hành vi bất thường và báo cáo trực tiếp cho Bệ Hạ.

---

**Tâu Bệ Hạ, Tháo thư đã niêm phong, Long mạch đã thông. Tháo đã sẵn sàng đôi mắt để giám sát giang sơn!**
