# 💰 HỆ THỐNG QUẢN LÝ THU CHI & LUÂN CHUYỂN TIỀN TỆ (1HOTEL2)

> **⚠️ QUY ĐỊNH TỐI CAO:** KHI SỬA BẤT KỲ DÒNG, TỪ NÀO TRONG FILE NÀY THÌ PHẢI HỎI Ý KIẾN CỦA TA.
> **Triết lý:** Minh bạch tuyệt đối giữa **Dòng tiền vật lý** (Tiền trong túi) và **Doanh thu kế toán** (Thành quả kinh doanh). Tuân thủ chế độ **Kế toán dồn tích (Accrual Basis)** theo Rule 8.

---

## 1. Hệ thống 5 Quỹ + 1 Sổ Nợ (Wallets)

| ID Ví | Tên hiển thị | Loại | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| **CASH** | Quỹ Tiền Mặt | Vật lý | Tiền giấy thực tế đang nằm trong két sắt tại quầy. |
| **BANK** | Quỹ Ngân Hàng | Vật lý | Tiền thực tế nằm trong tài khoản ngân hàng (CK, Quẹt thẻ). |
| **ESCROW** | Tiền Cọc (Tạm giữ) | Nghĩa vụ | Tiền khách đã trả trước nhưng chưa tiêu dùng dịch vụ. |
| **RECEIVABLE** | Công nợ tạm | Tài sản | Tiền khách đang nợ (đã dùng phòng/DV nhưng chưa trả tiền). |
| **REVENUE** | Sổ Doanh Thu | Kết quả | Con số ảo phản ánh Lợi nhuận (Tổng Thu dồn tích - Tổng Chi). |
| **PAYABLE** | Sổ Nợ Ngoài | Nghĩa vụ | Khoản tiền khách sạn đang nợ Bệ Hạ (do chi hộ) hoặc NCC. |

---

## 2. Bản đồ luân chuyển 12 loại dòng tiền (Flows)

Dưới đây là logic hạch toán tự động tại Database (Trigger `fn_sync_wallets`).

### A. Nhóm Ghi nhận (Phát sinh dịch vụ)
| STT | Nghiệp vụ | Hình thức | Luồng tiền | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Tiền phòng** | Credit | **RECEIVABLE (+)**, **REVENUE (+)** | Ghi nhận ngay khi khách ở (Daily/Milestone). |
| 2 | **Tiền dịch vụ** | Credit | **RECEIVABLE (+)**, **REVENUE (+)** | Ghi nhận ngay khi thêm dịch vụ vào Bill. |

### B. Nhóm Thanh toán (Tiền vào két)
| STT | Nghiệp vụ | Hình thức | Luồng tiền | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| 3 | **Tiền cọc** | Cash/Bank | **CASH/BANK (+)**, **ESCROW (+)** | Tiền vào túi nhưng chưa tính Doanh thu. |
| 4 | **Thanh toán** | Cash/Bank | **CASH/BANK (+)**, **RECEIVABLE (-)** | Chuyển nợ của khách thành tiền mặt. |
| 5 | **Chuyển cọc** | Transfer | **ESCROW (-)**, **RECEIVABLE (-)** | Lấy tiền cọc để trừ nợ phòng lúc Checkout. |
| 6 | **Thu nợ cũ** | Cash/Bank | **CASH/BANK (+)**, **RECEIVABLE (-)** | (Hoặc ví DEBT nếu khách đã Checkout). |

### C. Nhóm Chi phí (Tiền ra khỏi két)
| STT | Nghiệp vụ | Hình thức | Luồng tiền | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| 7 | **Chi vận hành** | Cash/Bank | **CASH/BANK (-)**, **REVENUE (-)** | Nhân viên lấy tiền két đi mua sắm. |
| 8 | **Chủ chi hộ** | Owner | **PAYABLE (+)**, **REVENUE (-)** | Bệ Hạ chi tiền túi. Két khách sạn không đổi. |
| 9 | **Trả nợ Chủ** | Cash/Bank | **CASH/BANK (-)**, **PAYABLE (-)** | Khách sạn trả lại tiền cho Bệ Hạ. |

### D. Nhóm Hoàn trả & Hủy bỏ (Điều chỉnh)
| STT | Nghiệp vụ | Hình thức | Luồng tiền | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| 10 | **Hoàn cọc** | Cash/Bank | **CASH/BANK (-)**, **ESCROW (-)** | Trả lại tiền cọc khi khách hủy phòng đúng luật. |
| 11 | **Hủy phòng** | Reversal | **RECEIVABLE (-)**, **REVENUE (-)** | Xóa bỏ các khoản đã ghi nhận lúc ở. |
| 12 | **Giảm giá** | Adjustment | **RECEIVABLE (-)**, **REVENUE (-)** | Bớt tiền lẻ cho khách (Discount). |

---

## 3. Kỷ luật vận hành hệ thống (Security & Integrity)

1. **Nguyên tắc Đối ứng (Double Entry):** Mọi giao dịch `cash_flow` phải tác động vào ít nhất 2 ví (hoặc 1 ví vật lý + 1 ví kết quả) để đảm bảo cân bằng.
2. **Ưu tiên System Code:** Trigger xử lý dựa trên `system_code` của danh mục thu chi. Cấm thay đổi `system_code` nếu không có lệnh của Bệ Hạ.
3. **Cấm sửa xóa lịch sử:** Mọi sai sót phải được xử lý bằng một bút toán đảo (Reversal) hoặc bút toán điều chỉnh mới. Không được xóa dòng cũ để bảo vệ tính minh bạch của Sổ cái.
4. **Kiểm tra trước khi trừ:** Khi thực hiện nghiệp vụ GIẢM (Hủy/Xóa), hệ thống tự động kiểm tra số dư của đối tượng đó trong kỳ hiện tại. Chỉ trừ khi đã có khoản cộng đối ứng.

---
*Tài liệu này là Kim chỉ nam tối cao cho mọi logic tài chính của dự án 1HOTEL2.*
