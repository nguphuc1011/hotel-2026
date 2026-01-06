## Sơ đồ luồng tiền & hàng (Phiên bản tổng lực)
- Night Audit: Quét bookings đang active mỗi ngày -> ghi `room_charge` vào `transactions` -> giảm `customers.balance`.
- Check-out thiếu tiền: Đóng đơn -> phần thiếu chuyển vào `customers.balance` (âm).
- Tái ngộ: Hiển thị cảnh báo nợ cũ trên Dashboard -> chọn gộp vào Folio hoặc để treo.
- Trả nợ từng phần: Gọi RPC `handle_debt_payment` với số tiền bất kỳ -> ghi `transactions: debt_recovery` và `financial_transactions: income` -> tăng `customers.balance`.
- Đảo giao dịch: Tạo `transactions: reversal` liên kết `reference_id` để bù trừ, không xóa dữ liệu.
- Kho dịch vụ: Phát sinh dịch vụ -> cập nhật `inventory_audits` khi điều chỉnh tồn; view hàng treo hỗ trợ đối soát.
- Phương thức & Lễ tân: Mọi ghi nhận tiền đều kèm `method` và `cashier` để kiểm soát.
