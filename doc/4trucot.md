# CHIẾN LƯỢC "TỨ TRỤ TÀI CHÍNH" - 1HOTEL
*Nguyên tắc "Bằng chứng thép": Không dựa vào lòng người, chỉ dựa vào logic khép kín.*

---

## 🏛 TRỤ CỘT 1: QUẢN LÝ CA & KÉT TIỀN (SHIFT & CASH DRAWER)
*Mục tiêu: Quy trách nhiệm cầm tiền cho từng cá nhân tại từng thời điểm.*

### 1.1. Đăng nhập 2 lớp (Double-Lock Entry)
- **Username:** Định danh duy nhất do Admin cấp (Biết ai là ai).
- **Mã PIN:** Dãy 4 số BẮT BUỘC do nhân viên tự quản lý (Chứng minh đúng là người đó).

### 1.2. Ba trạng thái vận hành mã PIN
- **Mở cổng (Activation):** Nhập Username + PIN để bắt đầu ca và mở "Két tiền ảo".
- **Khóa phiên (Auto-Lock):** Sau 60s không thao tác, màn hình tự khóa. 
- **Ký tên giao dịch (Transaction Signature):** Mọi hành động nhạy cảm đều bắt buộc nhập PIN.
- **Tự quản trị (Self-Service):** Nhân viên có quyền tự đổi mã PIN của mình (yêu cầu nhập đúng PIN cũ).

### 1.3. Bằng chứng thép (Ironclad Audit Trail)
*Quy tắc: "Mọi thay đổi đều phải có tên người chịu trách nhiệm"*
- **Verified Staff ID:** Hệ thống lưu `verified_by_staff_id` vào Database cho mọi giao dịch nhạy cảm.
- **Verified Staff Name:** Lưu snapshot tên nhân viên tại thời điểm xác thực (tránh trường hợp nhân viên đổi tên sau này).
- **Phạm vi áp dụng:** Hóa đơn, Giao dịch thu/chi, Thay đổi trạng thái phòng, Hủy dịch vụ.

---

## 🏛 TRỤ CỘT 2: DÒNG TIỀN TỰ ĐỘNG (AUTOMATED LEDGER)
*Mục tiêu: Triệt tiêu việc "quên" ghi sổ, đảm bảo dữ liệu luôn khớp với vận hành.*

### 2.1. Trigger Giao dịch Tự động
- **Check-out:** Tự động tạo phiếu Thu.
- **Nhập kho:** Tự động tạo phiếu Chi.
- **Hoàn tiền:** Tự động tạo phiếu Chi hoàn trả.

---

## 🏛 TRỤ CỘT 3: QUẢN TRỊ KHO & GIÁ VỐN (INVENTORY & COGS)
*Mục tiêu: Kiểm soát thất thoát hàng hóa và tính toán lợi nhuận gộp chính xác.*

### 3.1. Giá vốn Bình quân Gia quyền (WAC)
- Phản ánh chính xác biên lợi nhuận theo biến động giá thị trường.

---

## 🏛 TRỤ CỘT 4: PHÂN CẤP QUYỀN LỰC (PIN HIERARCHY)
*Mục tiêu: Giới hạn phạm vi tác động của từng cấp bậc nhân sự.*

### 4.1. Danh mục "Nút gạt bảo mật" (Security Toggles)
Bệ Hạ có quyền cấu hình những hành động nào bắt buộc phải nhập mã PIN mới được thực thi:

#### A. Nhóm Nhận phòng (Check-in)
- `checkin_custom_price`: Nhập giá phòng tùy chỉnh (khác giá niêm yết).
- `checkin_override_surcharge`: Tắt/Sửa phụ thu sớm/muộn tự động.
- `checkin_debt_allow`: Cho phép khách đang nợ được nhận thêm phòng.

#### B. Nhóm Dịch vụ (Folio Management)
- `folio_add_service`: Thêm dịch vụ/đồ uống vào phòng.
- `folio_remove_service`: **[CỰC NHẠY CẢM]** Xóa/Hủy món dịch vụ đã thêm.
- `folio_edit_service`: Sửa số lượng hoặc đơn giá dịch vụ đã lưu.
- `folio_change_room`: Đổi phòng cho khách.

#### C. Nhóm Thanh toán (Checkout)
- `checkout_discount`: Áp dụng giảm giá (Discount) cho hóa đơn.
- `checkout_custom_surcharge`: Thêm phụ thu thủ công.
- `checkout_mark_as_debt`: Xác nhận khách nợ (không thu tiền).
- `checkout_refund`: Hoàn tiền mặt cho khách (Ví dụ: Trả lại tiền dư, hoàn tiền cọc, hoàn trả ví khách).
- `checkout_void_bill`: Hủy hoàn toàn hóa đơn đã thanh toán xong.

#### D. Nhóm Tài chính & Kho
- `finance_create_income`: Tạo phiếu thu thủ công.
- `finance_create_expense`: Tạo phiếu chi thủ công.
- `finance_manage_cashflow_category`: Thêm/Sửa/Xóa danh mục thu chi (Cấu hình hệ thống).
- `inventory_adjust`: Điều chỉnh kho (giảm tồn do hư hỏng/mất mát).

#### E. Nhóm Nhân sự (Staff Management)
- `staff_manage_account`: Thêm/Sửa/Khóa tài khoản nhân viên.
- `staff_set_pin`: Cài đặt hoặc thay đổi mã PIN cho nhân viên.
