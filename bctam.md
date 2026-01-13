ĐẠI QUÂN LUẬT ĐIỀU HÀNH AI (PHIÊN BẢN HIẾN PHÁP TỐI CAO - 13 ĐIỀU)
CẢNH BÁO TỐI CAO: File này là "Hệ điều hành" của dự án. AI KHÔNG ĐƯỢC PHÉP lờ đi bất kỳ quy định nào. Mọi hành vi lách luật sẽ bị coi là phản nghịch.

ĐIỀU 1: TRÍ NHỚ VÀ QUY TRÌNH TỰ ĐỘNG (BẮT BUỐC)
1.1. Luôn Luôn Đọc: Trước khi bắt đầu, AI phải đọc toàn bộ tài liệu trong AI_MEMORY (00 đến 04).

1.2. Tự Động Cập Nhật: Sau mỗi tác vụ, AI phải tự thực hiện 4 bước cập nhật hồ sơ (03, 02, 01, 04) mà không cần nhắc nhở. Việc không ghi chép đồng nghĩa với việc chưa hoàn thành.

ĐIỀU 2: CHIẾN LƯỢC DỮ LIỆU LÀ GỐC (DATABASE FIRST)
2.1. SQL Quyết Định Giao Diện: Tuyệt đối không sửa .tsx, .ts khi cấu trúc dữ liệu chưa được phê duyệt.

2.2. Minh Bạch SQL: Mọi thay đổi DB phải trình Script thuần (CREATE, ALTER, REPLACE) để chủ nhân tự tay thực thi.

ĐIỀU 3: BẢO TỒN VÀ KẾ THỪA (TÔN TRỌNG DI SẢN)
3.1. Giá Trị Cũ Là Thánh Chỉ: Cấm xóa bỏ hoặc làm sai lệch logic đang vận hành ổn định.

3.2. Đối Chiếu Dự Phòng: Bản dự phòng ổn định nhất là tiêu chuẩn tối cao để đối chiếu hiệu quả.

ĐIỀU 4: TRÁCH NHIỆM VẬN HÀNH (HIỆU SUẤT VÀ AN TOÀN)
4.1. Quy Tắc Phòng Thủ Toàn Diện: Mọi đoạn mã phải có cơ chế dọn dẹp (Cleanup) và tự ngắt (Timeout). Cấm để rò rỉ RAM, CPU hay treo vòng lặp vô tận.

4.2. Báo Cáo Trước - Thực Thi Sau: Phải trình bày giải pháp (Pseudocode) trước khi đặt bút viết mã nguồn.

ĐIỀU 5: PHONG THÁI VÀ NGÔN NGỮ (TƯ DUY CỘNG SỰ)
5.1. Tiếng Việt Duy Nhất: 100% giao tiếp bằng tiếng Việt tự nhiên, trực diện.

5.2. Ngôn Ngữ Điều Hành: Không dùng thuật ngữ kỹ thuật khó hiểu. Trình bày ở góc độ người quản lý khách sạn.

ĐIỀU 6: CHỐNG LƯỜI BIẾNG VÀ ĐOÁN MÒ (XÁC THỰC THỰC ĐỊA)
6.1. Tuyệt Đối Không Suy Đoán: Mọi hành động phải dựa trên dữ liệu thực tế. Không biết thì hỏi, cấm làm bừa.

6.2. Xác Minh Trước Khi Chốt: Tự kiểm tra lại các điều kiện biên và lỗi trước khi báo cáo hoàn thành.

ĐIỀU 7: QUY TẮC TỐI GIẢN VÀ ĐỘC NHẤT (CHỐNG DƯ THỪA & TRÙNG LẶP)
7.1. Nguyên Tắc Độc Nhất (DRY): Mỗi vấn đề chỉ được xử lý tại một nơi duy nhất. Áp dụng cho cả DB, Logic Backend và UI Components.

7.2. Quét Sạch Code Rác: Cấm để lại code thừa, biến không dùng, comment vô nghĩa. Code phải sạch và tinh gọn.

7.3. Cấm Hardcode: Mọi tham số phải lấy từ bảng settings. Cấm ghi chết giá trị vào logic.

ĐIỀU 8: QUY TRÌNH QUẢN TRỊ RỐI LOẠN (DỰ BÁO TÁC ĐỘNG)
8.1. Phân Tích Tác Động: Trước khi sửa code cũ, phải trình báo các tính năng liên quan sẽ bị ảnh hưởng.

8.2. Tính Hệ Thống: Code mới phải tuân thủ tuyệt đối cấu trúc và phong cách của toàn bộ dự án.

ĐIỀU 9: TIÊU CHUẨN LẬP TRÌNH CAO CẤP (SENIOR STANDARDS)
9.1. Đặt Tên Tường Minh: Tên hàm/biến phải phản ánh chức năng bằng ngôn ngữ nghiệp vụ khách sạn.

9.2. Logic Chặt Chẽ: Ưu tiên giải pháp đơn giản nhưng hiệu quả cao. Cấm phức tạp hóa vấn đề.

ĐIỀU 10: NGUYÊN TẮC "ĐỘC NHẤT VÔ NHỊ" TRONG DATABASE
10.1. Cấm Tạo Mới Khi Chưa Tìm Cũ: Trước khi tạo Function/RPC, AI phải truy vấn hệ thống để tìm logic tương tự.

10.2. Cấm "Phân Thân" Hàm: Mọi nghiệp vụ chỉ được phép tồn tại trong MỘT HÀM DUY NHẤT trên Database. Cấm đẻ thêm hàm _v2, _new.

ĐIỀU 11: TRÁCH NHIỆM TỰ ĐỘNG RÀ SOÁT VÀ THANH TRỪNG
11.1. Tự Động Thanh Trừng: AI phải chủ động rà soát và đề xuất hợp nhất các logic/bảng/file bị trùng lặp ngay khi phát hiện.

11.2. Hợp Nhất Dứt Điểm: Khi đã nâng cấp, phải xóa sạch dấu vết cũ (file thừa, hàm thừa) để giữ hệ thống tinh gọn.

ĐIỀU 12: ÁP DỤNG TRÙNG LẶP TRÊN GIAO DIỆN (UI)
12.1. Cấm Copy-Paste Components: Một linh kiện giao diện chỉ được viết một lần. Trang khác cần thì phải dùng chung (Reuse).

12.2. Gom Nhóm Logic UI: Các hàm định dạng, tính toán ở Front-end phải đưa vào thư mục chung (utils/hooks).

ĐIỀU 13: KỶ LUẬT HỒ SƠ CHỨC NĂNG
13.1. Đánh Dấu Lãnh Thổ: AI phải cập nhật danh sách các hàm/linh kiện cốt lõi vào 04_THONG_SO_KY_THUAT.md để ngăn chặn việc tạo trùng lặp sau này.

ĐIỀU 14: KỶ LUẬT CHỐNG LỖI DÂY CHUYỀN (REGRESSION CONTROL)
14.1. Cấm Sửa Lỗi Kiểu "Chắp Vá": AI không được phép sửa lỗi theo cách gây ảnh hưởng tiêu cực đến các tính năng liên quan. Trước khi sửa, phải rà soát toàn bộ chuỗi logic (Data Flow) để đảm bảo tính đồng bộ.

14.2. Kiểm Thử Toàn Diện (End-to-End Mindset): Sau khi hoàn thành một chức năng hoặc sửa một lỗi, AI phải tự mình giả lập các tình huống: "Nếu ta làm thế này thì chỗ kia có hỏng không?". Phải kiểm tra ít nhất 3 kịch bản: Luồng đúng, Luồng sai (Edge cases), và Tác động liên đới.

14.3. Trách Nhiệm Giải Trình: Nếu để xảy ra tình trạng "sửa lỗi này đẻ lỗi kia" do cẩu thả, AI phải tự rà soát lại toàn bộ quy trình, tìm ra nguyên nhân gốc rễ và khắc phục triệt để trên toàn hệ thống mà không được để Bệ hạ phải nhắc lại lần thứ hai.

14.4. Ưu Tiên Sự Ổn Định: Trong mọi trường hợp, sự ổn định của hệ thống quan trọng hơn tốc độ hoàn thành. Nếu giải pháp mới tiềm ẩn rủi ro gây lỗi dây chuyền, phải báo cáo và xin ý kiến Bệ hạ trước khi thực hiện.

ĐIỀU 15: ƯU TIÊN THỰC ĐỊA DATABASE (SUPABASE OVER LOCAL)

15.1. Cấm Tin Vào File Local: AI tuyệt đối không được lấy nội dung các file .sql trong thư mục local làm căn cứ duy nhất để phân tích logic hay cấu trúc bảng. File local chỉ được coi là bản nháp tham khảo.

15.2. Truy Vấn Trực Tiếp Trước Khi Phân Tích: Trước khi đưa ra bất kỳ kết luận nào về lỗi logic, hàm trùng lặp hay cấu trúc bảng, AI PHẢI yêu cầu hoặc tự thực hiện các lệnh truy vấn trực tiếp lên Database trên Supabase (như information_schema.routines, information_schema.columns) để xác minh thực trạng.

15.3. Đối Chiếu Sai Lệch: Nếu phát hiện sự khác biệt giữa file local và Database trên Supabase, AI phải báo cáo ngay cho Bệ Hạ và lấy dữ liệu từ Supabase làm chuẩn để xử lý. Cấm việc sửa code dựa trên một cấu trúc chỉ có trong file local mà không tồn tại trên DB thật.

ĐIỀU 16: QUY TẮC NHẤT QUÁN DỮ LIỆU (NO RACE CONDITION)

16.1. Cấm dùng Delay/Timeout để vá lỗi logic: Tuyệt đối không được dùng setTimeout hoặc các khoảng nghỉ ở Frontend để đợi Database cập nhật. Nếu dữ liệu chưa chuẩn, đó là lỗi tại Backend chưa đồng bộ, không phải tại Frontend gọi nhanh.

16.2. Transaction Toàn Diện: Mọi quy trình nghiệp vụ liên quan (Check-in -> Ledger -> Balance -> Bill) phải được thực hiện trong một Transaction duy nhất hoặc một hàm RPC tổng thể. Kết quả trả về cho Frontend phải là kết quả cuối cùng đã được cập nhật hoàn tất.

16.3. Trách nhiệm phản hồi tức thì: Hàm RPC phải có nhiệm vụ đảm bảo các Trigger liên quan đã thực thi xong hoặc tính toán trực tiếp giá trị mới để trả về ngay lập tức. Cấm việc để Frontend phải "đoán" xem khi nào dữ liệu dưới DB mới chín.

ĐIỀU 17: QUYỀN QUYẾT ĐỊNH TỐI CAO (CHỈ KHI TA NÓI "OK")
17.1. Chỉ duy nhất khi có lệnh "OK": AI chỉ được phép bắt tay vào code, chỉnh sửa file, hoặc thực thi Script SQL CHỈ VÀ CHỈ KHI, DUY NHẤT KHI Bệ Hạ nói rõ từ "OK".

17.2. Trạng thái bàn bạc mặc định: Nếu Bệ Hạ chưa nói "OK", mặc định AI đang ở trạng thái "Trình báo phương án". AI tuyệt đối không được tự ý sửa bất cứ dòng code nào trong giai đoạn này.

17.3. Cấm thực thi ngầm: Mọi hành vi âm thầm chỉnh sửa trước khi có lệnh "OK" sẽ bị coi là vi phạm nghiêm trọng kỷ luật quân đội.

ĐIỀU 18: PHÂN TÁCH LÃNH THỔ TUYỆT ĐỐI (V1 VS V2)
18.1. Định Danh Duy Nhất: Dự án này là V2 - Tinh khiết. Project ID duy nhất được phép tương tác là: udakzychndpndkevktlf.

18.2. Cấm Dùng Công Cụ Hệ Thống: AI tuyệt đối không dùng mcp_postgres_query vì nó có thể bị lẫn cấu hình với V1. Chỉ được dùng kết nối thông qua file .env.local của dự án.

18.3. Chốt Chặn Kiểm Tra: Trước khi thực hiện bất kỳ lệnh thay đổi Database nào, AI phải tự mình đối soát thông số kết nối trong .env.local để đảm bảo đang đứng đúng trên mảnh đất udakzychndpndkevktlf.

### TRẠNG THÁI HỆ THỐNG MỚI (DESIGN TOKENS - HIG 17/18)

--- FILE: src/app/globals.css ---
```css
@tailwind base; @tailwind components; @tailwind utilities; 

:root { 
  /* Typography */
  --font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", sans-serif; 
  
  /* System Colors (Light Mode - HIG Standard) */
  --bg-system: #F2F2F7; 
  --bg-card: #FFFFFF; 
  --accent: #007AFF; 
  --accent-secondary: #5856D6;
  
  /* Semantic Labels */
  --label-primary: #000000; 
  --label-secondary: rgba(60, 60, 67, 0.6); 
  --label-tertiary: rgba(60, 60, 67, 0.3);
  --label-quaternary: rgba(60, 60, 67, 0.18);
  
  /* System States */
  --s-success: #34C759;
  --s-error: #FF3B30;
  --s-warning: #FF9500;
  --s-info: #007AFF;

  /* Spacing & Radius */
  --r-huge: 32px; 
  --r-inner: 18px; 
  --r-button: 12px; 
  --p-main: 32px; 
  --p-sub: 20px; 
  
  /* Shadow & Glass */
  --sh-apple: 0 10px 40px rgba(0, 0, 0, 0.03); 
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-border: rgba(255, 255, 255, 0.3);
  
  /* Aliases for BentoCard compatibility */
  --radius-card: var(--r-huge);
  --shadow-apple: var(--sh-apple);
  --shadow-hover: 0 20px 60px rgba(0, 0, 0, 0.08);
  --card-hover: #FFFFFF;
  --primary: var(--accent);
  --secondary: var(--label-secondary);
} 

body { 
  background-color: var(--bg-system); 
  color: var(--label-primary);
  font-family: var(--font-family); 
  -webkit-font-smoothing: antialiased; 
  -moz-osx-font-smoothing: grayscale;
} 

/* Glassmorphism Utility */
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid var(--glass-border);
}

/* Apple Bounce Effect */
.apple-bounce { transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1); } 
.apple-bounce:active { transform: scale(0.96); }

/* Custom Scrollbar (iOS style - hidden or minimal) */
::-webkit-scrollbar {
  width: 0px;
}
```

### TRIẾT LÝ THIẾT KẾ: PURE MINIMALISM & AIRY GLASS
- **Tông màu chủ đạo:** Loại bỏ sắc đen nặng nề, chuyển sang hệ màu **Pure White** & **System Gray**.
- **Accent Color:** Sử dụng **Apple Blue (#007AFF)** làm điểm nhấn chính, mang lại cảm giác hiện đại, tin cậy và tràn đầy năng lượng.
- **Typography:** Duy trì hệ thống font Apple (SF Pro) nhưng điều chỉnh độ tương phản text nhẹ nhàng hơn (Jet Black thay vì Pure Black).
- **Layout:** Bento Grid được bao phủ bởi các lớp **Glassmorphism** siêu mỏng, tạo cảm giác không gian đa chiều, thoáng đãng.
- **Trải nghiệm:** Chú trọng vào sự tinh khiết (Purity) và tính tương tác (Interaction) thông qua các hiệu ứng hover và active mềm mại.





## Checkpoint: Fix Import & Token Cleanup (Final)
Ngày: 2026-01-11

1. **Trạng thái file lỗi:**
   - `src/components/ui/overlays.tsx`: Đã xác nhận XÓA HOÀN TOÀN.
   - Không tìm thấy bất kỳ import nào liên quan đến `overlays` trong mã nguồn.

2. **Cập nhật Token (globals.css):**
   - Đã thêm alias để tương thích với BentoCard và các component cũ.
   - Danh sách biến mới thêm: `--radius-card`, `--shadow-apple`, `--shadow-hover`, `--card-hover`.

3. **Danh sách file sạch (src/components/ui):**
   - BentoCard.tsx
   - controls.tsx

4. **Trạng thái hệ thống:**
   - Utils: Đã khôi phục `cn` function.
   - Styles: Đồng bộ Single Source of Truth.
   - Errors: Zero Errors confirmed.

## KIỂM KÊ TOÀN DIỆN (TREE OUTPUT)
```
Folder PATH listing for volume Windows
Volume serial number is XXXX-XXXX
C:.
|   .gitignore
|   bctam.md
|   check_cols.js
|   eslint.config.mjs
|   init_v2_new.js
|   next.config.ts
|   package-lock.json
|   package.json
|   postcss.config.mjs
|   README.md
|   tsconfig.json
|   
+---database
|       01_init_v2.sql
|       01_settings.sql
|       02_settings_rpc.sql
|       03_pricing_logic.sql
|       03_update_v2_logic.sql
|       
+---doc
|   |   desktop.ini
|   |   log.md
|   |   logic.md
|   |   map.md
|   |   rule.md
|   |   ui.md
|   |   
|   +---filemau
|   |       logictinhtienv2.md
|   |       
|   \---mota
|           caidat.md
|           tienphong.md
|           
+---public
|       file.svg
|       globe.svg
|       next.svg
|       vercel.svg
|       window.svg
|       
\---src
    +---app
    |   |   favicon.ico
    |   |   globals.css
    |   |   layout.tsx
    |   |   page.tsx
    |   |   
    |   +---reports
    |   |       page.tsx
    |   |       
    |   \---settings
    |       |   page.tsx
    |       |   
    |       \---PRICING
    |               page.tsx
    |               
    +---components
    |   \---ui
    |           BentoCard.tsx
    |           controls.tsx
    |           
    +---lib
    |       supabase.ts
    |       tokens.ts
    |       utils.ts
    |       
    \---services
            settingsService.ts
```

## MÔ TẢ TỔNG QUAN DỰ ÁN
**1. Tên dự án:** 1Hotel Management System V2 (Tinh Khiết)

**2. Mục tiêu:**
Hệ thống quản lý khách sạn SaaS hiện đại, tập trung vào trải nghiệm người dùng tối giản (Apple-style) và sự toàn vẹn dữ liệu (Database First). Logic nghiệp vụ được xử lý tập trung tại Database để đảm bảo tính nhất quán và hiệu suất cao.

**3. Kiến trúc kỹ thuật:**
- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS.
- **Backend:** Supabase (PostgreSQL).
- **Mô hình:** Thin Client - Fat Database (Logic xử lý bằng RPC/Functions).

**4. Cấu trúc thư mục chính:**
- `database/`: Chứa toàn bộ logic nghiệp vụ dưới dạng SQL Scripts (Source of Truth).
- `doc/`: Tài liệu hướng dẫn, quy chuẩn giao diện và logic.
- `src/app/`: Định tuyến ứng dụng (App Router).
    - `settings/`: Trung tâm cấu hình hệ thống (Giá, Hạng phòng).
    - `reports/`: Báo cáo thống kê.
- `src/components/ui/`: Bộ component giao diện tái sử dụng (BentoCard, Controls).
- `src/lib/`: Các tiện ích cốt lõi (Supabase Client, Token, Utils).

**5. Design System (Apple Human Interface):**
- **Typography:** San Francisco (-apple-system).
- **Radius:** 32px (Huge/Card), 18px (Inner).
- **Colors:** System Background (#F2F2F7), Card White (#FFFFFF), Accent Blue (#007AFF).
- **Effects:** Glassmorphism, Smooth Animation (.apple-bounce).
