# 🎨 BỘ QUY CHUẨN GIAO DIỆN (ui.md) - PHIÊN BẢN PURE MINIMALISM

## 1. Hệ thống Màu sắc & Glassmorphism
- **Accent**: Apple Blue (#007AFF) - Điểm nhấn thông minh cho hành động chính.
- **Background**: System Gray (#F8F9FB) - Nền tinh khiết, Airy.
- **Surface**: Glass White (rgba(255, 255, 255, 0.7)) - Hiệu ứng kính mờ, backdrop-blur-3xl.
- **Text**: Jet Black (#1D1D1F) - Độ tương phản cao, dễ đọc.

## 2. Triết lý Thiết kế
- **Bento Layout**: Chia khối kỷ luật, mỗi khối xử lý một nghiệp vụ độc lập.
- **Pure Minimalism**: Loại bỏ đường kẻ không cần thiết, dùng khoảng trắng (Negative Space) để phân cấp.
- **Airy Glass**: Sử dụng bóng đổ cực nhẹ (rgba(0,0,0,0.02)) và viền kính siêu mỏng.

## 3. Thành phần Cốt lõi (Core Components)
- **BentoCard**: Bo góc 28px (iOS 17/18 style), hiệu ứng hover nâng cao.
- **SegmentedControl**: Bo góc 16px, chuyển đổi tab mượt mà.
- **Glass Header**: Luôn sticky, blur nền để giữ sự tập trung.
