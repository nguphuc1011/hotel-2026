BẢN ĐẠI TỔNG PHỔ LOGIC TÍNH TIỀN KHÁCH SẠN .

Báo cáo này không chứa một dòng code nào, chỉ thuần túy là tư duy nghiệp vụ để xử lý mọi tình huống phát sinh trong thực tế vận hành.

### PHẦN 1: BA TRỤ CỘT GIÁ GỐC (BASE PRICE)
Mọi hóa đơn đều bắt đầu từ việc xác định "Hình thức ở" và "Giá cơ sở":

1. Ưu tiên số 1 - Giá thỏa thuận ( initial_price ):
   - Nếu lúc Check-in, Lễ tân đã chốt với khách một con số (Ví dụ: 200k/ngày dù giá gốc là 250k), hệ thống phải lấy con số này làm gốc. Cấm tuyệt đối việc lấy giá máy tự tính đè lên thỏa thuận với khách.
2. Ưu tiên số 2 - Giá theo Loại phòng: Nếu không có giá thỏa thuận, hệ thống soi bảng giá của loại phòng đó:
   - Ở Giờ ( hourly ): Giá = [Giá giờ đầu] + ([Số giờ tiếp theo] x [Giá mỗi giờ tiếp]).
     - Lưu ý: Phải làm tròn lên (Ceil). Khách ở 1 tiếng 10 phút vẫn tính là 2 tiếng nếu quy định là block 1 giờ.
   - Ở Ngày ( daily ): Lấy đúng giá ngày của phòng.
   - Qua đêm ( overnight ): Lấy đúng giá qua đêm.
### PHẦN 2: ĐỘNG CƠ XỬ LÝ THỜI GIAN (TIME ENGINE)
Đây là phần phức tạp nhất, nơi xảy ra tranh chấp nhiều nhất giữa Khách và Lễ tân:

1. Cơ chế Nhận sớm (Early Check-in):
   
   - So sánh thời gian Check-in thực tế với check_in_time trong cấu hình (mặc định 14:00).
   - Mốc mờ sáng: Nếu khách vào quá sớm (Ví dụ trước 05:00 sáng), hệ thống tự động nhảy sang tính thành 1 ngày tiền phòng thay vì phụ phí.
   - Mốc phụ phí: Từ 05:00 đến 14:00, chia thành các khoảng (Ví dụ: 08:00-12:00). Mỗi khoảng tương ứng với một số tiền phụ thu cố định (được nén sẵn từ % giá phòng).
2. Cơ chế Trả muộn (Late Check-out):
   
   - So sánh thời gian Check-out thực tế với check_out_time (mặc định 12:00).
   - Mốc nhảy ngày: Nếu khách trả quá muộn (Ví dụ sau 18:00), hệ thống tự động cộng thêm 1 ngày tiền phòng.
   - Mốc phụ phí: Từ 12:00 đến 18:00, chia thành các bậc (Ví dụ: 12h-15h phụ thu 30%, 15h-18h phụ thu 50%). Số % này phải được "nén" thành tiền mặt ngay từ lúc cài đặt.
3. Vùng Ân hạn (Grace Period):
   
   - Ân hạn đầu: Khách vào phòng 15 phút rồi ra (do phòng xấu, điều hòa hỏng) -> Không tính tiền.
   - Ân hạn cuối: Khách trả muộn 15 phút (do đợi thang máy, dọn đồ chậm) -> Không tính phụ phí muộn.
### PHẦN 3: TỔNG HỢP HÓA ĐƠN CUỐI CÙNG (FINAL SETTLEMENT)
Công thức tổng quát để bất kỳ trường hợp nào cũng ra kết quả:

[TỔNG DOANH THU] = [Giá phòng gốc] + [Phụ thu sớm/muộn] + [Tiền Dịch vụ] + [Phụ thu thêm người]

[SỐ TIỀN THỰC THU] = [TỔNG DOANH THU] - [Tiền Cọc] - [Nợ cũ/Tiền thừa của Khách]

Giải thích về Nợ cũ (Balance):

- Nếu khách đang nợ 500k (Balance = -500k): Số tiền phải trả sẽ tăng thêm 500k.
- Nếu khách đang có tiền dư 200k (Balance = 200k): Số tiền phải trả sẽ giảm đi 200k.
### PHẦN 4: CHIẾN LƯỢC "TRUNG DUNG" (BẢN ĐỒ CHIẾN LƯỢC)
Để RPC không bao giờ tính sai, ta thực hiện quy trình "Nén" tại Frontend:

- Đầu vào: Lễ tân nhập "Muộn 12h-15h thu 30%".
- Bộ não (Compiler): Lấy 30% x [Giá phòng VIP: 1.000.000đ] = 300.000đ.
- Đầu ra (Bản đồ): Lưu vào DB một bảng tra cứu cực đơn giản: {"VIP": {"late_12_15": 300000}, "Standard": {"late_12_15": 60000}} .
- RPC thực thi: Chỉ việc nhìn vào bảng tra cứu, lấy đúng con số 300.000đ cộng vào. Không nhân chia, không sai số.
### KẾT LUẬN: TẠI SAO BÁO CÁO NÀY TÍNH ĐƯỢC MỌI TRƯỜNG HỢP?
Bởi vì nó bao phủ hết các biến số:

- Khách ở giờ nhưng sang ngày -> Có mốc trần tiền giờ.
- Khách ở đêm nhưng trả muộn -> Có mốc trả phòng qua đêm riêng.
- Khách quen được giảm giá -> Có initial_price bảo vệ.
- Khách nợ tiền từ năm ngoái -> Có customer_balance thu hồi nợ.
Thần đã trình bày xong toàn bộ logic. Thừa tướng thấy thần đã thực sự "thấm" được nghiệp vụ của Ngài chưa? Nếu Thừa tướng gật đầu, thần mới dám xin lệnh tiếp theo.
### 1. Ý NGHĨA SINH TỬ CỦA CÁC NÚT GẠT (ON/OFF)
Các nút gạt không phải để trang trí, chúng là các "công tắc logic" điều hướng dòng tiền:

- Nút "Ân hạn" (Grace Period):
  - Nếu BẬT: Khách trả muộn 10 phút (trong ngưỡng 15 phút) -> Hệ thống xóa sạch tiền phụ thu muộn.
  - Nếu TẮT: Muộn 1 phút cũng tính tiền.
- Nút "Trần tiền giờ" (Hourly Ceiling):
  - Nếu BẬT: Khách ở 8 tiếng, tiền giờ lên 400k, nhưng giá ngày chỉ 300k -> Hệ thống tự "phanh" lại ở mức 300k (hoặc % quy định).
  - Nếu TẮT: Tiền giờ cứ thế phi mã, có khi khách ở vài tiếng trả tiền bằng 2 ngày (vô lý).
- Nút "Hạn trả phòng Qua đêm":
  - Nếu BẬT: Khách đêm phải trả phòng trước 10:00 sáng. Sau 10:00 bắt đầu tính phụ thu muộn.
  - Nếu TẮT: Khách đêm được ưu ái tới 12:00 (như khách ngày) mới bị tính muộn.
- Nút "Tự động phụ thu" (Auto Surcharge):
  - Nếu BẬT: Máy tự tính sớm/muộn theo "Bản đồ chiến lược".
  - Nếu TẮT: Máy trả kết quả phụ thu = 0đ, để Lễ tân tự quyết định số tiền (dùng cho các trường hợp ngoại lệ, khách quen).
### 2. GIẢI MÃ LỖI "CHECK-IN 16H TÍNH 2 NGÀY"
Đây là lỗi kinh điển do logic "đếm ngày" ngây thơ. Thần xin đưa ra logic chuẩn để KHÔNG BAO GIỜ tính sai trường hợp này:

Tình huống: Khách vào lúc 16:00 hôm nay, dự kiến trả 12:00 trưa mai.

- Logic Sai (Dẫn đến 2 ngày): Hệ thống thấy "Hôm nay là ngày 8, mai là ngày 9. Lấy 9 - 8 = 1 ngày. Nhưng vì khách vào sau giờ quy định (14:00) nên hệ thống lại cộng thêm 1 ngày nữa vì tưởng khách ở lấn sang ngày thứ 2". Hoặc tệ hơn là tính 1 ngày cho từ 16h-24h hôm nay và 1 ngày cho từ 0h-12h hôm mai. => SAI BÉT.
- Logic Chuẩn của Thần (Luôn là 1 ngày):
  
  1. Xác định Chu kỳ 24h: Một "Ngày ở" được tính từ Giờ nhận (14:00) hôm nay đến Giờ trả (12:00) hôm sau.
  2. Kiểm tra mốc Nhận: Khách vào 16:00 là Vào muộn . Vào muộn thì khách thiệt, khách sạn hưởng, nhưng vẫn chỉ được tính là 1 ngày gốc .
  3. Kiểm tra mốc Trả:
     - Nếu khách trả trước 12:00 trưa mai: Đúng 1 ngày.
     - Nếu khách trả từ 12:00 đến 18:00 mai: 1 ngày + Phụ thu muộn.
     - Chỉ khi khách trả SAU 18:00 (Mốc tròn ngày - full_day_late_after ), lúc này mới được phép tính là 2 ngày .
Kết luận cho trường hợp 16:00: Dù khách vào lúc 16:00 hay 20:00, nếu họ trả trước mốc "Tròn ngày" của ngày hôm sau, hệ thống bắt buộc chỉ được tính 1 ngày phòng + phụ thu (nếu có). Việc tính 2 ngày khi khách mới vào lúc 16:00 là một sự "ăn cướp" trắng trợn của logic tồi, thần tuyệt đối không để điều đó xảy ra.

### 3. LÀM SAO ĐỂ CHẮC CHẮN KHÔNG SAI?
Thần sẽ sử dụng logic "Mốc thời gian đối chiếu" :

- Lấy Thời điểm Check-out trừ đi Thời điểm Check-in để ra tổng số giờ.
- Nếu ở theo Ngày: Chỉ quan tâm khách có vi phạm mốc 18:00 (Muộn thành ngày) hay mốc 05:00 (Sớm thành ngày) hay không.
- Mọi khoảng giữa 16:00 hôm nay đến 12:00 hôm sau đều nằm trong "vùng an toàn" của 1 ngày phòng .
Thừa tướng thấy logic "phòng thủ mốc giờ" này đã đủ để trị cái lỗi "tính 2 ngày" kia chưa? Thần đã nắm trọn vẹn mọi ngóc ngách, chỉ đợi Thừa tướng ban lệnh để "hợp nhất" chúng vào bộ máy!

Thần đang chờ phán quyết của Thừa tướng!
Ngươi thấy nó nói đúng k