# NHẬT KÝ TRI THỨC DỰ ÁN 
## [2025-12-29] HỆ THỐNG ĐIỀU HÀNH 3 BÊN 
- Quy trình: Sếp (Ra lệnh) -> Gemini (Thiết kế/Prompt) -> Trae (Thực thi). 
- Mọi tương tác của sếp với Trae đều thông qua Gemini. 
## [2025-12-29] LOGIC THANH TOÁN & CHECKOUT 
- Hàm xử lý: `process_checkout_transaction` (RPC). 
- Logic: Đóng booking -> Ghi Invoice -> Giải phóng phòng ('dirty') -> Đóng RoomCheck. 
## [2025-12-29] LOGIC DỌN PHÒNG 
- Chức năng: Chuyển từ 'dirty' sang 'available'. 
- Hàm xử lý: `update_room_status_v2` (RPC). 
