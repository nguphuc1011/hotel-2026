ngươi thấy bảng chức năng này có tử huyệt nào không? 
BẢNG MÔ TẢ CHI TIẾT CHỨC NĂNG QUẢN LÝ CA (SHIFT MANAGEMENT)
🎯 1. NGUYÊN TẮC CỐT LÕI (BẰNG CHỨNG THÉP)
Tiền mặt là Thực thể: Số dư tiền mặt trên ứng dụng (App Wallet) PHẢI LUÔN KHỚP với số tiền mặt thực tế trong két tại quầy.
Trách nhiệm Cá nhân: Một thời điểm chỉ có một nhân viên trực. Không có ca mở = Không có bất kỳ giao dịch tiền mặt nào được thực hiện.
Đặc quyền Admin: Chủ (Admin) đứng ngoài vòng kiềm tỏa của ca, có quyền xem báo cáo và xử lý nợ bất cứ lúc nào mà không cần mở ca.
📥 2. QUY TRÌNH MỞ CA (START SHIFT)
Thao tác: Nhân viên đăng nhập -> Hệ thống kiểm tra ca active. Nếu chưa có, bắt buộc vào màn hình "Mở ca".
Tiền đầu ca (Start Cash): Hệ thống tự động lấy Số dư thực tế từ ca trước để lại làm tiền đầu ca.
Xác nhận: Nhân viên kiểm đếm tiền trong két, nếu khớp với số máy báo thì nhấn "Xác nhận mở ca".
Đích đến: Hệ thống ghi nhận thời điểm bắt đầu và người chịu trách nhiệm cho toàn bộ dòng tiền mặt từ giây phút này.
💸 3. QUY TRÌNH TRONG CA (IN-SHIFT OPERATIONS)
Giao dịch Thu/Chi: Mọi hóa đơn, phiếu chi tiền mặt phát sinh phải được gắn chặt vào Ca đang mở.
Tiền Chuyển khoản (Bank): Ghi nhận vào doanh thu để đối soát, nhưng không cộng vào quỹ tiền mặt của ca để tránh làm loạn con số kiểm đếm cuối ca.
Tiền mặt (Cash): Mọi khoản thu (tiền phòng, dịch vụ) và khoản chi (mua đá, trả ship) phải nhập máy ngay lập tức để hệ thống tính toán Số dư lý thuyết.
📤 4. QUY TRÌNH ĐÓNG CA & BÀN GIAO (CLOSE SHIFT)
Đây là khâu quan trọng nhất để chống thất thoát. Nhân viên phải thực hiện đối soát:
Chỉ số
Cách tính / Ý nghĩa
Đích đến của dòng tiền
Số dư Lý thuyết
= [Tiền đầu ca] + [Thu tiền mặt] - [Chi tiền mặt]
Con số máy tính toán phải có trong két.
Số dư Thực tế
Nhân viên tự đếm và nhập vào máy
Đây là số dư chính thức để bàn giao cho ca sau.
Chênh lệch (Variance)
= [Thực tế] - [Lý thuyết]
Nếu khác 0, hệ thống kích hoạt Quy trình Xử lý Lệch.
⚖️ 5. QUY TRÌNH XỬ LÝ LỆCH TIỀN (VARIANCE HANDLING)
Trường hợp A: Thiếu tiền (Lý thuyết > Thực tế)
Cân bằng ví App: Hệ thống tự động thực hiện lệnh "Điều chỉnh giảm" để số dư trên App khớp với số Thực tế (để ca sau nhận ca đúng số tiền thật).
Tạo Phiếu Nợ: Số tiền thiếu được chuyển vào danh sách "Nợ nhân viên".
Giải trình: Bắt buộc nhân viên nhập lý do thiếu (quên thu tiền khách, thối nhầm...).
Trường hợp B: Thừa tiền (Thực tế > Lý thuyết)
Cân bằng ví App: Hệ thống "Điều chỉnh tăng" số dư App lên cho khớp thực tế.
Ghi nhận doanh thu: Số tiền thừa được hạch toán vào mục "Thu nhập khác - Tiền thừa ca trực".
💰 6. QUY TRÌNH TẤT TOÁN NỢ (DEBT SETTLEMENT)
Khi nhân viên nợ tiền do làm lệch ca, Bệ Hạ xử lý như sau:
Thu hồi tiền mặt (Nộp bù)
Thao tác: Bệ Hạ thu tiền mặt từ nhân viên -> Nhấn "Tất toán tiền mặt" trên App.
Dòng tiền: App tạo phiếu Thu nợ -> Tiền mặt trong ví App tăng lên lại. Khớp sổ sách.
🛠️ 7. CÔNG CỤ GIÁM SÁT DÀNH CHO BỆ HẠ
Nhật ký Ca làm việc: Xem lại lịch sử từng ca (Ai trực, giờ nào, lệch bao nhiêu).
Danh sách Nợ tổng hợp: Xem nhân viên A đang nợ tổng cộng bao nhiêu tiền từ tất cả các ca lệch để đòi tiền cuối tháng.
Bypass Shift: Admin có quyền thực hiện thu/chi mà không cần mở ca (tiền sẽ đổ thẳng vào ví tổng của khách sạn).
🛡️ 8. CHỐT CHẶN CUỐI CÙNG (SECURITY)
Cưỡng chế: Nếu nhân viên chưa chốt ca cũ, không cho phép mở ca mới.
Khóa dữ liệu: Sau khi đã nhấn "Chốt ca", nhân viên không được phép sửa hay xóa bất kỳ giao dịch nào trong ca đó nữa. Mọi sửa đổi phải có sự phê duyệt của Admin.

## 📋 BẢN KẾ HOẠCH THỰC HIỆN CHỨC NĂNG QUẢN LÝ CA - PHIÊN BẢN THỰC CHIẾN

### 🎯 **MỤC TIÊU CUỐI CÙNG**
Xây dựng hệ thống quản lý ca **tinh gọn, thực tế, không quan liêu** cho nhà nghỉ, tập trung vào:
1. **Auto-adjust** tiền mặt để không block vận hành  
2. **Treo nợ tự động** cho nhân viên làm lệch
3. **Admin toàn quyền** bypass mọi ràng buộc
4. **1 người 1 ca** - đơn giản, dễ quản lý

---

### 📊 **PHASE 1: CƠ SỞ DỮ LIỆU & CORE FUNCTIONS**

#### **1.1. TẠO BẢNG SHIFTS (Ca làm việc)**
```sql
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES staff(id) NOT NULL,
    start_cash NUMERIC NOT NULL,        -- Tiền đầu ca
    end_cash NUMERIC,                   -- Tiền thực tế cuối ca
    expected_cash NUMERIC,              -- Tiền lý thuyết (tính toán)
    cash_variance NUMERIC,              -- Chênh lệch (+/-)
    status TEXT DEFAULT 'open',        -- open/closed/force_closed
    started_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### **1.2. TẠO BẢNG STAFF_DEBTS (Nợ nhân viên)**
```sql
CREATE TABLE staff_debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES staff(id) NOT NULL,
    shift_id UUID REFERENCES shifts(id) NOT NULL,
    amount NUMERIC NOT NULL,            -- Số tiền nợ (+ thiếu, - thừa)
    reason TEXT,                        -- Lý do nợ (nhập tay)
    status TEXT DEFAULT 'pending',      -- pending/paid/forgiven
    created_at TIMESTAMPTZ DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);
```

#### **1.3. CORE FUNCTION: OPEN_SHIFT**
**Logic**: Tự động lấy số dư wallet hiện tại làm start cash
```sql
FUNCTION open_shift(p_staff_id UUID) RETURNS JSONB
-- Tự động get current wallet balance làm start_cash
-- Tạo shift record với status = 'open'
-- Set cookies: has_shift=true, shift_id=new_id
```

#### **1.4. CORE FUNCTION: CLOSE_SHIFT** 
**Logic**: Auto-adjust + auto-debt tracking
```sql
FUNCTION close_shift(p_shift_id UUID, p_actual_cash NUMERIC) RETURNS JSONB
-- Tính expected_cash = start_cash + thu - chi
-- Tính variance = actual_cash - expected_cash  
-- Nếu variance != 0: Tạo record trong staff_debts
-- Auto-adjust wallet balance khớp actual_cash
-- Đóng shift status = 'closed'
```

#### **1.5. CORE FUNCTION: FORCE_CLOSE_SHIFT**
**Logic**: Admin cưỡng chế đóng ca bất kỳ
```sql
FUNCTION force_close_shift(p_shift_id UUID, p_admin_id UUID) RETURNS JSONB
-- Admin có quyền đóng bất kỳ ca nào
-- Ghi audit log admin action
-- Set status = 'force_closed'
```

---

### ⚡ **PHASE 2: SHIFT ENFORCEMENT & AUTO-ADJUST**

#### **2.1. MIDDLEWARE ENFORCEMENT**
**Logic**: Chặn nhân viên không có ca
```typescript
// src/middleware.ts
if (role !== 'admin' && !hasShift) {
  redirect('/shift/required'); // Redirect đến trang mở ca
}
```

#### **2.2. AUTO-ASSIGN SHIFT_ID**
**Logic**: Tự động gán shift_id cho mọi transaction
```sql
-- Trigger tự động gán shift_id cho:
-- cash_flows, inventory_transactions, booking_audits
NEW.shift_id = get_active_shift_id(auth.uid());
```

#### **2.3. AUTO-ADJUST MECHANISM**
**Logic**: Tự động cân bằng wallet với thực tế
```sql
-- Trong close_shift:
UPDATE wallets SET balance = p_actual_cash 
WHERE type = 'cash' AND shift_id = p_shift_id;
```

---

### 👑 **PHASE 3: ADMIN BYPASS & FULL PRIVILEGES**

#### **3.1. ADMIN MIDDLEWARE EXEMPTION**
**Logic**: Admin không bị middleware chặn
```typescript
// src/middleware.ts
if (role === 'admin' || role === 'owner') {
  return NextResponse.next(); // Admin được free pass
}
```

#### **3.2. ADMIN AUDIT LOGGING**
**Logic**: Ghi log đầy đủ action của admin
```sql
CREATE TABLE admin_audit_logs (
    admin_id UUID REFERENCES staff(id),
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### **3.3. ADMIN DASHBOARD SPECIAL VIEW**
**Logic**: Admin xem được mọi thứ, mọi lúc
```sql
FUNCTION get_admin_dashboard() RETURNS JSONB
-- Hiển thị all shifts, all debts, all transactions
-- Không filter theo shift hay permission
```

---

### 📱 **PHASE 4: USER INTERFACE & WORKFLOW**

#### **4.1. SHIFT STATUS COMPONENT**
**Location**: Header bar
**Display**: 
- `🟢 Ca đang mở • Tiền mặt: 1,250,000đ`
- `🔴 Chưa mở ca • [Mở ca ngay]`

#### **4.2. SHIFT OPEN/CLOSE PAGES**
- **`/shift/open`**: Màn hình mở ca + xác nhận số tiền
- **`/shift/close`**: Màn hình đóng ca + nhập tiền thực tế
- **`/shift/debts`**: Danh sách nợ của nhân viên

#### **4.3. ADMIN SPECIAL PAGES**
- **`/admin/shifts`**: Xem và force-close mọi ca
- **`/admin/debts`**: Quản lý nợ nhân viên
- **`/admin/audit-logs`**: Xem log admin actions

---

### 🔧 **PHASE 5: INTEGRATION & DEPLOYMENT**

#### **5.1. WALLET INTEGRATION**
**Logic**: Kết nối với hệ thống wallet hiện có
```sql
-- Sửa bảng wallets: thêm shift_id, staff_id
-- Đảm bảo auto-adjust không ảnh hưởng các wallet khác
```

#### **5.2. EXISTING SYSTEM COMPATIBILITY**
**Logic**: Không phá vỡ hệ thống hiện có
- Giữ nguyên all functions hiện có
- Chỉ thêm shift_id where appropriate
- Đảm bảo backward compatibility

#### **5.3. DEPLOYMENT PHASING**
1. **Week 1**: Database changes + core functions
2. **Week 2**: Middleware enforcement + auto-assign  
3. **Week 3**: Admin privileges + UI pages
4. **Week 4**: Testing + refinement

---

### 🎯 **TRIẾT LÝ THIẾT KẾ**

#### **ƯU TIÊN VẬN HÀNH**
- ✅ Auto-adjust để không block business
- ✅ Treo nợ tự động, không cần approval
- ✅ Admin toàn quyền, không bureaucracy

#### **LINH HOẠT TUYỆT ĐỐI**  
- ✅ 1 người 1 ca - đơn giản
- ✅ Admin bypass mọi ràng buộc
- ✅ Force-close cho mọi tình huống

#### **THỰC TẾ TRÊN HẾT**
- ✅ Không quan liêu, không phức tạp
- ✅ Tập trung quản lý con người và tiền mặt
- ✅ Ghi audit log đầy đủ cho accountability

---

### 📋 **TIẾN ĐỘ ƯỚC TÍNH**

- **Database schema**: 2 ngày
- **Core functions**: 3 ngày  
- **Middleware enforcement**: 2 ngày
- **UI pages**: 5 ngày
- **Testing & refinement**: 3 ngày

**Tổng**: 15 ngày làm việc

Bản kế hoạch đã sẵn sàng để quân sư duyệt! 🚀