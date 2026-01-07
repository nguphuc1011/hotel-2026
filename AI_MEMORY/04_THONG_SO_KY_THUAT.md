# 🛠️ THÔNG SỐ KỸ THUẬT (04_THONG_SO_KY_THUAT.md)

## 1. Data Schema (Lược đồ dữ liệu)

### Cơ chế Xác thực & Phân quyền (Auth System)
- **Provider**: `AuthContext.tsx` quản lý trạng thái `user`, `profile`, và `loading`.
- **Cơ chế Bảo vệ (Gatekeeping)**:
    - **Timeout 5s**: Nếu quá trình xác thực/tải hồ sơ kéo dài quá 5 giây, hệ thống tự động ép `loading = false` để tránh treo màn hình trắng.
    - **Single Pulse**: `useEffect` trong AuthContext chỉ chạy một lần khi khởi tạo, không phụ thuộc vào thay đổi đường dẫn (pathname).
    - **RoleGuard**: Component bọc ngoài các trang nhạy cảm, thực hiện đẩy người dùng về `/login` nếu không có profile hợp lệ sau khi hết loading.
- **Bảng `profiles`**: Lưu thông tin vai trò (`role`) và quyền (`permissions`) của nhân viên.

### Bảng `customers`
- `id` (uuid, PK)
- `full_name` (text)
- `phone` (text, unique)
- `id_card` (text, unique)
- `balance` (numeric, default 0) - QUY ƯỚC: < 0 là Khách nợ, > 0 là Khách dư tiền.
- `visit_count` (int)
- `total_spent` (numeric)

### Bảng `bookings`
- `id` (uuid, PK)
- `room_id` (uuid, FK)
- `customer_id` (uuid, FK)
- `status` ('active', 'completed', 'cancelled')
- `services_used` (jsonb) - Lưu mảng các dịch vụ đã dùng.
- `initial_price` (numeric) - Giá thỏa thuận lúc check-in.

### Bảng `transactions` (Legacy)
- `id` (uuid, PK)
- `customer_id` (uuid, FK)
- `booking_id` (uuid, FK)
- `type` ('deposit', 'payment', 'debt', 'refund')
- `amount` (numeric)
- `method` ('cash', 'transfer', 'card')

### Bảng `ledger` (New - Professional)
- `id` (uuid, PK)
- `shift_id` (uuid, FK)
- `booking_id` (uuid, FK)
- `customer_id` (uuid, FK)
- `staff_id` (uuid, FK)
- `type` ('REVENUE', 'PAYMENT', 'DEPOSIT', 'REFUND', 'EXPENSE', 'DEBT_ADJUSTMENT')
- `category` (text)
- `amount` (numeric)
- `payment_method_code` (text)
- `status` ('completed', 'void')
- `created_at` (timestamptz)

### Bảng `shifts` (New)
- `id` (uuid, PK)
- `staff_id` (uuid, FK)
- `start_at` (timestamptz)
- `end_at` (timestamptz)
- `opening_balance` (numeric)
- `closing_balance` (numeric)
- `expected_balance` (numeric)
- `status` ('open', 'closed')

### Bảng `payment_methods`
- `id` (uuid, PK)
- `code` (text, unique)
- `name` (text)
- `is_active` (boolean)

## 2. API & RPC quan trọng (Độc Nhất - Điều 10)
- `calculate_booking_bill`: **Pricing Brain (Arithmetic Engine)**. Tính toán toàn bộ hóa đơn (tiền phòng, dịch vụ, phụ phí, thuế, cọc, nợ cũ).
  - Logic đặc biệt: `total_final` trả về là con số thực tế nhân viên cần thu (đã bao gồm nợ cũ và trừ tiền cọc).
- `handle_check_in`: Tạo booking, cập nhật trạng thái phòng, xử lý khách hàng.
- `handle_checkout`: (UNIFIED) Tính tổng tiền (gọi nội bộ `calculate_booking_bill`), cập nhật balance khách, hoàn tất booking, ghi Sổ cái (Revenue/Payment).
  - Tham số: `p_booking_id`, `p_amount_paid`, `p_payment_method`, `p_surcharge`, `p_discount`, `p_notes`, `p_staff_id`.
  - Logic balance: `new_balance = old_balance - booking_revenue + p_amount_paid`.
- **Edge Functions**: `send-push-notification` - Gửi thông báo real-time qua Firebase Cloud Messaging (FCM).

## 3. Tech Stack Details
- **Frontend**: React 18, Next.js 14 (App Router).
- **State Management**: React Hooks (Context API cho Global State nếu có).
- **Styling**: Tailwind CSS + Shadcn UI.
- **Backend**: Supabase Auth & DB.
