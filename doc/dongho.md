# Tài liệu Chức năng Đồng hồ & Cơ chế Tính tiền Sơ đồ Phòng

Tài liệu này mô tả chi tiết cách thức hoạt động, cơ chế cập nhật và logic tối ưu hóa của hệ thống đồng hồ và hiển thị tiền phòng trong ứng dụng.

## 1. Triết lý Thiết kế: Tách biệt Hiển thị và Tính toán

Hệ thống được thiết kế dựa trên nguyên tắc tách biệt hoàn toàn giữa hai thành phần:
- **Giao diện Đồng hồ (LiveTimer)**: Chỉ chịu trách nhiệm hiển thị thời gian đã ở (Duration).
- **Logic Tính tiền (Billing Engine)**: Chịu trách nhiệm tính toán số tiền thực tế dựa trên các quy tắc nghiệp vụ tại Database.

Việc tách biệt này đảm bảo hệ thống luôn chính xác về mặt tài chính trong khi vẫn giữ được sự sống động về mặt giao diện.

---

## 2. Cơ chế Hoạt động của Đồng hồ (LiveTimer)

Đồng hồ được triển khai thông qua thành phần [LiveTimer.tsx](file:///c:/1hotel2/src/components/dashboard/LiveTimer.tsx).

### Các chế độ cập nhật:
- **Chế độ Theo Giờ (Hourly)**:
    - Cập nhật mỗi **1 giây**.
    - Hiển thị định dạng: `HH:mm:ss`.
    - Mục đích: Giúp nhân viên theo dõi chính xác từng giây khách đã ở để xử lý check-out kịp thời.
- **Chế độ Ngày/Qua đêm (Daily/Overnight)**:
    - Cập nhật mỗi **60 giây**.
    - Hiển thị định dạng: `X ngày`.
    - Mục đích: Giảm tải cho CPU vì các loại hình này không thay đổi trạng thái theo từng giây.

### Tối ưu hóa hiệu năng:
- **Isolated Rendering**: Mỗi đồng hồ chạy trong một `useEffect` riêng lẻ. Khi đồng hồ nhảy, chỉ có văn bản thời gian được vẽ lại, không làm ảnh hưởng đến toàn bộ thẻ phòng ([RoomCard.tsx](file:///c:/1hotel2/src/components/dashboard/RoomCard.tsx)).
- **React.memo**: Toàn bộ thành phần được bao bọc trong `memo` để tránh re-render thừa từ cha.

---

## 3. Cơ chế "Nhảy số" Tiền phòng (Price Updates)

Đây là phần quan trọng nhất về mặt nghiệp vụ. Tiền phòng **KHÔNG** được tính lại sau mỗi giây theo đồng hồ.

### Luồng xử lý:
1. **Tính toán tại Backend**: Toàn bộ logic tính tiền (giá giờ, giá ngày, phụ thu, trả sớm/muộn) được thực hiện bởi hàm RPC `calculate_booking_bill` trong Database.
2. **Cơ chế Event-Driven**: 
    - Tiền phòng chỉ cập nhật trên giao diện khi dữ liệu trong bảng `bookings` hoặc `rooms` có sự thay đổi.
    - Sử dụng **Supabase Realtime** ([page.tsx](file:///c:/1hotel2/src/app/page.tsx)) để lắng nghe sự kiện từ Database. Khi có thay đổi, hệ thống mới gọi lại hàm tính tiền.
3. **Mốc thời gian (Milestones)**: 
    - Tiền sẽ "nhảy số" khi khách bước sang một khung giờ mới (ví dụ: từ giờ thứ 1 sang giờ thứ 2).
    - Database sẽ tự động xác định mốc này và trả về con số mới khi có yêu cầu truy vấn.

### Ưu điểm của cơ chế này:
- **Độ chính xác tuyệt đối**: Tránh sai lệch giữa giao diện người dùng và dữ liệu kế toán trong Database.
- **Siêu nhẹ**: Trình duyệt không phải thực hiện các phép tính nhân/chia/cộng/trừ phức tạp mỗi giây. Nó chỉ nhận một con số "tĩnh" từ Database và hiển thị.

---

## 4. Cơ chế Cập nhật Dữ liệu (Data Fetching)

Hệ thống duy trì sự đồng bộ thông qua 3 kênh:
- **Initial Fetch**: Tải toàn bộ trạng thái phòng khi mở trang.
- **Realtime Subscription**: Tự động tải lại dữ liệu (fetchData) khi có bất kỳ thay đổi nào từ phía server (nhận phòng, đổi phòng, dọn phòng).
- **User Action**: Khi người dùng thực hiện thao tác (mở Folio), hệ thống sẽ gọi hàm tính tiền mới nhất để đảm bảo con số thanh toán là chính xác đến từng mili giây.

---

## 5. Tổng kết Hiệu năng

| Thành phần | Tần suất cập nhật | Tác động CPU | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Đồng hồ giây** | 1s / lần | Rất thấp | Chỉ vẽ lại text, không tính toán logic. |
| **Tiền phòng** | Theo sự kiện / mốc giờ | Trung bình | Chỉ chạy khi thực sự có thay đổi tiền. |
| **Toàn bộ trang** | Khi có thay đổi DB | Thấp | Nhờ cơ chế Realtime thông minh. |

Hệ thống đảm bảo trải nghiệm **"Mượt như đồng hồ, Chính xác như kế toán"**.
