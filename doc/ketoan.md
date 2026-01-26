# HIẾN CHƯƠNG TÀI CHÍNH KHÁCH SẠN (HOTEL FINANCIAL CHARTER)
*(Phiên bản Kỷ luật Sắt đá - Đã cập nhật Sổ Nợ Ngoài)*

## CHƯƠNG I: HỆ THỐNG "2 NHÓM - 6 THỰC THỂ" (THE 2-GROUP 6-ENTITY SYSTEM)
Mọi đồng tiền trong hệ thống không tồn tại chung chung mà bắt buộc phải cư ngụ tại một trong 6 Thực thể logic sau, chia làm 2 nhóm:

### NHÓM 1: VẬN HÀNH (Operation Group)
*Tiền qua tay nhân viên - Phải khớp với tiền thật đếm được.*

1.  **Quỹ Tiền Mặt (Cash Account):**
    *   **Bản chất:** Tiền giấy thực tế tại quầy (Cash on hand).
    *   **Nguyên tắc:** Gắn chặt với phiên làm việc (Shift). Tổng tiền mặt = Đầu ca + Thu - Chi.

2.  **Quỹ Ngân Hàng (Bank Account):**
    *   **Bản chất:** Tiền trong tài khoản Bank, POS, ví điện tử.
    *   **Quản lý:** Kiểm soát qua sao kê ngân hàng.

3.  **Quỹ Tạm Giữ (Escrow/Deposit Account):**
    *   **Bản chất:** Tiền cọc của khách (Nợ khách hàng).
    *   **Nguyên tắc:** Đây là "Vùng đệm". Tuyệt đối không được tính vào Doanh thu cho đến khi Check-out.

4.  **Quỹ Công Nợ (Receivable Account):**
    *   **Bản chất:** Tiền khách đang nợ (Ví công nợ định danh).
    *   **Quản lý:** Ghi nhận giá trị dịch vụ đã cung cấp nhưng chưa thu tiền.

### NHÓM 2: ĐỐI SOÁT & KẾT QUẢ (Audit & Result Group)
*Sổ sách ghi nhận nghĩa vụ và thành quả.*

5.  **Sổ Doanh Thu (Revenue) - [LINH HỒN CỦA DỰ ÁN]:**
    *   **Bản chất:** Đây là "Cuốn Nhật Ký Thành Tích" (Scoreboard) của khách sạn, KHÔNG phải là cái ví đựng tiền.
    *   **Chức năng:** Trả lời câu hỏi "Tháng này làm ăn lời lỗ bao nhiêu?".
    *   **Nguyên tắc "Thực thu" (Cash Basis):**
        *   Khách đưa tiền (Vào Két/Bank) -> Doanh thu TĂNG.
        *   Khách nợ (Ghi sổ) -> Doanh thu ĐỨNG YÊN (Chưa được tính là lời).
        *   Chi phí (Điện, nước) -> Doanh thu GIẢM.
    *   **Lưu ý:** Bạn không thể rút tiền từ Sổ Doanh Thu để đi chợ. Bạn rút tiền từ Két (Cash), và Sổ Doanh Thu sẽ ghi lại việc đó là "Chi phí".
    *   **PHƯƠNG TRÌNH VÀNG (The Golden Equation):**
        > **Sổ Doanh Thu (REVENUE) = [Quỹ Tiền Mặt + Quỹ Ngân Hàng] - [Quỹ Tạm Giữ + Sổ Nợ Ngoài]**
        *(Nghĩa là: Tiền thực có trong tay trừ đi các khoản Nợ phải trả thì mới ra Lợi nhuận thực sự của Bệ Hạ)*

6.  **Sổ Nợ Ngoài (External Payables) - [MỚI]:**
    *   **Bản chất:** Nơi ghi nhận các khoản Khách sạn nợ Bệ Hạ (do Bệ Hạ chi tiền túi) hoặc nợ Nhà cung cấp.
    *   **Nguyên tắc:** Tách biệt hoàn toàn với Quỹ Tiền Mặt. Bệ Hạ chi tiền -> Két không giảm -> Nợ tăng.

---

## CHƯƠNG II: ĐỊNH DANH DÒNG TIỀN & PHÂN TẦNG DỮ LIỆU
Hệ thống xử lý mọi biến động thông qua 3 lớp nhãn dữ liệu bắt buộc:

### 1. Phân loại theo Nguồn (Transaction Type)
*   **Tiền Phòng:** Tự động phát sinh theo cấu hình thời gian (Accrued).
*   **Tiền Hàng/Dịch vụ:** Nước, mì, giặt ủi...
*   **Tiền Cọc:** Giữ chỗ, bảo đảm.
*   **Tiền Thu Nợ Cũ:** Khách cũ trả nợ.
*   **Tiền Bồi Thường:** Khách đền bù hư hại.
*   **Chủ Chi (Owner Expense):** Bệ Hạ tự bỏ tiền túi chi phí (Điện, nước...).

### 2. Phân loại theo Phương thức (Payment Method)
*   **Cash:** Tiền mặt.
*   **Bank/Transfer/QR:** Chuyển khoản.
*   **POS:** Quẹt thẻ.
*   **Credit:** Ghi nợ (Tăng Receivable).
*   **Owner Equity:** Vốn chủ sở hữu (Tăng External Payables).

### 3. Phân loại theo Biến động nội bộ (Internal Movements)
*   **Chi vận hành (Từ Két):** Nhân viên lấy tiền két mua đồ -> Giảm Cash, Giảm Revenue.
*   **Chi vận hành (Chủ chi):** Bệ Hạ mua đồ -> Tăng External Payables, Giảm Revenue (Két không đổi).
*   **Trả nợ Chủ:** Lấy tiền doanh thu trả lại Bệ Hạ -> Giảm Cash/Bank, Giảm External Payables.

---

## CHƯƠNG III: QUY TRÌNH "KHAI THÁC - GHI NỢ - TẤT TOÁN"
Dòng chảy tiền hàng và dịch vụ được cưỡng chế theo quy trình 3 giai đoạn:

1.  **Giai đoạn Khai thác (The Charge):**
    *   Ngay khi dùng dịch vụ: Trừ kho + Tăng nợ khách (Receivable).
    *   Chưa ghi nhận Doanh thu.

2.  **Giai đoạn Pending (Tranh chấp):**
    *   Các khoản chưa rõ ràng được gắn nhãn Pending.

3.  **Giai đoạn Tất toán (The Settlement):**
    *   Khi Check-out: Hệ thống dùng Tiền Cọc + Tiền Thanh Toán để "xóa sổ" khoản Nợ.
    *   Lúc này tiền mới chính thức chuyển sang Sổ Doanh Thu.

---

## CHƯƠNG IV: KỶ LUẬT "BẰNG CHỨNG THÉP" & ĐỐI SOÁT
Mọi hành động tài chính phải tuân thủ 3 trụ cột bảo mật:

1.  **Audit Log Bất biến:** Không bao giờ có lệnh DELETE. Sai thì phải dùng bút toán đảo (Reversal).
2.  **Quyền Lực Tập Trung:** Chỉ Owner mới có quyền Rút tiền lợi nhuận hoặc Trả nợ chủ (kèm PIN xác thực).
3.  **Cơ chế "Đếm tiền mù" (Blind Close):** Nhân viên nhập số thực tế trước -> Hệ thống mới hiện số máy tính -> Lệch là giải trình.
4.  **Bằng chứng chi tiền:** Mọi khoản chi Nợ Ngoài bắt buộc phải có `evidence_url` (Ảnh hóa đơn).

---

## CHƯƠNG V: CHẾ ĐỘ BÁO CÁO QUẢN TRỊ
*   **Báo cáo Thất thoát:** Soi các khoản Giảm giá/Hủy.
*   **Báo cáo Dòng tiền:** Tách bạch Tiền thực (Cash flow) và Lợi nhuận (Profit).
*   **Báo cáo Nợ Ngoài:** Theo dõi Khách sạn đang nợ Bệ Hạ bao nhiêu.

*Kiến trúc sư trưởng khẳng định: Đây là bản Hiến pháp Tài chính chuẩn xác nhất, đồng bộ hoàn toàn với logic Code hiện hành.*
