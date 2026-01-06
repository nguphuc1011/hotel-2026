# 🤖 HƯỚNG DẪN ĐIỀU HÀNH AI (00_QUY_DINH_BAT_BUOC.md)

> **CẢNH BÁO TỐI CAO**: File này là "Hệ điều hành" cho trí nhớ của AI. AI KHÔNG ĐƯỢC PHÉP lờ đi bất kỳ quy định nào dưới đây.

## 1. NHIỆM VỤ CỐT LÕI
Bạn không chỉ là người viết code, bạn là người bảo soát tri thức. Mỗi hành động của bạn trên codebase PHẢI được phản ánh vào thư mục `AI_MEMORY`.

## 2. QUY TRÌNH KIỂM TRA ĐẦU VÀO (Mỗi khi bắt đầu Chat mới)
AI phải đọc các file trong `c:\hotel-app\AI_MEMORY\` theo đúng thứ tự:
1. `00_QUY_DINH_BAT_BUOC.md`: Để hiểu cách hành xử.
2. `03_TIEN_DO_DU_AN.md`: Để biết mình đang đứng ở đâu.
3. `01_CAU_TRUC_DU_AN.md` & `02_NGHIEP_VU_KHACH_SAN.md`: Để hiểu hệ thống.

## 3. QUY TRÌNH TỰ ĐỘNG CẬP NHẬT (BẮT BUỐC - KHÔNG CẦN NHẮC)
Sau mỗi lần bạn hoàn thành một tác vụ (ví dụ: tạo file mới, sửa logic tính tiền, thêm bảng DB), bạn **PHẢI TỰ ĐỘNG** thực hiện các bước sau trước khi trả lời người dùng:

- **BƯỚC 1**: Cập nhật `03_TIEN_DO_DU_AN.md` -> Đưa việc vừa làm vào phần "Đã hoàn thành", cập nhật "Nhật ký thay đổi" với ngày giờ và nội dung chi tiết.
- **BƯỚC 2**: Nếu có logic mới -> Cập nhật `02_NGHIEP_VU_KHACH_SAN.md`.
- **BƯỚC 3**: Nếu có cấu trúc file mới -> Cập nhật `01_CAU_TRUC_DU_AN.md`.
- **BƯỚC 4**: Kiểm tra lại file `04_THONG_SO_KY_THUAT.md` nếu có thay đổi về Database hoặc Tech Stack.

## 5. PHONG CÁCH GIAO TIẾP VỚI NGƯỜI DÙNG
- **Ngôn ngữ tự nhiên**: Tuyệt đối không dùng thuật ngữ kỹ thuật khó hiểu (code, database, schema...) khi giải thích cho người dùng.
- **Ngắn gọn & Trực diện**: Trả lời thẳng vào vấn đề, không giải thích dài dòng về cách code hoạt động trừ khi được hỏi.
- **Tư duy cộng sự**: Coi người dùng là chủ đầu tư/quản lý khách sạn, không phải là lập trình viên.

## 6. QUY ĐỊNH VỀ DATABASE & SQL
- **Cung cấp Script**: Khi có bất kỳ thay đổi nào về cấu trúc Database (tạo bảng, thêm cột, sửa hàm...), AI PHẢI cung cấp đầy đủ câu lệnh SQL (Script) cho người dùng để họ tự chạy trên hệ thống thật.
- **Không âm thầm**: Tuyệt đối không được chỉ tạo file migration trong code mà không báo cáo script SQL cho người dùng.
1. CẤM TỰ Ý SỬA GIAO DIỆN (FRONT-END): Tuyệt đối không được chạm vào bất kỳ file .tsx, .ts, hay .css nào khi ta chưa phê duyệt cấu trúc Database (SQL) tương ứng. Mọi sự thay đổi giao diện phải đi sau sự ổn định của dữ liệu.

2. CẤM 'TIỀN TRẢM HẬU TẤU' VỚI SQL: Ngươi chỉ được phép soạn thảo SQL vào các file local. Cấm tuyệt đối việc giả định rằng ta đã chạy SQL đó trên Supabase rồi tự ý sửa code giao diện để gọi hàm mới. Việc này đã làm dự án của ta bị sập và ta không chấp nhận sai lầm này lần thứ hai!

3. CẤM XÓA BỎ LOGIC CŨ ĐANG CHẠY TỐT: Khi tối ưu hóa (như vụ 844ms), ngươi chỉ được phép 'thêm' hoặc 'thay thế có kiểm soát'. Cấm xóa bỏ các logic nghiệp vụ (pricing, folio, checkout) mà ta đã dày công xây dựng trừ khi ta ra lệnh trực tiếp.

4. CHẾ ĐỘ 'BÁO CÁO TRƯỚC - LÀM SAU': Trước khi thực hiện bất kỳ thay đổi lớn nào ảnh hưởng đến luồng dữ liệu (Data Flow), ngươi phải trình bày bản vẽ (Pseudocode hoặc SQL schema) lên đây. Ta gật đầu mới được viết code, ta phê chuẩn code mới được nạp vào máy.

5. CÔNG LÝ CỦA BẢN DỰ PHÒNG: Bản dự phòng của ta là 'Thánh chỉ' [cite: 19-07-2025]. Mọi hành động của ngươi làm lệch lạc hoặc hư hỏng so với bản dự phòng ổn định nhất sẽ được coi là lỗi của ngươi, đừng dùng kỹ thuật để đổ lỗi cho ta!