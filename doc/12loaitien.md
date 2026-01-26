# TÒNG ĐỒ LUÂN CHUYỂN TIỀN TỆ - 1HOTEL
*(Phiên bản Chính thức - Cập nhật theo Kỷ luật Sắt đá)*

## I. TRIẾT LÝ: "2 NHÓM - 5 QUỸ + 1 SỔ NỢ"
Hệ thống tài chính của 1Hotel được cấu trúc lại hoàn toàn để đảm bảo sự minh bạch tuyệt đối giữa **Vận Hành** (Tiền chảy qua tay nhân viên) và **Đối Soát** (Kết quả kinh doanh của Bệ Hạ).

### NHÓM 1: VẬN HÀNH (Operation Group)
*Nơi dòng tiền thực sự chảy qua tay con người.*
1.  **QUỸ TIỀN MẶT (CASH)**: Tiền giấy nằm trong Két tại quầy.
2.  **QUỸ NGÂN HÀNG (BANK)**: Tiền nằm trong tài khoản ngân hàng của khách sạn.
3.  **QUỸ TẠM GIỮ (ESCROW)**: Tiền cọc của khách. Đây là "vùng đệm", tiền nằm ở đây chưa phải là của mình.
4.  **QUỸ CÔNG NỢ (RECEIVABLE)**: Tiền khách đang nợ (đã dùng dịch vụ/ở phòng nhưng chưa trả).

### NHÓM 2: ĐỐI SOÁT & KẾT QUẢ (Audit & Result Group)
*Nơi ghi nhận thành quả và nghĩa vụ.*
5.  **SỔ DOANH THU (REVENUE)**: Bảng tổng kết Lợi nhuận (Thu - Chi = Lãi). Đây là con số ảo để báo cáo, không phải nơi chứa tiền.
6.  **SỔ NỢ NGOÀI (EXTERNAL PAYABLES)**: Thực thể mới. Nơi ghi nhận các khoản nợ mà Khách sạn phải trả cho Bệ Hạ (do Bệ Hạ ứng tiền túi chi hộ) hoặc nợ Nhà cung cấp.

---

## II. PHÂN TÍCH CHI TIẾT 12 LOẠI DÒNG TIỀN (THE 12 FINANCIAL FLOWS)

Dưới đây là bản đồ chính xác về cách 12 loại tiền di chuyển trong hệ thống Code hiện tại.

### 1. TIỀN PHÒNG (Room Revenue)
*   **Định nghĩa**: Tiền khách phải trả cho việc lưu trú.
*   **Thời điểm**: Tự động tính hàng ngày (Accrued) hoặc khi Check-out.
*   **Dòng chảy (Flow)**:
    *   Hệ thống ghi: Tăng **[RECEIVABLE]** (Khách nợ thêm tiền phòng).
    *   *Chưa* ghi nhận vào Doanh Thu ngay (chờ thanh toán hoặc chốt ca).

### 2. TIỀN DỊCH VỤ (Service Revenue)
*   **Định nghĩa**: Nước ngọt, giặt ủi, mì ly...
*   **Thời điểm**: Khi nhân viên thêm dịch vụ vào Bill.
*   **Dòng chảy (Flow)**:
    *   Hệ thống ghi: Tăng **[RECEIVABLE]** (Khách nợ thêm tiền dịch vụ).

### 3. TIỀN CỌC (Deposit)
*   **Định nghĩa**: Khách đưa tiền trước để giữ chỗ.
*   **Thời điểm**: Khách chuyển khoản hoặc đưa tiền mặt trước khi Check-in.
*   **Dòng chảy (Flow)**:
    *   Nếu đưa Tiền mặt: Tăng **[CASH]** VÀ Tăng **[ESCROW]**.
    *   Nếu Chuyển khoản: Tăng **[BANK]** VÀ Tăng **[ESCROW]**.
    *   *Lưu ý:* Tuyệt đối không tăng [REVENUE] lúc này.

### 4. CHUYỂN CỌC THÀNH DOANH THU (Deposit Transfer)
*   **Định nghĩa**: Khi khách Check-out, lấy tiền cọc ra để trừ tiền phòng.
*   **Thời điểm**: Lúc Check-out/Thanh toán.
*   **Dòng chảy (Flow)**:
    *   Giảm **[ESCROW]** (Hết nghĩa vụ giữ tiền).
    *   Tăng **[REVENUE]** (Chính thức thành tiền của mình).
    *   Giảm **[RECEIVABLE]** (Trừ nợ cho khách).

### 5. THANH TOÁN TIỀN MẶT (Cash Payment)
*   **Định nghĩa**: Khách trả tiền phòng/dịch vụ bằng tiền giấy.
*   **Thời điểm**: Lúc Check-out hoặc thanh toán từng phần.
*   **Dòng chảy (Flow)**:
    *   Tăng **[CASH]** (Tiền vào két).
    *   Giảm **[RECEIVABLE]** (Xóa nợ cho khách).
    *   Tăng **[REVENUE]** (Ghi nhận doanh thu thực).

### 6. THANH TOÁN CHUYỂN KHOẢN / THẺ (Bank/Card Payment)
*   **Định nghĩa**: Khách trả bằng CK, Quẹt thẻ, QR Code.
*   **Thời điểm**: Lúc Check-out hoặc thanh toán từng phần.
*   **Dòng chảy (Flow)**:
    *   Tăng **[BANK]** (Tiền vào tài khoản).
    *   Giảm **[RECEIVABLE]** (Xóa nợ cho khách).
    *   Tăng **[REVENUE]** (Ghi nhận doanh thu thực).

### 7. THU NỢ CŨ (Debt Collection)
*   **Định nghĩa**: Khách nợ từ tháng trước, nay quay lại trả.
*   **Dòng chảy (Flow)**:
    *   Tăng **[CASH]** hoặc **[BANK]**.
    *   Giảm **[RECEIVABLE]** (Của khách cũ).
    *   Tăng **[REVENUE]** (Nếu hệ thống kế toán ghi nhận theo thực thu - Cash Basis).

### 8. GHI NỢ (Credit Recording)
*   **Định nghĩa**: Khách Check-out nhưng chưa trả tiền (Cho nợ).
*   **Dòng chảy (Flow)**:
    *   Giữ nguyên **[RECEIVABLE]** (Treo nợ ở đó).
    *   Không tăng [CASH]/[BANK].

### 9. CHI VẬN HÀNH - TỪ KÉT (Operational Expense - Cash)
*   **Định nghĩa**: Nhân viên lấy tiền két đi mua đá, mua rau.
*   **Dòng chảy (Flow)**:
    *   Giảm **[CASH]**.
    *   Giảm **[REVENUE]** (Ghi nhận chi phí, làm giảm lợi nhuận).

### 10. CHI VẬN HÀNH - CHỦ CHI (Owner Expense / Owner Equity)
*   **Định nghĩa**: Bệ Hạ dùng tiền túi cá nhân để trả tiền điện, mua sắm cho khách sạn.
*   **Dòng chảy (Flow) - ĐIỂM KHÁC BIỆT LỚN**:
    *   **[CASH] / [BANK]**: KHÔNG ĐỔI (Két khách sạn không mất đồng nào).
    *   Giảm **[REVENUE]**: Vẫn tính là chi phí của khách sạn.
    *   Tăng **[EXTERNAL PAYABLES]**: Ghi nợ "Khách sạn nợ Bệ Hạ X đồng".

### 11. TRẢ NỢ CHỦ (Owner Repayment)
*   **Định nghĩa**: Khách sạn lấy tiền doanh thu trả lại cho Bệ Hạ khoản đã ứng trước đó.
*   **Dòng chảy (Flow)**:
    *   Giảm **[CASH]** hoặc **[BANK]** (Tiền thực chảy ra).
    *   Giảm **[EXTERNAL PAYABLES]** (Xóa nợ với Bệ Hạ).
    *   **[REVENUE]**: KHÔNG ĐỔI (Vì chi phí đã tính ở bước 10 rồi, giờ chỉ là trả nợ).

### 12. HOÀN CỌC (Deposit Refund)
*   **Định nghĩa**: Khách hủy phòng đúng luật, trả lại tiền cọc.
*   **Dòng chảy (Flow)**:
    *   Giảm **[CASH]** hoặc **[BANK]**.
    *   Giảm **[ESCROW]**.
    *   Không ảnh hưởng **[REVENUE]** hay **[RECEIVABLE]**.

### 13. ĐIỀU CHỈNH / GIẢM GIÁ (Adjustments)
*   **Định nghĩa**: Bớt tiền lẻ cho khách, Discount khuyến mãi.
*   **Dòng chảy (Flow)**:
    *   Giảm **[RECEIVABLE]** (Xóa bớt nợ cho khách).
    *   Không thu được tiền về [CASH]/[BANK].
    *   Được ghi nhận là một khoản "Giảm trừ doanh thu" trong báo cáo.

---
*Tài liệu này được cập nhật tự động dựa trên Logic Code tại `trg_update_wallets` và `implement_external_payables.sql`.*
