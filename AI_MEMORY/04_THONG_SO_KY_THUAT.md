# 🛠️ THÔNG SỐ KỸ THUẬT (04_THONG_SO_KY_THUAT.md)

## 1. Data Schema (Lược đồ dữ liệu)

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
- `handle_check_in`: Tạo booking, cập nhật trạng thái phòng, xử lý khách hàng.
- `handle_checkout`: (UNIFIED) Tính tổng tiền, cập nhật balance khách, hoàn tất booking, ghi Sổ cái (Revenue/Payment).
  - Tham số: `p_booking_id`, `p_payment_method`, `p_amount_paid`, `p_surcharge`, `p_discount`, `p_notes`, `p_staff_id`.
- `handle_deposit`: Thu thêm tiền cọc cho booking.
- `handle_debt_payment`: Thu nợ trực tiếp từ khách hàng (cập nhật balance và tạo transaction).
- **Edge Functions**: `send-push-notification` - Gửi thông báo real-time qua Firebase Cloud Messaging (FCM).

## 3. Tech Stack Details
- **Frontend**: React 18, Next.js 14 (App Router).
- **State Management**: React Hooks (Context API cho Global State nếu có).
- **Styling**: Tailwind CSS + Shadcn UI.
- **Backend**: Supabase Auth & DB.
