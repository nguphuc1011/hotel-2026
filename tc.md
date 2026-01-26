    # TỔNG HỢP CODE HỆ THỐNG TÀI CHÍNH - DÒNG TIỀN (FINANCIAL SYSTEM)

Tài liệu này tổng hợp toàn bộ mã nguồn Frontend (FE) và Backend (BE/Schema) liên quan đến chức năng quản lý Thu Chi, Dòng Tiền, và Hệ thống 5 Quỹ + Sổ Nợ Ngoài (Đã cập nhật Mật Lệnh: Cưỡng chế Quyền Chủ & Chốt Sổ).

---

## 3. CƠ CHẾ TÍNH TOÁN & CÁC MỐC THỜI GIAN (DYNAMIC CONFIGURATION)

### 3.1. Tuyệt đối không sử dụng thông số cứng
- **Hệ thống đã được rà soát 100%:** Mọi mốc giờ (Check-in, Check-out, Qua đêm, Late/Early), đơn vị tính (Hourly Unit), và các quy tắc phụ thu đều được truy xuất trực tiếp từ bảng `settings`.
- **Cơ chế cưỡng chế (Enforcement):** Nếu Bệ hạ chưa thiết lập các thông số này trong phần Cài đặt, hệ thống sẽ từ chối tính tiền và thông báo lỗi thay vì tự ý sử dụng các con số mặc định (ví dụ 12h hay 14h). Điều này đảm bảo tính minh bạch và quyền kiểm soát tuyệt đối của Chủ khách sạn.

### 3.2. Chi tiết logic trong Backend (Billing Engine)
*File: `src/lib/billing_engine.sql`*

```sql
-- Ví dụ logic truy xuất Settings không có giá trị mặc định (COALESCE defaults removed)
SELECT 
    grace_in_enabled, grace_out_enabled, grace_minutes,
    hourly_unit, base_hourly_limit,
    overnight_start_time, overnight_end_time,
    check_out_time, full_day_late_after, full_day_early_before
INTO 
    v_grace_in_enabled, v_grace_out_enabled, v_grace_minutes,
    v_hourly_unit, v_base_block_count,
    v_overnight_start, v_overnight_end,
    v_std_check_out, v_full_day_cutoff, v_full_day_early_cutoff
FROM public.settings WHERE key = 'config' LIMIT 1;

-- Cưỡng chế kiểm tra cấu hình
IF v_std_check_out IS NULL OR v_overnight_start IS NULL OR v_overnight_end IS NULL THEN
    RETURN jsonb_build_object(
        'success', false, 
        'message', 'LỖI CẤU HÌNH: Bệ hạ chưa thiết lập đầy đủ các mốc giờ trong Cài đặt.'
    );
END IF;
```

### 3.3. Đồng bộ hóa Frontend (Settings Service)
*File: `src/services/settingsService.ts`*

```typescript
// Map dữ liệu từ DB, không dùng fallback hardcoded
return {
    check_in_time: val.check_in_time,
    check_out_time: val.check_out_time,
    overnight_start_time: val.overnight_start_time,
    overnight_end_time: val.overnight_end_time,
    // ... các trường khác tương tự
} as Settings;
```

---

## MỤC LỤC
1. [Backend - Database Schema & Logic](#1-backend---database-schema--logic)
   - [Schema: External Payables & Security](#11-schema-external-payables--security)
   - [Schema: Cash Flow (Sổ Quỹ)](#12-schema-cash-flow-sổ-quỹ)
   - [Logic: RPC Owner Actions (Mật Lệnh)](#13-logic-rpc-owner-actions-mật-lệnh)
   - [Logic: Trigger Cập nhật 5 Quỹ](#14-logic-trigger-cập-nhật-5-quỹ-core-financial-logic)
2. [Frontend - Client App](#2-frontend---client-app)
   - [Service: Cash Flow Service](#21-service-cash-flow-service)
   - [Component: Owner Debt Section (UI Chính)](#22-component-owner-debt-section-ui-chính)
   - [Component: Pin Validation Modal (Bảo mật)](#23-component-pin-validation-modal-bảo-mật)
   - [Page: Main Cash Flow Page](#24-page-main-cash-flow-page)

---

## 1. BACKEND - DATABASE SCHEMA & LOGIC

### 1.1. Schema: External Payables & Security
*File: `db_scripts/secure_owner_actions.sql`*

```sql
-- 1. Schema Update: Add Evidence URL ("Bằng chứng thép")
ALTER TABLE public.external_payables 
ADD COLUMN IF NOT EXISTS evidence_url TEXT;

-- Table Definition (Reference)
CREATE TABLE IF NOT EXISTS public.external_payables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creditor_name TEXT NOT NULL, -- 'Chủ đầu tư', 'NCC...'
    amount NUMERIC NOT NULL CHECK (amount > 0),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paid')),
    updated_at TIMESTAMPTZ DEFAULT now(),
    evidence_url TEXT -- Link ảnh hóa đơn/chứng từ
);
```

### 1.2. Schema: Cash Flow (Sổ Quỹ)
*File: `db_scripts/create_cash_flow.sql`*

```sql
CREATE TABLE IF NOT EXISTS public.cash_flow (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    flow_type text NOT NULL CHECK (flow_type IN ('IN', 'OUT')),
    category text NOT NULL,
    amount numeric NOT NULL DEFAULT 0,
    description text,
    occurred_at timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),
    ref_id uuid,
    is_auto boolean DEFAULT false,
    payment_method_code text,
    wallet_id text -- CASH, BANK, ESCROW, REVENUE...
);
```

### 1.3. Logic: RPC Owner Actions (Mật Lệnh)
*File: `db_scripts/secure_owner_actions.sql`*

```sql
-- 1. Record Owner Expense (Ghi nhận Chủ chi - Có Bằng chứng)
CREATE OR REPLACE FUNCTION record_owner_expense(
    p_amount numeric,
    p_description text,
    p_creditor_name text DEFAULT 'Chủ đầu tư',
    p_evidence_url text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_payable_id uuid;
BEGIN
    -- Enforce Evidence ("Bằng chứng thép")
    IF p_evidence_url IS NULL OR trim(p_evidence_url) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bắt buộc phải có ảnh hóa đơn (Bằng chứng thép)');
    END IF;

    -- A. Record Debt in Sổ Nợ Ngoài
    INSERT INTO public.external_payables (creditor_name, amount, description, status, evidence_url)
    VALUES (p_creditor_name, p_amount, p_description, 'active', p_evidence_url)
    RETURNING id INTO v_payable_id;

    -- B. Record Expense in Cash Flow (affects REVENUE only)
    INSERT INTO public.cash_flow (
        flow_type, category, amount, description, 
        payment_method_code, wallet_id, created_by, occurred_at
    ) VALUES (
        'OUT', 'Chi vận hành', p_amount, p_description || ' (Chủ chi)',
        'owner_equity', 'REVENUE', 
        auth.uid(),
        now()
    );

    RETURN jsonb_build_object('success', true, 'payable_id', v_payable_id);
END;
$$;

-- 2. Repay Owner Debt (Trả nợ Chủ - Có bảo mật PIN & Role)
CREATE OR REPLACE FUNCTION repay_owner_debt(
    p_payable_id uuid,
    p_payment_method text, -- 'cash' or 'transfer'
    p_pin text -- Require PIN
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_debt_record RECORD;
    v_staff_record RECORD;
    v_wallet_id text;
    v_wallet_balance numeric;
BEGIN
    -- 1. Verify Role & PIN
    SELECT * INTO v_staff_record FROM public.staff WHERE user_id = auth.uid();
    
    IF v_staff_record.role <> 'OWNER' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Chỉ OWNER mới được thực hiện chức năng này');
    END IF;

    IF v_staff_record.pin_hash <> p_pin THEN
        RETURN jsonb_build_object('success', false, 'message', 'Mã PIN không chính xác');
    END IF;

    -- 2. Get Debt Record
    SELECT * INTO v_debt_record FROM public.external_payables WHERE id = p_payable_id AND status = 'active';
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Khoản nợ không tồn tại'); END IF;

    -- 3. Check Wallet Balance ("Chốt chặn số dư")
    v_wallet_id := CASE WHEN p_payment_method = 'cash' THEN 'CASH' ELSE 'BANK' END;
    SELECT balance INTO v_wallet_balance FROM public.wallets WHERE id = v_wallet_id;
    
    IF v_wallet_balance < v_debt_record.amount THEN
        RETURN jsonb_build_object('success', false, 'message', 'Két không đủ tiền (' || v_wallet_id || ')');
    END IF;

    -- 4. Execute Transaction
    INSERT INTO public.cash_flow (
        flow_type, category, amount, description, 
        payment_method_code, wallet_id, created_by, occurred_at
    ) VALUES (
        'OUT', 'Trả nợ', v_debt_record.amount, 'Trả nợ ' || v_debt_record.creditor_name || ': ' || v_debt_record.description,
        p_payment_method, v_wallet_id, auth.uid(), now()
    );

    UPDATE public.external_payables SET status = 'paid', updated_at = now() WHERE id = p_payable_id;

    RETURN jsonb_build_object('success', true, 'message', 'Đã trả nợ thành công.');
END;
$$;
```

### 1.4. Logic: Trigger Cập nhật 5 Quỹ (Core DML Logic)
*File: `db_scripts/upgrade_financial_trigger_dml.sql`*

```sql
-- Đảm bảo Két (Wallets) luôn khớp Sổ (Cash Flow) khi Thêm/Sửa/Xóa
CREATE OR REPLACE FUNCTION public.fn_apply_wallet_logic(p_rec public.cash_flow, p_sign_multiplier integer) 
RETURNS void AS $$
DECLARE
    v_amount numeric := COALESCE(p_rec.amount, 0);
    v_flow_sign integer := CASE WHEN p_rec.flow_type = 'IN' THEN 1 ELSE -1 END;
    v_final_sign integer := v_flow_sign * p_sign_multiplier;
BEGIN
    -- 1. LOGIC CHO TIỀN CỌC
    IF p_rec.category = 'Tiền cọc' THEN
        IF p_rec.payment_method_code IN ('cash', NULL) THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign) WHERE id = 'CASH';
        ELSE
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign) WHERE id = 'BANK';
        END IF;
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign) WHERE id = 'ESCROW';
        RETURN;
    END IF;

    -- 2. LOGIC CHO GHI NỢ (CREDIT)
    IF p_rec.payment_method_code = 'credit' THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign) WHERE id = 'RECEIVABLE';
        IF p_rec.category NOT IN ('Trả nợ') THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign) WHERE id = 'REVENUE';
        END IF;
        RETURN;
    END IF;

    -- 3. LOGIC CHO THANH TOÁN & CHI PHÍ
    IF p_rec.payment_method_code IN ('cash', NULL) THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign) WHERE id = 'CASH';
    ELSE
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign) WHERE id = 'BANK';
    END IF;

    IF p_rec.category NOT IN ('Trả nợ') AND p_rec.payment_method_code NOT IN ('owner_equity') THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_final_sign) WHERE id = 'REVENUE';
    END IF;

    -- Giảm công nợ khi có tiền thực thu (IN)
    IF p_rec.flow_type = 'IN' AND p_rec.payment_method_code NOT IN ('credit', 'owner_equity', 'deposit_transfer') THEN
        UPDATE public.wallets SET balance = balance - (v_amount * p_sign_multiplier) WHERE id = 'RECEIVABLE';
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_update_wallets_dml() RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN PERFORM public.fn_apply_wallet_logic(OLD, -1); END IF;
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN PERFORM public.fn_apply_wallet_logic(NEW, 1); END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 1.5. Logic: Sync Bookings to Ledger (Đồng bộ số tiền phòng)
*File: `db_scripts/sync_bookings_to_ledger.sql`*

```sql
-- Tự động cập nhật Sổ khi thay đổi thông tin đặt phòng (Giá, giảm giá, phụ thu...)
CREATE OR REPLACE FUNCTION public.trg_sync_booking_to_cash_flow() RETURNS trigger AS $$
DECLARE
    v_bill jsonb;
    v_total_amount numeric;
BEGIN
    IF NEW.status NOT IN ('checked_in', 'completed') THEN RETURN NEW; END IF;

    v_bill := public.calculate_booking_bill(NEW.id);
    IF (v_bill->>'success')::boolean = false THEN RETURN NEW; END IF;
    
    v_total_amount := (v_bill->>'total_amount')::numeric;

    UPDATE public.cash_flow SET amount = v_total_amount, updated_at = now()
    WHERE ref_id = NEW.id AND category = 'Tiền phòng' AND payment_method_code = 'credit' AND is_auto = true;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 1.6. Logic: Sync Services to Ledger (Đồng bộ dịch vụ)
*File: `db_scripts/sync_services_to_ledger.sql`*

```sql
-- Tự động cập nhật Sổ khi gọi thêm dịch vụ hoặc xóa dịch vụ
CREATE OR REPLACE FUNCTION public.trg_sync_service_to_cash_flow() RETURNS trigger AS $$
DECLARE
    v_booking_id uuid;
    v_bill jsonb;
    v_total_amount numeric;
BEGIN
    v_booking_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.booking_id ELSE NEW.booking_id END;

    v_bill := public.calculate_booking_bill(v_booking_id);
    IF (v_bill->>'success')::boolean = false THEN RETURN NULL; END IF;
    
    v_total_amount := (v_bill->>'total_amount')::numeric;

### 1.7. Logic: Real-time Auto-Refresh (Cơ chế tự động nhảy số theo mốc giờ)
*File: `db_scripts/auto_milestone_ledger_sync.sql`*

```sql
-- Hàm quét và cập nhật toàn bộ Sổ cho các phòng đang ở (Checked-in)
-- Giúp tự động tính thêm tiền khi khách ở quá mốc 12:00, 18:00... mà không cần tác động thủ công
CREATE OR REPLACE FUNCTION public.refresh_active_ledgers() 
RETURNS jsonb AS $$
DECLARE
    v_count int := 0;
    v_rec record;
BEGIN
    FOR v_rec IN SELECT id FROM public.bookings WHERE status = 'checked_in' LOOP
        PERFORM public.fn_sync_booking_to_ledger(v_rec.id);
        v_count := v_count + 1;
    END LOOP;
    RETURN jsonb_build_object('success', true, 'refreshed_count', v_count, 'timestamp', now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 3. CƠ CHẾ TÍNH TOÁN & CÁC MỐC THỜI GIAN (BUSINESS LOGIC)

### 3.1. Các mốc giờ linh hoạt (Tuyệt đối theo Cài đặt)
- **Hệ thống không sử dụng bất kỳ mốc giờ "khóa cứng" nào trong code.**
- **Mọi thông số:** Giờ Check-in, Check-out, mốc tính thêm ngày (Late/Early), giờ bắt đầu/kết thúc Qua đêm... đều được truy xuất trực tiếp từ bảng `settings`.
- **An toàn dữ liệu:** Nếu Bệ Hạ chưa cấu hình, hệ thống sẽ yêu cầu thiết lập thay vì tự ý sử dụng con số mặc định, đảm bảo tính minh bạch và quyền kiểm soát tuyệt đối của Chủ.

### 3.2. Logic tự động nhảy số theo thời gian thực
1. **Engine tính toán:** Hàm `calculate_booking_bill` luôn lấy `now()` làm mốc nếu khách chưa checkout. Dòng tiền ảo sẽ tự động nhảy số ngay khi đồng hồ bước qua mốc cấu hình trong Settings.
2. **Cơ chế đồng bộ vào Sổ (Ledger):**
   - Khi có bất kỳ thay đổi nào (đổi phòng, thêm dịch vụ), Sổ sẽ tự cập nhật.
   - Để Sổ tự nhảy mà không cần tác động, hệ thống sử dụng hàm `refresh_active_ledgers()` để ép Sổ cập nhật theo thời gian thực của Engine.
   - **Tương lai:** Có thể thiết lập Cron-job gọi hàm này mỗi 15-30 phút để "Chốt sổ" tự động mà không cần nhân viên thao tác.

---

## 2. FRONTEND - CLIENT APP

### 2.1. Service: Cash Flow Service
*File: `src/services/cashFlowService.ts`*

```typescript
export const cashFlowService = {
  // ... other methods ...

  // Ghi nhận Chủ chi (với Evidence URL)
  async createOwnerExpense(payload: {
    amount: number;
    description: string;
    creditorName?: string;
    evidenceUrl: string; // New field
  }) {
    const { data, error } = await supabase.rpc('record_owner_expense', {
      p_amount: payload.amount,
      p_description: payload.description,
      p_creditor_name: payload.creditorName || 'Chủ đầu tư',
      p_evidence_url: payload.evidenceUrl
    });
    if (error) throw error;
    return data;
  },

  // Trả nợ Chủ (với PIN)
  async repayOwnerDebt(payload: {
    payableId: string;
    paymentMethod: 'cash' | 'transfer';
    pin: string; // New field
  }) {
    const { data, error } = await supabase.rpc('repay_owner_debt', {
      p_payable_id: payload.payableId,
      p_payment_method: payload.paymentMethod,
      p_pin: payload.pin
    });
    if (error) throw error;
    return data;
  }
};
```

### 2.2. Component: Owner Debt Section (UI Chính)
*File: `src/app/cash-flow/components/OwnerDebtSection.tsx`*

```tsx
export default function OwnerDebtSection({ onUpdate }: OwnerDebtSectionProps) {
  // ... state ...
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const { user } = useAuth();

  // Handle Create with Evidence
  const handleCreateExpense = async () => {
    if (!evidenceUrl) return toast.error('Bắt buộc có bằng chứng');
    await cashFlowService.createOwnerExpense({ ..., evidenceUrl });
    // ...
  };

  // Handle Repay Flow
  const initiateRepay = (debt: any) => {
    if (user?.role !== 'OWNER') return toast.error('Chỉ Owner được phép');
    setSelectedDebt(debt);
    setIsRepayModalOpen(true);
  };

  return (
    <div>
      {/* ... UI ... */}
      <input value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} placeholder="Link bằng chứng..." />
      
      {/* Pin Validation Modal Integration */}
      <PinValidationModal 
        isOpen={isPinModalOpen}
        onSuccess={(id, name, pin) => {
           // Call Service with PIN
           cashFlowService.repayOwnerDebt({ ..., pin });
        }}
      />
    </div>
  );
}
```

### 2.3. Component: Pin Validation Modal (Bảo mật)
*File: `src/components/shared/PinValidationModal.tsx`*

```tsx
export default function PinValidationModal({ isOpen, onSuccess, ... }) {
  const [pin, setPin] = useState('');
  
  const handleSubmit = async () => {
    // Verify PIN via RPC
    const { data: isValid } = await supabase.rpc('fn_verify_staff_pin', { p_pin_hash: pin });
    if (isValid) {
      onSuccess(user.id, user.name, pin); // Pass PIN back to parent
    }
  };
  
  // ... UI ...
}
```
