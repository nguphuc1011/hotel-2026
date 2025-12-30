# HỆ THỐNG MẬT BÁO QUÂN SỰ (PUSH NOTIFICATION) - CHIẾN LƯỢC TÁC CHIẾN

## 1. Chiến thuật Lưu trữ (Token Management)
- **Mục tiêu**: Ghi nhớ "địa chỉ" (Token) của Bệ Hạ trên mọi thiết bị.
- **Hành động**: Thiết lập bảng `user_push_tokens` trên Supabase để lưu trữ Token kèm định danh thiết bị.
- **Cơ chế**: Tự động cập nhật Token mới nhất mỗi khi Bệ Hạ truy cập hệ thống từ một thiết bị mới.

## 2. Cơ chế Kích hoạt (Triggering System)
- **Mục tiêu**: Báo động ngay lập tức khi có biến động phòng (Check-in/Check-out).
- **Vị trí cảm biến**: Đặt tại **Database Webhooks** (Hậu phương).
- **Luồng xử lý**: 
    1. Thay đổi dữ liệu tại Database.
    2. Kích hoạt Webhook bắn tin tới **Supabase Edge Functions**.
    3. Edge Functions gọi Firebase Cloud Messaging (FCM) để đẩy tin đi.

## 3. Độ tin cậy của Mật thư (Push vs Local)
- **Giải pháp**: Sử dụng **Service Worker** chạy ngầm để nhận tin ngay cả khi đóng trình duyệt hoặc tắt màn hình.
- **Đảm bảo**: Tin nhắn sẽ hiện lên màn hình khóa điện thoại như một ứng dụng bản địa (Native App).

## 4. Bản kế hoạch triển khai (Roadmap)

| Giai đoạn | Hành động | Trạng thái |
| :--- | :--- | :--- |
| **Bước 1** | Tạo bảng `user_push_tokens` và logic lưu Token tự động. | ✅ Hoàn thành |
| **Bước 2** | Thiết lập Supabase Edge Function (Trung tâm điều phối). | ✅ Đã đúc xong |
| **Bước 3** | Cài đặt Database Webhook trên bảng `bookings`. | 🟡 Đang thực thi |
| **Bước 4** | Kiểm thử thực tế trên đa thiết bị (PC & Mobile). | ⚪ Chờ duyệt |

---
*Cập nhật ngày: 2025-12-30*
*Thực thi bởi: Tử Long*
