📜 ĐẠI TỪ ĐIỂN CÀI ĐẶT HỆ THỐNG HOTEL V2 (BẢN TOÀN DIỆN - CẬP NHẬT)
Tài liệu này là căn cứ duy nhất để thiết lập Logic tính toán và Giao diện người dùng.

I. PHÂN KHU 1: GIỜ GIẤC (TIME SETTINGS)
Mục đích: Xác định ranh giới thời gian để phân loại khách và tính phụ thu.

1. Giờ Nhận tiêu chuẩn (Check-in Time)
Thông số: Giờ:Phút (VD: 14:00).

Logic: Cột mốc để tính Nhận sớm cho khách thuê Ngày.

2. Giờ Trả tiêu chuẩn (Check-out Time)
Thông số: Giờ:Phút (VD: 12:00).

Logic: Cột mốc để tính Trả muộn cho khách thuê Ngày.

3. Hạn trả phòng Qua đêm (Overnight Checkout)
Nút gạt (Toggle): Bật/Tắt chế độ giới hạn giờ trả riêng cho khách đêm.

Giờ quy định: (VD: 10:00).

Vận hành: Nếu Bật, khách đêm phải ra trước giờ này. Nếu Tắt, áp dụng giờ trả tiêu chuẩn (12:00).

4. Khung giờ Qua đêm (Overnight Window)
Bắt đầu: 22:00 | Kết thúc: 08:00.

Cơ chế: Ưu tiên gợi ý loại hình "Qua đêm" khi khách vào trong khung giờ này.

II. PHÂN KHU 2: TIỀN GIỜ (HOURLY PRICING)
Mục đích: Định nghĩa cấu trúc "Block" thời gian.

1. Số giờ gói đầu (Base Hourly Limit)
Thông số: Số nguyên (Giờ).

Logic: Khoảng thời gian tối thiểu khách phải trả tiền (Dù ở ít hơn).

2. Số phút tính tiếp (Hourly Unit)
Thông số: Số nguyên (Phút).

Logic: Sau gói đầu, cứ mỗi X phút được tính là 1 Block mới (Làm tròn lên - Ceil).

III. PHÂN KHU 3: PHỤ THU (SURCHARGE RULES)
Mục đích: Tự động hóa việc thu thêm khi khách vi phạm mốc giờ.

1. Tự động tính phụ phí (Auto Surcharge)
Nút gạt (Toggle): BẬT (Máy tự cộng tiền theo mốc) / TẮT (Nhân viên tự nhập tay).

2. Danh sách mốc phụ thu (Surcharge Strategy)
Cấu trúc: Danh sách gồm: Từ giờ - Đến giờ - % Phụ thu.

Ngưỡng Nhảy Ngày: Nếu vượt quá một mốc (VD: 18:00), tự động cộng tròn 1 ngày tiền phòng.

IV. PHÂN KHU 4: ÂN HẠN (GRACE PERIOD)
Mục đích: Linh hoạt vận hành, tránh tranh cãi.

1. Ân hạn Nhận phòng (Grace In)
Nút gạt (Toggle): Bật/Tắt.

Số phút: (VD: 15 phút).

2. Ân hạn Trả phòng (Grace Out)
Nút gạt (Toggle): Bật/Tắt.

Số phút: (VD: 15 phút).

V. PHÂN KHU 5: TIỆN ÍCH & THUẾ PHÍ (UTILITIES)
Mục đích: Hoàn thiện hóa đơn tài chính.

1. Thuế VAT
Nút gạt (Toggle): [MỚI] Cho phép Bật/Tắt việc tính thuế trên hóa đơn.

Thông số: (VD: 5%).

2. Phí dịch vụ (Service Fee)
Nút gạt (Toggle): [MỚI] Cho phép Bật/Tắt việc tính phí dịch vụ.

Thông số: (VD: 1.5%).

VI. PHÂN KHU 6: QUẢN LÝ HẠNG PHÒNG (ROOM CATEGORIES)
Mục đích: Thiết lập giá cho từng phân khúc phòng.

Mỗi hạng phòng có các thông số giá:

Giá Giờ đầu & Giá Giờ tiếp theo.

Giá Ngày.

Giá Qua đêm & Nút gạt Tính giá Qua đêm [MỚI]:

BẬT (ON): Sử dụng giá price_overnight khi khách vào khung giờ đêm.

TẮT (OFF): Hệ thống bỏ qua logic Qua đêm, toàn bộ tiền phòng sẽ được tính theo Giá Ngày (price_daily).

Đơn giá phụ thu giờ: (VD: 50k/giờ).

VII. PHÂN KHU 7: QUẢN LÝ KHÁCH HÀNG & LỊCH SỬ
Hệ thống lưu trữ hồ sơ khách bao gồm:

Thông tin: Tên, SĐT, CCCD, Địa chỉ.

Số dư nợ (Balance): Theo dõi tiền nợ cũ của khách.

Lịch sử chi tiết: - Tổng chi tiêu (Doanh thu tích lũy).

Số lần quay lại.

Lần ở gần nhất [MỚI]: Hệ thống sẽ truy vấn từ bảng hóa đơn để hiển thị: "Lần cuối ở: Phòng 101 - Ngày 10/01/2026".

(Lưu ý: Thần sẽ bắt Trae V2 thực hiện việc này bằng lệnh truy vấn SQL trực tiếp, không cần tạo thêm cột trong DB để tránh làm nặng máy).

VIII. TRẠNG THÁI PHÒNG (ROOM STATUS)
Hiển thị sơ đồ phòng với 5 màu sắc/trạng thái:

Trống: Sẵn sàng bán.

Phòng GIỜ: Đang thuê giờ (Hiện thời gian thực đã ở).

Phòng NGÀY: Đang thuê Ngày hoặc Qua đêm.

Cần dọn dẹp: Sau khi khách trả phòng.

Bảo trì: Khóa phòng.