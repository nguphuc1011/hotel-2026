BẢN MÔ TẢ CHI TIẾT LOGIC TÍNH TIỀN KHÁCH SẠN (PHIÊN BẢN HIẾN CHƯƠNG GẮN MÃ DB)
Mọi phép tính tiền trong hệ thống đều phải tuân thủ nghiêm ngặt 5 bước dưới đây, dựa trên các nút gạt và thông số đã cài đặt.

BƯỚC 1: BỘ LỌC ÂN HẠN (GRACE PERIOD)
Mục đích: Xác định xem khách có thực sự bị tính thêm tiền hay không.

Trước khi bắt đầu tính bất kỳ loại tiền nào (Tiền giờ tiếp theo hay Tiền phụ thu), hệ thống phải kiểm tra Nút gạt Ân hạn:

Khi nhận phòng: Nếu nút gạt "Ân hạn nhận" (settings.grace_in_enabled) đang Bật, hệ thống sẽ lấy số phút cài đặt (settings.grace_minutes) (ví dụ 15 phút). Nếu khách vào sớm hơn giờ quy định (settings.check_in_time) nhưng vẫn trong vòng 15 phút đó, hệ thống coi như khách vào Đúng giờ.

Khi trả phòng: Nếu nút gạt "Ân hạn trả" (settings.grace_out_enabled) đang Bật, hệ thống cho phép khách trả muộn hơn giờ quy định (settings.check_out_time hoặc settings.overnight_checkout_time) một khoảng thời gian bằng số phút cài đặt (settings.grace_minutes). Nếu khách ra trong khoảng này, hệ thống coi như khách trả Đúng giờ.

Lưu ý: Nếu các nút gạt này (settings.grace_in_enabled, settings.grace_out_enabled) Tắt, chỉ cần lố 1 phút là hệ thống bắt đầu tính tiền ngay lập tức.

BƯỚC 2: TÍNH TIỀN PHÒNG GỐC (BASE PRICE)
A. Đối với khách thuê GIỜ:
Gói đầu: Khách phải trả trọn gói số tiền "Giá giờ đầu" (room_categories.price_hourly) cho dù ở ít hơn "Số giờ gói đầu" (settings.base_hourly_limit) đã cài đặt.

Tính giờ tiếp theo: * Sau khi hết gói đầu và hết thời gian ân hạn, hệ thống bắt đầu tính tiền theo từng khối (Block).

Độ dài mỗi khối do Bệ Hạ cài đặt (settings.hourly_unit) (ví dụ mỗi khối 60 phút).

Quy tắc làm tròn: Chỉ cần khách chớm bước sang khối mới 1 phút, hệ thống sẽ tính tiền trọn cả khối đó (room_categories.price_next_hour) (không tính lẻ theo phút).

Điểm chặn: Tổng tiền thuê giờ sẽ tăng dần nhưng không bao giờ được vượt quá Giá Ngày (room_categories.price_daily). Nếu tính ra tiền giờ cao hơn giá ngày, hệ thống tự động chốt lấy Giá Ngày.

B. Đối với khách thuê QUA ĐÊM:
Hệ thống chỉ áp dụng giá này khi Nút gạt Qua đêm (room_categories.overnight_enabled) của hạng phòng đó đang Bật và giờ vào nằm đúng khung giờ quy định (settings.overnight_start đến settings.overnight_end).

Giá phòng là một con số cố định (Giá Qua Đêm) (room_categories.price_overnight).

C. Đối với khách thuê NGÀY & NHIỀU NGÀY:
Hệ thống tính tiền theo từng chu kỳ ngày (từ giờ nhận hôm nay đến giờ trả hôm sau).

Khi nào cộng thêm ngày mới? Hệ thống sẽ không tự động cộng ngày vào lúc 12:00 trưa. Thay vào đó, nó sẽ đợi đến khi khách trả phòng. Nếu khách trả muộn quá mốc 100% (settings.full_day_late_after, ví dụ 18:00) và không nằm trong ân hạn trả (settings.grace_out_enabled + settings.grace_minutes), hệ thống sẽ cộng thêm 1 ngày tiền phòng (room_categories.price_daily).

BƯỚC 3: TÍNH PHỤ THU (NHẬN SỚM / TRẢ MUỘN)
Mục đích: Thu thêm tiền khi khách chiếm dụng phòng ngoài giờ quy định.

Logic này chỉ chạy nếu nút gạt "Tự động tính phụ phí" (settings.auto_surcharge_enabled) đang Bật. Hệ thống có hai cách tính dựa trên Nút gạt Chế độ phụ thu (room_categories.surcharge_mode):

Cách 1: Tính theo PHẦN TRĂM (%)
Hệ thống lấy Giờ thực tế của khách đối chiếu với danh sách các mốc thời gian trong cài đặt (settings.surcharge_rules):

Ví dụ: Khách trả muộn rơi vào khung "12:00 - 15:00" có mức thu 30%. Hệ thống sẽ lấy: Giá Ngày (room_categories.price_daily) x 30% để ra tiền phụ thu.

Cách 2: Tính theo SỐ TIỀN CỨNG (Số tiền/Giờ)
Hệ thống tính xem khách đã lố bao nhiêu tiếng so với giờ quy định:

Lấy số phút lố trừ đi số phút ân hạn (settings.grace_minutes).

Lấy số phút còn lại chia cho 60 để ra số giờ. Luôn làm tròn lên (ví dụ lố 1 tiếng 10 phút tính là 2 tiếng).

Lấy số giờ đó nhân với số tiền cài đặt tại hạng phòng (room_categories.hourly_surcharge_amount) (ví dụ 50.000đ/giờ).

Quy tắc loại trừ (chống tính 2 lần):
- Thuê ngày: Nếu giờ trả thực tế vượt mốc 100% (settings.full_day_late_after) và không trong ân hạn, Base Ngày sẽ cộng thêm 1 ngày và Phụ thu Trả Muộn = 0.
- Thuê ngày: Nếu chưa vượt mốc 100%, chỉ tính Phụ thu Trả Muộn theo chế độ (amount/percent) và luật trong settings.surcharge_rules.
- Thuê qua đêm: dùng settings.overnight_checkout_time làm giờ chuẩn để xét phụ thu trễ; áp dụng ân hạn trả nếu bật.
- Thuê giờ: không áp dụng phụ thu sớm/trễ.

BƯỚC 4: TIỀN DỊCH VỤ VÀ CHIẾT KHẤU
Cộng toàn bộ tiền nước uống, đồ ăn mà khách đã dùng (bookings.services_used liên kết với services.price).

Trừ đi số tiền giảm giá hoặc phần trăm giảm giá nếu có (bookings.discount_amount).

BƯỚC 5: THUẾ VAT VÀ PHÍ DỊCH VỤ (BƯỚC CUỐI)
Hệ thống kiểm tra các nút gạt ở Tab Tiện ích để quyết định:

Phí dịch vụ: Nếu nút gạt Bật (settings.service_fee_enabled), hệ thống lấy tổng tiền vừa tính ở trên nhân với tỉ lệ % (settings.service_fee_percent) (ví dụ 1.5%). Nếu Tắt, bỏ qua bước này.

Thuế VAT: Nếu nút gạt Bật (settings.vat_enabled), hệ thống lấy tổng tiền (bao gồm cả phí dịch vụ) nhân với tỉ lệ % (settings.vat_percent) (ví dụ 5%). Nếu Tắt, bỏ qua bước này.

Công nợ & Tiền cọc: Cuối cùng, hệ thống lấy tổng số tiền trên trừ đi tiền khách đã đặt cọc (bookings.deposit_amount) và cộng thêm số nợ cũ (nếu có) (customers.balance) để ra con số cuối cùng khách phải trả.
