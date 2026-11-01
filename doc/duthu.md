# 📊 CHỨC NĂNG: DỰ THU THỰC TẾ TRONG NGÀY (EXPECTED REVENUE)

> **⚠️ QUY ĐỊNH TỐI CAO:** KHI SỬA BẤT KỲ DÒNG, TỪ NÀO TRONG FILE NÀY THÌ PHẢI HỎI Ý KIẾN CỦA TA.
> **Mục tiêu:** Trả lời chính xác câu hỏi của Chủ khách sạn: *"Hôm nay dự trù có thể kiếm được bao nhiêu tiền?"* dựa trên mốc kế toán Night Audit.

---

## 1. Nguyên tắc cốt lõi
1. **Độc lập tuyệt đối:** Công thức Dự thu không liên quan đến bất kỳ logic nghiệp vụ tính toán nào khác (như báo cáo doanh thu thực tế, kế toán thuế). Nó chỉ lấy dữ liệu (Read-only) để phục vụ hiển thị tham khảo, không làm thay đổi dữ liệu gốc của Booking hay Bill.
2. **Mốc thời gian (Reset):** Con số này bắt đầu từ 0 và tự động Reset về 0 tại thời điểm được quy định trong **Night Audit** (Cài đặt khách sạn).
3. **Phân vùng ngày kế toán:** Mọi sự kiện phát sinh (Check-in, Check-out, Milestone, Dịch vụ) thuộc về ngày kế toán nào (dựa trên mốc Night Audit) thì sẽ được tính vào Dự thu của ngày đó. 
4. **Kỷ luật hoàn trả (Subtract Rule):** Trước khi trừ bất kỳ khoản nào (do Hủy phòng hoặc Xóa dịch vụ), hệ thống BẮT BUỘC phải kiểm tra xem khoản đó đã được cộng vào con số Dự thu của "ngày kế toán hiện tại" chưa? Chỉ được phép trừ khi khoản đó đã được ghi nhận (cộng) trước đó trong cùng kỳ.

---

## 2. Bảng mô tả chi tiết chức năng (Kim chỉ nam)

| Sự kiện | Loại phòng | Tác động | Điều kiện & Ghi chú |
| :--- | :--- | :--- | :--- |
| **Check-in** | Giờ (Hourly) | **0** | Không ghi nhận gì cả. |
| **Check-in** | Ngày (Daily) | **+** | Cộng [01 ngày tiền phòng] + [Phụ thu vào sớm] (nếu bật cấu hình). |
| **Check-out** | Giờ (Hourly) | **+** | Cộng [Toàn bộ tiền phòng thực tế] + [Toàn bộ dịch vụ]. |
| **Check-out** | Ngày (Daily) | **0** | Không làm gì cả (Tiền đã cộng lúc Check-in/Milestone). |
| **Stay-over (Milestone)** | Ngày (Daily) | **+** | Đợi đến mốc "Tính thêm 1 ngày" trong cài đặt. Chỉ cộng nếu đã qua ít nhất 01 ngày kể từ lúc Check-in. |
| **Thêm Dịch vụ** | Tất cả | **+** | Cộng ngay giá trị dịch vụ [Số lượng x Đơn giá]. |
| **Xóa Dịch vụ** | Tất cả | **-** | **CHỈ TRỪ** nếu dịch vụ này được thêm trong cùng ngày kế toán hiện tại. |
| **Hủy phòng** | Giờ (Hourly) | **0** | Không làm gì cả. |
| **Hủy phòng** | Ngày (Daily) | **-** | **CHỈ TRỪ** đúng số tiền đã cộng vào Dự thu của ngày kế toán hiện tại. |

---

## 3. Công thức vận hành chi tiết

### A. Đối với Phòng Giờ (Hourly)
1. **Check-in:** Dự thu giữ nguyên.
2. **Check-out:** Toàn bộ tiền phát sinh (Phòng + DV) sẽ được tính cho ngày kế toán tại thời điểm bấm Check-out.
   - *Ví dụ:* Night Audit là 06:00. Khách vào 04:00 (Ngày 1), Out 07:00 (Ngày 1) -> Toàn bộ tiền tính vào Dự thu **Ngày 2**.
3. **Hủy phòng:** Không làm gì cả.

### B. Đối với Phòng Ngày (Daily/Overnight)
1. **Check-in:** Ghi nhận ngay doanh thu "cam kết" của ngày đầu tiên.
2. **Stay-over:** 
   - Không cộng dồn 2 ngày trong cùng 1 ngày thực tế.
   - *Ví dụ:* Check-in 14:00 (Ngày 1). Mốc cộng thêm là 18:00. Đến 18:00 (Ngày 1) -> KHÔNG CỘNG. Phải đến 18:00 (Ngày 2) mới được cộng thêm ngày thứ 2.
3. **Hủy phòng:** Hệ thống kiểm tra sổ cái Dự thu hiện tại, nếu thấy có dòng cộng tiền của Booking này thì mới thực hiện dòng trừ tương ứng để bù trừ về 0 cho ngày hôm đó.

### C. Dịch vụ (Service)
1. **Ghi nhận:** Mọi dịch vụ thêm vào đều làm tăng Dự thu ngay lập tức.
2. **Xóa/Sửa:** Chỉ được phép trừ vào Dự thu hiện tại nếu dịch vụ đó "sinh ra và mất đi" trong cùng một chu kỳ Night Audit.

---

## 4. Quy trình kỹ thuật (Database First)

- **Lưu trữ:** Bảng độc lập `daily_expected_ledger` lưu vết Audit Trail từng dòng tiền (+/-).
- **Tự động hóa:** Trigger ngầm điều phối việc ghi sổ dựa trên các bảng `bookings` và `booking_services`.
- **Đồng bộ:** RPC `fn_refresh_expected_revenue` thực hiện quét các phòng Stay-over để tự động cộng tiền Milestone khi đến mốc quy định.

---
*Tuân thủ Hiến pháp Dự án 1HOTEL2 - Bảo tồn di sản & Nhất thống mật lệnh.*
