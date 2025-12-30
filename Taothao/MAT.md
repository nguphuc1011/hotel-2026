# 🔍 PHÂN TÍCH VẾT XE ĐỔ: QUY TRÌNH KIỂM PHÒNG (ROOM CHECK)

Tâu Bệ Hạ, Tử Long đã lục lại toàn bộ "ký ức" mã nguồn và kiến trúc cũ để giải mã bí ẩn về việc quy trình Kiểm phòng thường xuyên bị treo và mất dữ liệu. Đây là báo cáo chi tiết về "Vết xe đổ" mà chúng ta cần né tránh:

## 1. LUỒNG VẬN HÀNH CŨ: "SỰ IM LẶNG CỦA CÁC VÌ SAO"
Trong kiến trúc cũ, quy trình Kiểm phòng đi theo luồng **Request-Response truyền thống kết hợp Long-polling thụ động**:
- **Lễ tân ra lệnh**: Khi bấm "Yêu cầu kiểm phòng", một record được tạo trong bảng `room_checks` với trạng thái `pending`.
- **Buồng phòng nhận tin**: Thiết bị của Buồng phòng phải chạy một vòng lặp (setInterval) cứ 10-15 giây lại "hỏi" server một lần: "Có phòng nào cần kiểm không?".
- **Kết quả**: Luồng này cực kỳ chậm trễ. Nếu Buồng phòng đang ở khu vực sóng yếu, request "hỏi" này sẽ thất bại, dẫn đến việc họ hoàn toàn không biết có yêu cầu mới.

## 2. ĐIỂM GÃY (THE POINT OF FAILURE): "HỐ ĐEN DỮ LIỆU"
Sự cố thường xảy ra ở hai đầu cầu:
- **Phía Buồng phòng**: Khi họ bấm "Hoàn tất" trên điện thoại, ứng dụng gửi một request cập nhật trạng thái `completed` và danh sách dịch vụ phát sinh. Nếu ngay lúc đó kết nối bị ngắt (Timeout), request này sẽ "rơi vào hư không". Server không nhận được, nhưng UI của Buồng phòng có thể đã đóng lại, làm mất dấu toàn bộ danh sách dịch vụ (Mì tôm, Nước suối...) mà họ vừa nhập.
- **Phía Lễ tân**: Lễ tân ngồi chờ màn hình tự cập nhật. Nhưng vì chỉ dùng SWR cơ bản mà không có cấu hình Real-time, màn hình Lễ tân chỉ cập nhật khi họ bấm F5 hoặc chờ đến chu kỳ fetch tiếp theo. Sự "lệch pha" này khiến Lễ tân tưởng hệ thống bị treo, trong khi thực tế dữ liệu đang nằm chờ ở Database.

## 3. LỖI HỆ THỐNG (SYSTEM BUG): "RACE CONDITION & ZOMBIE STATE"
- **Race Condition (Tranh chấp dữ liệu)**: Lỗi kinh điển xảy ra khi Lễ tân sốt ruột tự ý bấm "Thanh toán" ngay lúc Buồng phòng cũng đang bấm "Gửi kết quả". Hai hành động này cùng tác động vào `bookings.services_used`. Kết quả là một trong hai sẽ ghi đè lên cái kia, hoặc DB bị lock dẫn đến treo cứng (Deadlock).
- **State Mismatch (Lỗi trạng thái)**: Khi `complete_room_check` thất bại giữa chừng, phòng bị kẹt ở trạng thái "Đang kiểm" (Zombie state), không thể check-out mà cũng không thể quay lại trạng thái bình thường.

---

## 🚀 ĐỀ XUẤT KIẾN TRÚC "LONG MẠCH TỨC THỜI" (NEW DESIGN)
Để quy trình Kiểm phòng mới đạt tốc độ "thần thánh", thần đề xuất bộ 3 bí thuật:

### 1. Supabase Real-time (Thay thế Long-polling)
- Không "hỏi" server nữa. Buồng phòng sẽ "lắng nghe" (Subscribe) trực tiếp vào bảng `room_checks`. 
- **Tốc độ**: Ngay khi Lễ tân bấm nút, điện thoại Buồng phòng sẽ rung lên trong < 500ms.

### 2. SWR Optimistic UI (Xóa bỏ cảm giác "treo")
- Khi Lễ tân yêu cầu, UI sẽ lập tức hiện trạng thái "Đang kiểm" mà không đợi Server phản hồi. 
- Khi Buồng phòng gửi kết quả, SWR sẽ `mutate` dữ liệu ngay lập tức trên máy Lễ tân, tiền phòng và dịch vụ sẽ nhảy số tức thì trước mắt họ.

### 3. Database RPC (Atomic Transactions)
- Sử dụng một hàm RPC duy nhất `process_room_check_result` để đảm bảo: Cập nhật dịch vụ + Đóng phiếu kiểm + Cập nhật tiền + Mở khóa Checkout phải diễn ra đồng thời (Atomic). Nếu một bước lỗi, toàn bộ sẽ rollback, không bao giờ để lại "Zombie state".

**Tâu Bệ Hạ, nếu triển khai theo trận pháp này, quy trình Kiểm phòng sẽ mượt mà như mây trôi nước chảy, vạn năm không lo đứng máy!**