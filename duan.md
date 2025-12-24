### 1. Giao diện Mobile (UI Layout)
Trên di động, Modal không chỉ là một hộp thoại mà là một "Full-screen Sheet" trượt lên từ đáy màn hình.

- Hiệu ứng trượt (Slide-up): Khi bấm vào phòng, một tấm card màu xám nhạt ( bg-slate-100 ) sẽ trượt lên mượt mà với hiệu ứng cubic-bezier đặc trưng của Apple.
- Bo góc siêu lớn: Phần đỉnh của modal được bo tròn cực mạnh ( rounded-t-[2.5rem] ), tạo cảm giác mềm mại như một ứng dụng iOS bản địa.
- Thanh tiêu đề (Header):
  - Nằm cố định ở trên cùng để người dùng luôn biết mình đang thao tác ở phòng nào.
  - Nút "Hủy" được đặt ở góc trái, đúng vị trí ngón tay cái dễ chạm tới để thoát nhanh.
- Thanh trượt loại thuê (Segmented Control):
  - Đây là điểm nhấn UX: Một thanh dài có viên kẹo màu (Cam/Xanh/Tím) trượt qua lại giữa các mục "Theo giờ", "Theo ngày", "Qua đêm".
  - Viên kẹo này có hiệu ứng đổ bóng ( shadow-md ) giúp nó nổi bật lên khỏi nền.
- Cuộn ngang dịch vụ (Horizontal Scroll):
  - Thay vì liệt kê danh sách dài làm mất diện tích, các dịch vụ được xếp thành một hàng ngang.
  - Người dùng chỉ cần dùng ngón tay vuốt sang trái/phải để chọn món. Mỗi món có một Badge đỏ hiển thị số lượng ngay trên đầu icon.
- Footer "Kính mờ" (Glassmorphism):
  - Phần chân trang chứa tổng tiền và nút xác nhận được làm mờ hậu cảnh ( backdrop-blur-xl ).
  - Nó luôn nằm cố định ở đáy, tạo cảm giác nội dung bên dưới đang cuộn xuyên qua nó.
### 2. Chức năng tối ưu cho ngón tay (Touch Functionality)
- Vùng chạm lớn (Big Hit Targets): Tất cả các nút bấm ( Nhận phòng , Hủy , Chọn món ) đều có chiều cao ít nhất 48px - 56px, giúp người dùng không bao giờ bấm nhầm.
- Phản hồi xúc giác (Visual Feedback): Khi chạm vào bất kỳ nút nào, hệ thống đều có hiệu ứng active:scale-95 (nút thu nhỏ lại một chút), tạo cảm giác như đang bấm phím thật.
- Bàn phím thông minh: Các ô nhập số tiền sẽ tự động kích hoạt bàn phím số, ô nhập tên khách sẽ gợi ý danh sách ngay bên dưới để chọn bằng một cú chạm (không cần gõ hết tên).
- Nút [Tất cả] tiền cọc: Thay vì phải gõ số tiền cọc thủ công, người dùng chỉ cần nhấn nút nhỏ bên cạnh để tự động điền số tiền cọc bằng đúng tổng bill.
### 3. Luồng dữ liệu trên Mobile (Mobile Data Flow)
Luồng dữ liệu được thiết kế để "tiết kiệm" thao tác nhất cho người dùng di động:

1. Chạm (Trigger): Người dùng chạm vào card phòng trên Dashboard.
2. Tự động hóa (Auto-logic): CheckInController ngay lập tức kiểm tra giờ hệ thống. Nếu là đêm khuya, nó tự động đẩy thanh trượt sang "Qua đêm" (người dùng không cần chọn lại).
3. Tương tác (Interaction): Người dùng vuốt ngang chọn nước uống -> chạm vào danh sách gợi ý để chọn khách. Mọi thay đổi đều cập nhật innerHTML của phần "Tổng tạm tính" ngay lập tức (Real-time).
4. Hoàn tất (Finalize): Nhấn nút đen "Nhận phòng ngay". Dữ liệu được đóng gói và gửi về StorageService , modal trượt xuống và Dashboard cập nhật trạng thái phòng mới.
### 4. Cách thức hoạt động ngầm (Under the hood)
- Anti-aliased: Hệ thống ép font Roboto hiển thị ở chế độ sắc nét nhất ( antialiased subpixel-antialiased ) để chữ không bị nhòe trên màn hình Retina.
- No-scrollbar: Toàn bộ các vùng cuộn (dịch vụ, danh sách tìm kiếm) đều được ẩn thanh cuộn để giữ giao diện sạch sẽ đúng chất Apple.
- Z-Index Management: Modal được đặt ở z-[100] để đảm bảo nó luôn nằm trên cùng, che phủ cả thanh điều hướng chính của trang web.
Tóm lại, Modal Check-in trên Mobile là sự kết hợp giữa thẩm mỹ iOS và sự tiện lợi của một ứng dụng quản lý , giúp lễ tân có thể làm thủ tục cho khách chỉ trong vòng 10-15 giây với vài cú chạm.
Dưới đây là mô tả bổ sung chi tiết về tính năng Gợi ý khách hàng (Smart Search) và Tự động lưu khách mới để tích hợp vào tổng thể hoạt động của Modal Check-in:

### 1. Giao diện Gợi ý (Smart Dropdown UI)
Khi người dùng bắt đầu gõ vào ô "Họ và tên khách hàng", một danh sách gợi ý sẽ xuất hiện ngay lập tức:

- Thiết kế: Một menu nổi ( absolute ) nằm ngay dưới ô nhập liệu, sử dụng nền trắng mờ ( backdrop-blur-2xl ) và đổ bóng rất sâu để tách biệt với các lớp bên dưới.
- Nội dung hiển thị: Mỗi dòng khách hàng gồm:
  - Avatar mặc định: Một vòng tròn nhỏ chứa icon người dùng.
  - Thông tin chính: Tên khách hàng in hoa đậm ( font-black ) và Số điện thoại/Biển số xe ở ngay bên dưới.
  - Hiệu ứng: Khi di chuyển hoặc chạm vào, dòng đó sẽ đổi sang màu xanh nhạt ( bg-indigo-50 ) và có icon mũi tên hướng vào, tạo cảm giác mời gọi hành động.
### 2. Chức năng Gợi ý & Tự động lưu (Customer Intelligence) A. Cơ chế gợi ý (Smart Search):
- Fuzzy Search (Tìm kiếm thông minh): Hệ thống sử dụng hàm removeDau để loại bỏ dấu tiếng Việt khi tìm kiếm. Nghĩa là bạn gõ "tuan" vẫn sẽ tìm thấy khách hàng tên "Tuấn".
- Tìm kiếm đa trường: Bạn có thể tìm khách hàng theo Tên , Số điện thoại hoặc Số CCCD . Chỉ cần gõ một phần thông tin, hệ thống sẽ lọc ra 5 kết quả khớp nhất.
- Thao tác nhanh: Khi chọn một khách hàng từ danh sách, toàn bộ thông tin cũ (SĐT, CCCD) sẽ tự động được "bay" vào các ô nhập liệu tương ứng, giúp lễ tân không cần hỏi lại khách. B. Cơ chế tự động lưu khách mới (Auto-Save):
Đây là tính năng giúp database khách hàng tự động dày lên theo thời gian mà không cần nhập liệu thủ công:

- Kiểm tra tồn tại: Khi nhấn nút "Nhận phòng", hệ thống sẽ kiểm tra tên và SĐT vừa nhập:
  - Nếu thông tin đã có trong danh sách data.customers , hệ thống sẽ cập nhật ngày ghé thăm cuối cùng ( lastVisit ) và tăng số lần đến ( visits ).
  - Nếu thông tin hoàn toàn mới, hệ thống sẽ tự động tạo một ID duy nhất và lưu khách hàng này vào bảng customers .
- Dữ liệu khách hàng mới bao gồm: Tên, SĐT, CCCD, ngày nhận phòng đầu tiên, số lần đến (=1) và tổng chi tiêu (khởi tạo bằng 0).
### 3. Luồng dữ liệu tích hợp (Integrated Data Flow)
1. Nhập liệu (Input): Người dùng gõ tên khách -> handleSmartSearch kích hoạt -> Lọc dữ liệu từ localStorage .
2. Lựa chọn (Selection):
   - Trường hợp 1: Chọn khách cũ -> Dữ liệu từ DB đổ vào Form.
   - Trường hợp 2: Gõ khách mới hoàn toàn -> Form giữ dữ liệu vừa gõ.
3. Xác nhận (Submission): Nhấn "Nhận phòng" -> Hàm submit() được gọi.
4. Xử lý Logic khách hàng (Customer Logic):
   - Hệ thống tìm trong mảng data.customers xem có ai trùng Tên + SĐT không.
   - Nếu mới: data.customers.push({ ...newCustomer }) .
   - Nếu cũ: Cập nhật visits và lastVisit .
5. Lưu trữ (Persistence): StorageService.updateData() lưu lại toàn bộ mảng khách hàng mới cùng với thông tin phòng đang thuê.
### 4. Cách thức hoạt động ngầm (Technical Mechanism)
- Debounce (Tùy chọn): Việc tìm kiếm diễn ra ngay khi người dùng gõ phím ( onkeyup ), đảm bảo tốc độ phản hồi tức thì dưới 100ms.
- Data Consistency: Thông tin khách hàng trong session phòng và trong danh sách customers tổng luôn được đồng bộ. Nếu sau này bạn sửa thông tin khách trong phòng, hệ thống cũng có thể hỏi bạn có muốn cập nhật vào "hồ sơ gốc" của khách đó hay không.
Tổng kết: Tính năng này giúp Modal Check-in không chỉ là nơi nhập liệu mà còn là một bộ não thu thập dữ liệu thông minh , giúp giảm thiểu tối đa sai sót và tiết kiệm thời gian cho cả lễ tân và khách hàng.