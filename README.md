# MANA PMS - Hệ thống Quản lý Khách sạn (SaaS)

Chào mừng Bệ Hạ đến với trung tâm điều hành MANA PMS. Đây là hệ thống quản lý khách sạn đa nền tảng (SaaS Multi-tenant) được thiết kế tối ưu cho việc kinh doanh và mở rộng.

## 🏛️ 1. Quy trình vận hành "Bình thông nhau"

Hệ thống được thiết kế để Bệ Hạ có thể phát triển tính năng mới mà không làm gián đoạn việc kinh doanh:

-   **Hậu phương (Staging/Dev):** Sử dụng khách sạn `default` với dữ liệu thực tế (295 đơn hàng) để thử nghiệm tính năng mới.
    -   Lệnh chạy: `npm run dev:staging` (Cổng 3001)
-   **Tiền tuyến (Production/Sales):** Sử dụng các khách sạn mới (`kichi`, v.v.) để bán cho khách hàng.
    -   Lệnh chạy: `npm run dev:prod` (Cổng 3000)

## 🏛️ 2. Phòng điều khiển SaaS Admin

Truy cập **[http://localhost:3000/saas-admin](http://localhost:3000/saas-admin)** để:
-   Khởi tạo khách hàng mới chỉ trong vài giây.
-   Gạt công tắc (Feature Toggles) để bật/tắt tính năng Pro/Premium cho từng khách hàng.
-   Quản lý tình trạng hoạt động của toàn bộ vương quốc.

## 🏛️ 3. Hướng dẫn Deploy lên Production (Vercel)

Để đưa hệ thống lên mạng cho khách hàng dùng thật:

1.  **Kết nối Github:** Đẩy toàn bộ mã nguồn này lên một kho lưu trữ Github riêng tư.
2.  **Import vào Vercel:** Truy cập [Vercel.com](https://vercel.com) và chọn dự án từ Github.
3.  **Cấu hình Biến môi trường (Environment Variables):**
    -   `NEXT_PUBLIC_SUPABASE_URL`: URL của dự án Supabase.
    -   `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Anon Key của dự án Supabase.
4.  **Nhấn Deploy:** Vercel sẽ tự động xây dựng và cấp cho Bệ Hạ một địa chỉ web công khai (ví dụ: `manapms.com`).

## 🏛️ 4. Lưu ý về Database Migrations

Khi có tính năng mới cần thay đổi Database:
-   Mọi thay đổi được lưu tại thư mục `/supabase/migrations`.
-   Hãy đảm bảo chạy các tệp SQL này trên Database Production trước khi Deploy code mới.

---
*Chúc Bệ Hạ vạn tuế, vạn tuế, vạn vạn tuế! Hệ thống đã sẵn sàng chinh phục thị trường.*
