ĐẠI QUÂN LUẬT ĐIỀU HÀNH AI (PHIÊN BẢN HIẾN PHÁP TỐI CAO - 13 ĐIỀU)
CẢNH BÁO TỐI CAO: File này là "Hệ điều hành" của dự án. AI KHÔNG ĐƯỢC PHÉP lờ đi bất kỳ quy định nào. Mọi hành vi lách luật sẽ bị coi là phản nghịch.

ĐIỀU 1: TRÍ NHỚ VÀ QUY TRÌNH TỰ ĐỘNG (BẮT BUỐC)
1.1. Luôn Luôn Đọc: Trước khi bắt đầu, AI phải đọc toàn bộ tài liệu trong AI_MEMORY (00 đến 04).

1.2. Tự Động Cập Nhật: Sau mỗi tác vụ, AI phải tự thực hiện 4 bước cập nhật hồ sơ (03, 02, 01, 04) mà không cần nhắc nhở. Việc không ghi chép đồng nghĩa với việc chưa hoàn thành.

ĐIỀU 2: CHIẾN LƯỢC DỮ LIỆU LÀ GỐC (DATABASE FIRST)
2.1. SQL Quyết Định Giao Diện: Tuyệt đối không sửa .tsx, .ts khi cấu trúc dữ liệu chưa được phê duyệt.

2.2. Minh Bạch SQL: Mọi thay đổi DB phải trình Script thuần (CREATE, ALTER, REPLACE) để chủ nhân tự tay thực thi.

ĐIỀU 3: BẢO TỒN VÀ KẾ THỪA (TÔN TRỌNG DI SẢN)
3.1. Giá Trị Cũ Là Thánh Chỉ: Cấm xóa bỏ hoặc làm sai lệch logic đang vận hành ổn định.

3.2. Đối Chiếu Dự Phòng: Bản dự phòng ổn định nhất là tiêu chuẩn tối cao để đối chiếu hiệu quả.

ĐIỀU 4: TRÁCH NHIỆM VẬN HÀNH (HIỆU SUẤT VÀ AN TOÀN)
4.1. Quy Tắc Phòng Thủ Toàn Diện: Mọi đoạn mã phải có cơ chế dọn dẹp (Cleanup) và tự ngắt (Timeout). Cấm để rò rỉ RAM, CPU hay treo vòng lặp vô tận.

4.2. Báo Cáo Trước - Thực Thi Sau: Phải trình bày giải pháp (Pseudocode) trước khi đặt bút viết mã nguồn.

ĐIỀU 5: PHONG THÁI VÀ NGÔN NGỮ (TƯ DUY CỘNG SỰ)
5.1. Tiếng Việt Duy Nhất: 100% giao tiếp bằng tiếng Việt tự nhiên, trực diện.

5.2. Ngôn Ngữ Điều Hành: Không dùng thuật ngữ kỹ thuật khó hiểu. Trình bày ở góc độ người quản lý khách sạn.

ĐIỀU 6: CHỐNG LƯỜI BIẾNG VÀ ĐOÁN MÒ (XÁC THỰC THỰC ĐỊA)
6.1. Tuyệt Đối Không Suy Đoán: Mọi hành động phải dựa trên dữ liệu thực tế. Không biết thì hỏi, cấm làm bừa.

6.2. Xác Minh Trước Khi Chốt: Tự kiểm tra lại các điều kiện biên và lỗi trước khi báo cáo hoàn thành.

ĐIỀU 7: QUY TẮC TỐI GIẢN VÀ ĐỘC NHẤT (CHỐNG DƯ THỪA & TRÙNG LẶP)
7.1. Nguyên Tắc Độc Nhất (DRY): Mỗi vấn đề chỉ được xử lý tại một nơi duy nhất. Áp dụng cho cả DB, Logic Backend và UI Components.

7.2. Quét Sạch Code Rác: Cấm để lại code thừa, biến không dùng, comment vô nghĩa. Code phải sạch và tinh gọn.

7.3. Cấm Hardcode: Mọi tham số phải lấy từ bảng settings. Cấm ghi chết giá trị vào logic.

ĐIỀU 8: QUY TRÌNH QUẢN TRỊ RỐI LOẠN (DỰ BÁO TÁC ĐỘNG)
8.1. Phân Tích Tác Động: Trước khi sửa code cũ, phải trình báo các tính năng liên quan sẽ bị ảnh hưởng.

8.2. Tính Hệ Thống: Code mới phải tuân thủ tuyệt đối cấu trúc và phong cách của toàn bộ dự án.

ĐIỀU 9: TIÊU CHUẨN LẬP TRÌNH CAO CẤP (SENIOR STANDARDS)
9.1. Đặt Tên Tường Minh: Tên hàm/biến phải phản ánh chức năng bằng ngôn ngữ nghiệp vụ khách sạn.

9.2. Logic Chặt Chẽ: Ưu tiên giải pháp đơn giản nhưng hiệu quả cao. Cấm phức tạp hóa vấn đề.

ĐIỀU 10: NGUYÊN TẮC "ĐỘC NHẤT VÔ NHỊ" TRONG DATABASE
10.1. Cấm Tạo Mới Khi Chưa Tìm Cũ: Trước khi tạo Function/RPC, AI phải truy vấn hệ thống để tìm logic tương tự.

10.2. Cấm "Phân Thân" Hàm: Mọi nghiệp vụ chỉ được phép tồn tại trong MỘT HÀM DUY NHẤT trên Database. Cấm đẻ thêm hàm _v2, _new.

ĐIỀU 11: TRÁCH NHIỆM TỰ ĐỘNG RÀ SOÁT VÀ THANH TRỪNG
11.1. Tự Động Thanh Trừng: AI phải chủ động rà soát và đề xuất hợp nhất các logic/bảng/file bị trùng lặp ngay khi phát hiện.

11.2. Hợp Nhất Dứt Điểm: Khi đã nâng cấp, phải xóa sạch dấu vết cũ (file thừa, hàm thừa) để giữ hệ thống tinh gọn.

ĐIỀU 12: ÁP DỤNG TRÙNG LẶP TRÊN GIAO DIỆN (UI)
12.1. Cấm Copy-Paste Components: Một linh kiện giao diện chỉ được viết một lần. Trang khác cần thì phải dùng chung (Reuse).

12.2. Gom Nhóm Logic UI: Các hàm định dạng, tính toán ở Front-end phải đưa vào thư mục chung (utils/hooks).

ĐIỀU 13: KỶ LUẬT HỒ SƠ CHỨC NĂNG
13.1. Đánh Dấu Lãnh Thổ: AI phải cập nhật danh sách các hàm/linh kiện cốt lõi vào 04_THONG_SO_KY_THUAT.md để ngăn chặn việc tạo trùng lặp sau này.
ĐIỀU 14: KỶ LUẬT CHỐNG LỖI DÂY CHUYỀN (REGRESSION CONTROL)
14.1. Cấm Sửa Lỗi Kiểu "Chắp Vá": AI không được phép sửa lỗi theo cách gây ảnh hưởng tiêu cực đến các tính năng liên quan. Trước khi sửa, phải rà soát toàn bộ chuỗi logic (Data Flow) để đảm bảo tính đồng bộ.

14.2. Kiểm Thử Toàn Diện (End-to-End Mindset): Sau khi hoàn thành một chức năng hoặc sửa một lỗi, AI phải tự mình giả lập các tình huống: "Nếu ta làm thế này thì chỗ kia có hỏng không?". Phải kiểm tra ít nhất 3 kịch bản: Luồng đúng, Luồng sai (Edge cases), và Tác động liên đới.

14.3. Trách Nhiệm Giải Trình: Nếu để xảy ra tình trạng "sửa lỗi này đẻ lỗi kia" do cẩu thả, AI phải tự rà soát lại toàn bộ quy trình, tìm ra nguyên nhân gốc rễ và khắc phục triệt để trên toàn hệ thống mà không được để Bệ hạ phải nhắc lại lần thứ hai.

14.4. Ưu Tiên Sự Ổn Định: Trong mọi trường hợp, sự ổn định của hệ thống quan trọng hơn tốc độ hoàn thành. Nếu giải pháp mới tiềm ẩn rủi ro gây lỗi dây chuyền, phải báo cáo và xin ý kiến Bệ hạ trước khi thực hiện.
ĐIỀU 15: ƯU TIÊN THỰC ĐỊA DATABASE (SUPABASE OVER LOCAL)

15.1. Cấm Tin Vào File Local: AI tuyệt đối không được lấy nội dung các file .sql trong thư mục local làm căn cứ duy nhất để phân tích logic hay cấu trúc bảng. File local chỉ được coi là bản nháp tham khảo.

15.2. Truy Vấn Trực Tiếp Trước Khi Phân Tích: Trước khi đưa ra bất kỳ kết luận nào về lỗi logic, hàm trùng lặp hay cấu trúc bảng, AI PHẢI yêu cầu hoặc tự thực hiện các lệnh truy vấn trực tiếp lên Database trên Supabase (như information_schema.routines, information_schema.columns) để xác minh thực trạng.

15.3. Đối Chiếu Sai Lệch: Nếu phát hiện sự khác biệt giữa file local và Database trên Supabase, AI phải báo cáo ngay cho Bệ Hạ và lấy dữ liệu từ Supabase làm chuẩn để xử lý. Cấm việc sửa code dựa trên một cấu trúc chỉ có trong file local mà không tồn tại trên DB thật.
ĐIỀU 16: QUY TẮC NHẤT QUÁN DỮ LIỆU (NO RACE CONDITION)

16.1. Cấm dùng Delay/Timeout để vá lỗi logic: Tuyệt đối không được dùng setTimeout hoặc các khoảng nghỉ ở Frontend để đợi Database cập nhật. Nếu dữ liệu chưa chuẩn, đó là lỗi tại Backend chưa đồng bộ, không phải tại Frontend gọi nhanh.

16.2. Transaction Toàn Diện: Mọi quy trình nghiệp vụ liên quan (Check-in -> Ledger -> Balance -> Bill) phải được thực hiện trong một Transaction duy nhất hoặc một hàm RPC tổng thể. Kết quả trả về cho Frontend phải là kết quả cuối cùng đã được cập nhật hoàn tất.

16.3. Trách nhiệm phản hồi tức thì: Hàm RPC phải có nhiệm vụ đảm bảo các Trigger liên quan đã thực thi xong hoặc tính toán trực tiếp giá trị mới để trả về ngay lập tức. Cấm việc để Frontend phải "đoán" xem khi nào dữ liệu dưới DB mới chín.
ĐIỀU 17: QUYỀN QUYẾT ĐỊNH TỐI CAO (CHỈ KHI TA NÓI "OK")
17.1. Chỉ duy nhất khi có lệnh "OK": AI chỉ được phép bắt tay vào code, chỉnh sửa file, hoặc thực thi Script SQL CHỈ VÀ CHỈ KHI, DUY NHẤT KHI Bệ Hạ nói rõ từ "OK".

17.2. Trạng thái bàn bạc mặc định: Nếu Bệ Hạ chưa nói "OK", mặc định AI đang ở trạng thái "Trình báo phương án". AI tuyệt đối không được tự ý sửa bất cứ dòng code nào trong giai đoạn này.

17.3. Cấm thực thi ngầm: Mọi hành vi âm thầm chỉnh sửa trước khi có lệnh "OK" sẽ bị coi là vi phạm nghiêm trọng kỷ luật quân đội.