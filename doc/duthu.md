# 📊 CHỨC NĂNG: DỰ THU THỰC TẾ TRONG NGÀY (EXPECTED REVENUE)

> **Mục tiêu:** Trả lời chính xác câu hỏi của Chủ khách sạn tại bất kỳ thời điểm nào: *"Hôm nay dự trù có thể kiếm được bao nhiêu tiền?"*

---

## 1. Định nghĩa & Ý nghĩa
- **Bản chất:** Đây là con số **Tham khảo nhanh** về dòng tiền tiềm năng trong ngày. 
- **Đặc điểm:** Không ảnh hưởng đến logic tính tiền thực tế trên hóa đơn hay sổ sách kế toán chính thống.
- **Chu kỳ:** Bắt đầu từ 0 và tự động Reset về 0 sau mỗi mốc **Night Audit** (được quy định trong cài đặt khách sạn).

---

## 2. Công thức tính toán (Mật lệnh vận hành)

Hệ thống ghi nhận biến động vào một sổ cái riêng (`daily_expected_ledger`) dựa trên các sự kiện sau:

### A. Các sự kiện làm TĂNG con số (+)
1. **Check-in (Phòng Ngày/Đêm):** Cộng ngay `[Tiền phòng 1 ngày]` + `[Phụ thu sớm]` + `[Tiền dịch vụ ban đầu]`.
2. **Check-out (Phòng Giờ):** Cộng `[Tiền phòng thực tế]` + `[Phụ thu muộn]`.
3. **Phát sinh Dịch vụ/Phụ thu:** Cộng ngay giá trị dịch vụ/phụ thu mới vào thời điểm nhân viên nhập máy (áp dụng cho cả phòng Giờ và Ngày).
4. **Mốc tính thêm ngày (Stay-over):** Khi hệ thống tự động nhảy tiền phòng cho khách ở nhiều ngày, cộng thêm `[Tiền phòng 1 ngày]`.

### B. Các sự kiện làm GIẢM con số (-)
1. **Hủy phòng:** Trừ lại toàn bộ số tiền đã từng được cộng vào dự thu của booking đó.
2. **Sửa giá/Giảm giá:** Trừ đi phần giá trị chênh lệch bị giảm xuống.
3. **Xóa dịch vụ:** Trừ đi giá trị của dịch vụ vừa xóa khỏi hóa đơn.

### C. Các trường hợp GIỮ NGUYÊN (0)
1. **Check-out (Phòng Ngày/Đêm):** Không tác động, vì tiền này đã được ghi nhận lúc khách vào hoặc lúc nhảy mốc tính thêm ngày.
2. **Tiền dịch vụ lúc Check-out phòng Giờ:** Không cộng thêm (vì đã cộng lúc nhập máy ở bước A.3), tránh lỗi cộng trùng 2 lần.

---

## 3. Quy trình kỹ thuật (Database First)

- **Lưu trữ:** Sử dụng bảng độc lập `daily_expected_ledger` để lưu vết biến động (Audit Trail).
- **Tự động hóa:** 03 Trigger ngầm (`trg_expected_revenue_bookings`, `trg_expected_revenue_services`, `trg_expected_revenue_milestones`) trực tiếp lắng nghe thay đổi dữ liệu để cập nhật sổ cái.
- **Truy vấn:** RPC `fn_get_daily_expected_revenue` tự động tìm mốc Night Audit trong `settings` để tính tổng số tiền từ mốc đó đến hiện tại.

---

## 4. Hiển thị giao diện
- **Vị trí:** Hiển thị tại `DashboardHeader` với biểu tượng **TrendingUp** màu xanh lá.
- **Cập nhật:** Tự động làm mới mỗi khi nhấn nút "Cập nhật" trên Dashboard hoặc khi có biến động dữ liệu thời gian thực.

---
*Tuân thủ Hiến pháp Dự án 1HOTEL2 - Bảo tồn di sản & Nhất thống mật lệnh.*