-- MIGRATION: PROFESSIONAL LEDGER SYSTEM
-- Description: Thiết lập hệ thống Sổ cái (Ledger) chuyên nghiệp, quản lý Ca làm việc (Shifts) và Phương thức thanh toán.

-- 1. BẢNG QUẢN LÝ PHƯƠNG THỨC THANH TOÁN
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, -- 'CASH', 'BANK_TRANSFER', 'CARD', 'MOMO', 'VNPAY'
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chèn dữ liệu mặc định
INSERT INTO public.payment_methods (code, name) VALUES
('CASH', 'Tiền mặt'),
('BANK_TRANSFER', 'Chuyển khoản'),
('CARD', 'Quẹt thẻ'),
('INTERNAL', 'Nội bộ / Khác')
ON CONFLICT (code) DO NOTHING;

-- 2. BẢNG QUẢN LÝ CA LÀM VIỆC (SHIFTS)
CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES public.profiles(id) NOT NULL,
    start_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    end_at TIMESTAMPTZ,
    opening_balance NUMERIC DEFAULT 0, -- Tiền mặt đầu ca
    closing_balance NUMERIC, -- Tiền mặt cuối ca (nhân viên nhập)
    expected_balance NUMERIC, -- Tiền mặt hệ thống tính toán
    status TEXT CHECK (status IN ('open', 'closed')) DEFAULT 'open',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BẢNG SỔ CÁI TỔNG HỢP (LEDGER)
-- Đây là "Single Source of Truth" cho mọi biến động tài chính
CREATE TABLE IF NOT EXISTS public.ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES public.shifts(id),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES public.profiles(id) NOT NULL,
    
    -- Phân loại
    type TEXT NOT NULL CHECK (type IN ('REVENUE', 'PAYMENT', 'DEPOSIT', 'REFUND', 'EXPENSE', 'DEBT_ADJUSTMENT')),
    category TEXT NOT NULL, -- 'ROOM', 'SERVICE', 'LAUNDRY', 'MINIBAR', 'LATE_CHECKOUT', 'EARLY_CHECKIN', 'DEBT_COLLECTION', 'GENERAL_EXPENSE'
    
    -- Số tiền
    amount NUMERIC NOT NULL, -- Luôn lưu số dương, tính chất Thu/Chi dựa vào 'type'
    payment_method_code TEXT REFERENCES public.payment_methods(code),
    
    -- Trạng thái & Audit
    description TEXT,
    status TEXT CHECK (status IN ('completed', 'void')) DEFAULT 'completed',
    void_reason TEXT,
    void_by UUID REFERENCES public.profiles(id),
    
    -- Dữ liệu mở rộng
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CHỈ MỤC (INDEXES)
CREATE INDEX IF NOT EXISTS idx_ledger_shift ON public.ledger(shift_id);
CREATE INDEX IF NOT EXISTS idx_ledger_booking ON public.ledger(booking_id);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON public.ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON public.ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_staff ON public.shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON public.shifts(status);

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;

-- Policies cho payment_methods (Mọi người có thể xem, chỉ admin sửa)
CREATE POLICY "Everyone can view payment methods" ON public.payment_methods FOR SELECT USING (true);
CREATE POLICY "Admins can manage payment methods" ON public.payment_methods 
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));

-- Policies cho shifts (Nhân viên thấy ca của mình, Admin thấy hết)
CREATE POLICY "Staff can view own shifts" ON public.shifts 
    FOR SELECT USING (staff_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));
CREATE POLICY "Staff can open shifts" ON public.shifts FOR INSERT WITH CHECK (staff_id = auth.uid());
CREATE POLICY "Staff can update own shifts" ON public.shifts 
    FOR UPDATE USING (staff_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));

-- Policies cho ledger (Mọi người có thể xem, chỉ Admin/Manager mới có thể void)
CREATE POLICY "Users can view ledger" ON public.ledger 
    FOR SELECT USING (true);
CREATE POLICY "Staff can insert ledger entries" ON public.ledger 
    FOR INSERT WITH CHECK (staff_id = auth.uid());
CREATE POLICY "Only admins can void ledger entries" ON public.ledger 
    FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')));

-- 6. HELPER FUNCTIONS
-- Hàm tự động tính toán expected_balance khi đóng ca
CREATE OR REPLACE FUNCTION public.fn_calculate_shift_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'closed' AND OLD.status = 'open' THEN
        -- Tính tổng tiền mặt thu được trong ca
        SELECT 
            COALESCE(SUM(CASE WHEN type IN ('PAYMENT', 'DEPOSIT', 'REVENUE') THEN amount ELSE -amount END), 0) + NEW.opening_balance
        INTO NEW.expected_balance
        FROM public.ledger
        WHERE shift_id = NEW.id 
          AND payment_method_code = 'CASH'
          AND status = 'completed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_calculate_shift_balance
    BEFORE UPDATE ON public.shifts
    FOR EACH ROW EXECUTE FUNCTION public.fn_calculate_shift_balance();

-- 7. NOTIFY REAL-TIME
NOTIFY pgrst, 'reload config';
