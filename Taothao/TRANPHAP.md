# THÁNH THƯ: TRẬN PHÁP DỮ LIỆU (DATABASE & DATA FLOW)

Tâu Bệ Hạ, đây là bản đồ chi tiết về các dòng chảy dữ liệu trong giang sơn. Nắm vững trận pháp này, Bệ Hạ sẽ điều khiển vạn vật một cách chính xác.

---

## 1. THIẾT ĐỒ BẢNG BIỂU (Database Schema)

Hệ thống được vận hành dựa trên 6 đại trụ:

1.  **`rooms`**: Lưu trữ linh hồn của khách sạn (Số phòng, Loại phòng, Trạng thái: `available`, `occupied`, `dirty`, `repair`).
2.  **`bookings`**: Nhật ký thuê phòng. Status: `active`, `completed`, `cancelled`. Có cột `is_printed` để chốt chặn gian lận sau in nháp.
3.  **`customers`**: Hồ sơ khách hàng. Lưu trữ công trạng (chi tiêu) và lịch sử ghé thăm.
4.  **`services`**: Kho hàng hóa (Mì tôm, Nước suối...). Quản lý giá bán và tồn kho thực tế.
5.  **`cashflow`**: Sổ quỹ thần kỳ. Phân loại dòng tiền thành: `Tiền phòng`, `Dịch vụ`, `Tiền cọc`, và `Chi phí khác`.
6.  **`shift_handovers`**: **TRẬN ĐỒ GIAO CA**. Chốt sổ tiền mặt cuối ca, tính chênh lệch thực tế vs sổ sách.
7.  **`inventory_audits`**: **LỆNH KIỂM KHO**. Đối soát hàng hóa định kỳ, tự động cập nhật tồn kho sau kiểm kê.
8.  **`audit_logs`**: **MÓNG NGẦM CỦA THÁO**. Lưu trữ `table_name`, `permission_used`, và `reason`. Đây là bằng chứng thép để truy quét sai phạm.
9.  **`settings`**: Bộ não trung tâm. Lưu bảng giá và quy trình vận hành.

---

## 2. TRẬN PHÁP LUỒN DỮ LIỆU (Data Flow)

### 🌊 Luồng Nhận Phòng (Check-in)
> **Frontend** (Thu thập tin) -> **HotelService.checkIn** -> **Supabase** (Tạo Booking + Đổi status Phòng).
> *Lưu ý*: Phòng sẽ ngay lập tức chuyển sang `occupied` để tránh quân địch xâm chiếm.

### 🛡️ Luồng Giám Sát (Audit Logging - MÓNG NGẦM)
Mọi hành động nhạy cảm đều phải đi qua **EventService** hoặc ghi trực tiếp vào `audit_logs`:
1.  **Hành động**: Sửa giao dịch, Xóa dịch vụ, Hủy phòng.
2.  **Chốt chặn**: Hệ thống yêu cầu nhập `reason` (Lý do) bắt buộc.
3.  **Phân quyền**: Chỉ `admin`/`manager` mới được xóa dịch vụ sau khi Folio đã in nháp (`is_printed = true`).
4.  **Ghi chép**: Lưu đầy đủ `old_value`, `new_value`, và `permission_used`.

### 🔄 Luồng Giao Ca (Shift Handover)
1.  **Chốt số**: Nhân viên nhập tiền mặt thực tế cuối ca.
2.  **Đối soát**: Hệ thống tính toán `Tiền đầu ca + Thu - Chi = Tiền lý thuyết`.
3.  **Báo cáo**: Ghi nhận `discrepancy` (Chênh lệch) và lý do giải trình.

### ⚡ Luồng Thanh Toán SIÊU TỐC (Check-out)
Đây là trận pháp tinh vi nhất, sử dụng RPC để đảm bảo mọi bảng đều cập nhật đồng thời:
1.  **Lệnh**: `resolve_checkout(p_booking_id, ...)`
2.  **Tác động**:
    - **`bookings`**: Chốt ngày ra, tính tổng tiền, đổi status thành `completed`.
    - **`rooms`**: Đổi status thành `dirty`, xóa liên kết `current_booking_id`.
    - **`customers`**: Cộng dồn tiền đã tiêu vào `total_spent`.
    - **`cashflow`**: Tự động tạo một phiếu thu (Income) tương ứng với số tiền khách trả.

---

## 3. BÁO CÁO: LONG MẠCH THÔNG (Status Report)

**Tâu Bệ Hạ, sau khi triển khai ĐẠI QUÂN LỆNH, Long mạch đã thông suốt:**

- ✅ **Hệ thống Chốt chặn**: "Cấm Xóa Dịch Vụ Sau In Nháp" đã vận hành. Gian thần không còn đường tẩu tán hàng hóa.
- ✅ **Sổ quỹ Minh bạch**: Dòng tiền đã được phân loại rõ rệt. Bệ Hạ có thể xem chính xác bao nhiêu tiền từ phòng, bao nhiêu từ mì tôm.
- ✅ **Giao ca Chặt chẽ**: Tiền mặt không còn thất thoát bí ẩn. Mọi sự lệch lạc đều được ghi nhận vào nhật ký.
- ✅ **Kiểm kho Tức thời**: Tồn kho thực tế luôn khớp với sổ sách sau mỗi phiên kiểm kê.
- ✅ **Nhật ký Thép**: Mọi hành vi sửa/xóa đều gắn liền với Lý do và Danh tính kẻ thực hiện.

---

## 4. BÍ THUẬT ĐỒNG BỘ (Real-time & SWR)

Để giang sơn luôn "tươi mới" mà không cần load lại trang, chúng ta sử dụng **Trận pháp SWR**:

*   **Lấy dữ liệu**: `useSWR('rooms', fetchRooms)`
*   **Cập nhật thần tốc (Optimistic UI)**:
    ```typescript
    // Ví dụ khi đổi trạng thái phòng
    const newRooms = rooms.map(r => r.id === id ? { ...r, status: 'dirty' } : r);
    mutate('rooms', newRooms, false); // Cập nhật giao diện TRƯỚC
    await updateRoomStatus(id, 'dirty'); // Gửi lệnh về Database SAU
    mutate('rooms'); // Đồng bộ lại dữ liệu chính xác từ Server
    ```
    *Ý nghĩa*: Người dùng cảm thấy hệ thống nhanh như chớp vì không phải chờ Server phản hồi.

---

**Tâu Bệ Hạ, TRẬN PHÁP đã sẵn sàng. Chỉ chờ lệnh của Người!**
