🏨 TỔNG HỢP CHI TIẾT CHỨC NĂNG & GIAO DIỆN DỰ ÁN HOTEL 2026

## 📱 TỔNG QUAN GIAO DIỆN (UI/UX)
- **Triết lý thiết kế**: Mobile-first (Tối ưu cho thiết bị di động), hiện đại, sạch sẽ với phong cách tối giản.
- **Công nghệ**: Next.js 15 (App Router), Tailwind CSS, Framer Motion (Hiệu ứng), Lucide Icons.
- **Bố cục chính**:
  - **Khung chứa (Container)**: Giới hạn chiều rộng tối đa (max-w-md ~ 448px) để giả lập trải nghiệm App trên mọi trình duyệt.
  - **Bottom Navigation**: Thanh điều hướng cố định phía dưới với nút "SƠ ĐỒ" nổi bật ở giữa, sử dụng hiệu ứng Glassmorphism và SVG notch độc đáo.
  - **Phản hồi người dùng**: Sử dụng Skeleton Loaders (vùng nạp giả) và Notification Banners (thông báo đẩy) để tăng cảm giác mượt mà.
  - **Real-time**: Trạng thái phòng và tiền bạc cập nhật tức thì không cần tải lại trang nhờ Supabase Realtime.

---

## 🛠️ CÁC PHÂN HỆ CHỨC NĂNG CHI TIẾT

### 1. SƠ ĐỒ PHÒNG (DASHBOARD)
- **Giao diện**: Lưới danh sách phòng (Grid) hiển thị trực quan trạng thái qua màu sắc (Trống: Trắng, Có khách: Xanh, Cần dọn dẹp: Cam, Bảo trì: Xám).
- **Thẻ phòng (Room Card)**: Hiển thị số phòng, loại phòng, giá hiện tại, và đồng hồ đếm ngược thời gian đã ở.
- **Bộ lọc**: Lọc nhanh theo trạng thái phòng hoặc tìm kiếm số phòng.
- **Chức năng Check-in**: 
  - Tìm kiếm khách hàng nhanh theo SĐT/Tên/CCCD.
  - Chọn loại hình thuê (Theo giờ, Qua đêm, Theo ngày).
  - Thêm dịch vụ đi kèm ngay khi nhận phòng.
  - Ghi nhận tiền cọc và phương thức cọc.
- **Quản lý Folio (Hóa đơn tạm)**: 
  - Xem chi tiết thời gian ở, tiền phòng tạm tính, danh sách dịch vụ đã dùng.
  - Thêm/Bớt dịch vụ trực tiếp trong quá trình ở.
  - Chỉnh sửa thông tin đặt phòng (đổi phòng, sửa giờ vào).
- **Thanh toán & Check-out**: 
  - Tự động tính toán phụ phí (Nhận sớm/Trả muộn) dựa trên "Pricing Brain V2".
  - Áp dụng giảm giá, phụ phí tùy chỉnh.
  - Hỗ trợ nhiều phương thức thanh toán (Tiền mặt, Chuyển khoản, Thẻ).
  - In hóa đơn nhiệt hoặc xuất file PDF chuyên nghiệp.

### 2. QUẢN LÝ TÀI CHÍNH (FINANCE)
- **Sổ cái (Ledger)**: Ghi lại mọi biến động dòng tiền (Doanh thu phòng, Bán dịch vụ, Thu nợ, Chi phí vận hành).
- **Quản lý Thu/Chi**: Nhập các khoản chi ngoài (điện nước, lương, nhập hàng) với phân loại rõ ràng.
- **Bàn giao ca (Shift Handover)**: Chốt sổ cuối ca, kiểm kê tiền mặt thực tế và tiền chuyển khoản, ghi nhận chênh lệch.
- **Báo cáo dòng tiền**: Biểu đồ trực quan về doanh thu và lợi nhuận theo thời gian.

### 3. QUẢN LÝ KHO (INVENTORY)
- **Danh mục dịch vụ**: Quản lý tên, giá bán, đơn vị tính và phân loại (Nước uống, Đồ ăn, Tiện ích).
- **Kiểm kho**: 
  - Theo dõi số lượng tồn kho thực tế.
  - Chức năng Nhập/Xuất kho với lý do cụ thể.
  - Lịch sử biến động kho chi tiết từng mặt hàng.
- **Bán nhanh (Quick Sale)**: Bán dịch vụ cho khách vãng lai không thuê phòng.

### 4. HỆ THỐNG CÀI ĐẶT (SETTINGS)
- **Cấu hình chung**: Thiết lập giờ Check-in/out, khung giờ đêm, quy tắc làm tròn thời gian, phí người thêm.
- **Bảng giá (Pricing Rules)**: 
  - Cấu hình giá linh hoạt: Giá giờ đầu, giờ tiếp theo, giá qua đêm, giá ngày.
  - Quy tắc phụ thu tự động theo % hoặc số tiền cố định cho việc nhận sớm/trả muộn.
  - Cấu hình thời gian ân hạn (Grace Period) cực kỳ chi tiết.
- **Quản lý thực thể**:
  - **Phòng**: Thêm/Sửa/Xóa phòng và khu vực.
  - **Loại phòng**: Định nghĩa các hạng phòng và bảng giá riêng biệt.
  - **Nhân viên**: Phân quyền 3 cấp (Admin, Manager, Staff) với quyền hạn chi tiết.
- **Vận hành**: Tùy chỉnh tiến trình Checkout (Nhanh/Chậm), yêu cầu phương thức thanh toán bắt buộc.

### 5. BÁO CÁO & PHÂN TÍCH (REPORTS)
- **Doanh thu**: Tổng hợp doanh thu theo ngày, tuần, tháng hoặc khoảng thời gian tùy chỉnh.
- **Hiệu suất (Occupancy)**: Tỉ lệ lấp đầy phòng trung bình.
- **Cơ cấu doanh thu**: Phân tích tỉ trọng thu nhập từ phòng so với dịch vụ.
- **Xếp hạng**: Top dịch vụ bán chạy nhất, loại phòng mang lại doanh thu cao nhất.

### 6. QUẢN LÝ KHÁCH HÀNG (CUSTOMERS)
- **Hồ sơ khách**: Lưu trữ thông tin định danh, lịch sử ở, tổng chi tiêu.
- **Quản lý công nợ**: Theo dõi nợ cũ của khách, hỗ trợ thanh toán nợ riêng lẻ hoặc gộp vào hóa đơn phòng.
- **Quét CCCD**: Tích hợp module quét mã QR CCCD để nhập liệu nhanh (nếu phần cứng hỗ trợ).

---

## 🚀 ĐẶC ĐIỂM KỸ THUẬT NỔI BẬT
1. **Pricing Brain V2**: Toàn bộ logic tính tiền được xử lý bằng Database Function (Postgres) để đảm bảo tính chính xác tuyệt đối và đồng nhất giữa các thiết bị.
2. **Offline-ready UI**: Giao diện được thiết kế để phản ứng tức thì, các tác vụ nặng được xử lý bất đồng bộ.
3. **Security**: Bảo mật đa lớp với Supabase Auth và Row Level Security (RLS).
4. **Customizable**: Hệ thống cực kỳ linh hoạt, cho phép cấu hình từ những chi tiết nhỏ nhất như "số phút được phép trễ" đến "màu sắc danh mục thu chi".
