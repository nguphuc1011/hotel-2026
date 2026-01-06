-- ==========================================
-- ĐẠI CẢI TỔ HỆ THỐNG TÀI CHÍNH & CÔNG NỢ (LEDGER UNIFICATION)
-- Date: 2026-01-05
-- Author: Thao AI (Senior Partner)
-- Description: 
--  1. Nhất thể hóa mọi biến động tiền vào bảng 'ledger'.
--  2. Khai tử các bảng giao dịch cũ: 'transactions', 'debt_transactions', 'financial_transactions'.
--  3. Thiết lập Trigger duy trì 'customers.balance' tự động từ Ledger.
--  4. Chuyển toàn bộ logic tính toán nợ/thanh toán sang RPC Database.
-- ==========================================

-- 0. DI CƯ DỮ LIỆU (MIGRATION) - Chạy trước khi xóa bảng
DO $$
DECLARE
    v_admin_id uuid;
BEGIN
    -- Lấy một ID admin mặc định để gán cho các giao dịch cũ không có staff_id
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM public.profiles LIMIT 1;
    END IF;

    -- Di cư từ transactions sang ledger
    -- Chỉ di cư nếu ledger còn trống hoặc để tránh trùng lặp, ta check id
    INSERT INTO public.ledger (id, booking_id, customer_id, staff_id, type, category, amount, payment_method_code, description, created_at, meta)
    SELECT 
        id, 
        booking_id, 
        customer_id, 
        v_admin_id, -- Mặc định admin cho dữ liệu cũ
        CASE 
            WHEN type = 'payment' THEN 'PAYMENT'
            WHEN type = 'deposit' THEN 'DEPOSIT'
            WHEN type = 'service_charge' THEN 'REVENUE'
            WHEN type = 'room_charge' THEN 'REVENUE'
            WHEN type = 'debt_recovery' THEN 'PAYMENT'
            ELSE 'DEBT_ADJUSTMENT'
        END as type,
        CASE 
            WHEN type = 'payment' THEN 'BOOKING_PAYMENT'
            WHEN type = 'deposit' THEN 'BOOKING_DEPOSIT'
            WHEN type = 'service_charge' THEN 'SERVICE'
            WHEN type = 'room_charge' THEN 'ROOM'
            WHEN type = 'debt_recovery' THEN 'DEBT_COLLECTION'
            ELSE 'GENERAL'
        END as category,
        ABS(amount),
        UPPER(COALESCE(method, 'CASH')),
        notes,
        created_at,
        COALESCE(meta, '{}'::jsonb)
    FROM public.transactions
    ON CONFLICT (id) DO NOTHING;

    -- Di cư từ cashflow sang ledger
    INSERT INTO public.ledger (id, staff_id, type, category, amount, payment_method_code, description, created_at)
    SELECT 
        id, 
        COALESCE(created_by_id, v_admin_id),
        CASE WHEN type = 'income' THEN 'PAYMENT' ELSE 'EXPENSE' END,
        category_name,
        amount,
        UPPER(COALESCE(payment_method, 'CASH')),
        content || COALESCE(': ' || notes, ''),
        created_at
    FROM public.cashflow
    WHERE deleted_at IS NULL
    ON CONFLICT (id) DO NOTHING;

    -- Di cư từ expenses sang ledger
    INSERT INTO public.ledger (id, staff_id, type, category, amount, description, created_at)
    SELECT 
        id, 
        v_admin_id,
        'EXPENSE',
        COALESCE(category, 'General Expense'),
        amount,
        description,
        expense_date::timestamptz
    FROM public.expenses
    ON CONFLICT (id) DO NOTHING;

END $$;

-- 1. THIẾT LẬP TRIGGER DUY TRÌ CUSTOMERS.BALANCE
CREATE OR REPLACE FUNCTION public.fn_sync_customer_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_delta NUMERIC := 0;
    v_target_customer_id UUID;
BEGIN
    -- Xác định khách hàng mục tiêu
    v_target_customer_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.customer_id ELSE NEW.customer_id END;
    
    IF v_target_customer_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Tính toán delta cho hành động hiện tại
    -- Logic: PAYMENT/DEPOSIT tăng balance (+), REVENUE/REFUND giảm balance (-)
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed') THEN
        IF NEW.status = 'completed' THEN
            CASE NEW.type
                WHEN 'PAYMENT', 'DEPOSIT' THEN v_delta := NEW.amount;
                WHEN 'REVENUE', 'REFUND' THEN v_delta := -NEW.amount;
                WHEN 'DEBT_ADJUSTMENT' THEN 
                    IF (NEW.meta->>'direction') = 'plus' THEN v_delta := NEW.amount;
                    ELSE v_delta := -NEW.amount;
                    END IF;
                ELSE v_delta := 0;
            END CASE;
        END IF;
    ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.status = 'void' AND OLD.status = 'completed') THEN
        -- Đảo ngược lại logic khi xóa hoặc void
        IF (TG_OP = 'DELETE' AND OLD.status = 'completed') OR (TG_OP = 'UPDATE' AND NEW.status = 'void') THEN
            CASE OLD.type
                WHEN 'PAYMENT', 'DEPOSIT' THEN v_delta := -OLD.amount;
                WHEN 'REVENUE', 'REFUND' THEN v_delta := OLD.amount;
                WHEN 'DEBT_ADJUSTMENT' THEN 
                    IF (OLD.meta->>'direction') = 'plus' THEN v_delta := -OLD.amount;
                    ELSE v_delta := OLD.amount;
                    END IF;
                ELSE v_delta := 0;
            END CASE;
        END IF;
    END IF;

    -- Cập nhật balance
    IF v_delta != 0 THEN
        UPDATE public.customers
        SET balance = COALESCE(balance, 0) + v_delta
        WHERE id = v_target_customer_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Gán trigger
DROP TRIGGER IF EXISTS trg_ledger_sync_customer_balance ON public.ledger;
CREATE TRIGGER trg_ledger_sync_customer_balance
    AFTER INSERT OR UPDATE OR DELETE ON public.ledger
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_customer_balance();

-- 2. RE-CALCULATE ALL BALANCES (ONE TIME)
-- Đảm bảo balance hiện tại khớp 100% với ledger sau khi di cư
UPDATE public.customers c
SET balance = (
    SELECT COALESCE(SUM(
        CASE 
            WHEN type IN ('PAYMENT', 'DEPOSIT') THEN amount
            WHEN type IN ('REVENUE', 'REFUND') THEN -amount
            WHEN type = 'DEBT_ADJUSTMENT' AND (meta->>'direction') = 'plus' THEN amount
            WHEN type = 'DEBT_ADJUSTMENT' AND (meta->>'direction') != 'plus' THEN -amount
            ELSE 0
        END
    ), 0)
    FROM public.ledger
    WHERE customer_id = c.id AND status = 'completed'
);

-- 3. RE-IMPLEMENT RPCS (DATABASE-LEVEL LOGIC)

-- 3.0 UNIFIED LEDGER ENTRY FUNCTION (IMMUTABLE ENTRIES, GMT+7)
CREATE OR REPLACE FUNCTION public.handle_ledger_entry(
    p_type text,
    p_category text,
    p_amount numeric,
    p_payment_method_code text DEFAULT 'CASH',
    p_booking_id uuid DEFAULT NULL,
    p_customer_id uuid DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_meta jsonb DEFAULT '{}'::jsonb,
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id uuid;
    v_staff uuid := COALESCE(p_staff_id, auth.uid());
BEGIN
    PERFORM set_config('timezone','Asia/Ho_Chi_Minh', true);
    IF v_staff IS NULL THEN
        RAISE EXCEPTION 'Thiếu staff_id/không có người dùng xác thực';
    END IF;

    INSERT INTO public.ledger (id, booking_id, customer_id, staff_id, type, category, amount, payment_method_code, description, status, meta, created_at)
    VALUES (gen_random_uuid(), p_booking_id, p_customer_id, v_staff, UPPER(p_type), p_category, ABS(p_amount), UPPER(p_payment_method_code), p_description, 'completed', COALESCE(p_meta, '{}'::jsonb), now())
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- 3.1 HANDLE CHECK-IN
CREATE OR REPLACE FUNCTION public.handle_check_in(
    p_room_id uuid,
    p_rental_type text,
    p_customer_id uuid DEFAULT NULL,
    p_customer_name text DEFAULT 'Khách vãng lai',
    p_customer_phone text DEFAULT NULL,
    p_customer_id_card text DEFAULT NULL,
    p_customer_address text DEFAULT NULL,
    p_check_in_at timestamptz DEFAULT now(),
    p_initial_price numeric DEFAULT 0,
    p_deposit_amount numeric DEFAULT 0,
    p_deposit_method text DEFAULT 'CASH',
    p_notes text DEFAULT NULL,
    p_services_used jsonb DEFAULT '[]'::jsonb,
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_customer_id uuid := p_customer_id;
    v_booking_id uuid;
    v_room_number text;
BEGIN
    PERFORM set_config('timezone','Asia/Ho_Chi_Minh', true);
    -- 1. Room Validation
    SELECT room_number INTO v_room_number FROM public.rooms WHERE id = p_room_id AND status = 'available';
    IF v_room_number IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng không sẵn sàng');
    END IF;

    -- 2. Customer Logic (Find or Create)
    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (full_name, phone, id_card, address)
        VALUES (p_customer_name, p_customer_phone, p_customer_id_card, p_customer_address)
        ON CONFLICT DO NOTHING -- Cần logic xịn hơn nếu có phone/id_card
        RETURNING id INTO v_customer_id;
        
        IF v_customer_id IS NULL THEN -- Fallback search
             SELECT id INTO v_customer_id FROM public.customers WHERE phone = p_customer_phone OR id_card = p_customer_id_card LIMIT 1;
        END IF;
    END IF;

    -- 3. Create Booking
    INSERT INTO public.bookings (room_id, customer_id, check_in_at, rental_type, initial_price, deposit_amount, notes, status, services_used)
    VALUES (p_room_id, v_customer_id, p_check_in_at, p_rental_type, p_initial_price, p_deposit_amount, p_notes, 'active', p_services_used)
    RETURNING id INTO v_booking_id;

    -- 4. Update Room Status
    UPDATE public.rooms SET status = 'occupied', current_booking_id = v_booking_id, last_status_change = now() WHERE id = p_room_id;

    -- 5. Record Deposit into Ledger
    IF p_deposit_amount > 0 THEN
        PERFORM public.handle_ledger_entry('DEPOSIT', 'BOOKING_DEPOSIT', p_deposit_amount, p_deposit_method, v_booking_id, v_customer_id, 'Tiền cọc check-in phòng ' || v_room_number, '{}'::jsonb, p_staff_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$$;

-- 3.2 HANDLE CHECKOUT (CORE UNIFIED LOGIC)
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_amount_paid numeric, -- Số tiền thực trả lần này
    p_payment_method text DEFAULT 'CASH',
    p_total_amount numeric DEFAULT NULL, -- Tổng bill (phòng + dịch vụ)
    p_surcharge numeric DEFAULT 0,
    p_notes text DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_room_number text;
    v_room_charge numeric;
    v_service_charge numeric;
    v_staff_id uuid := COALESCE(p_staff_id, auth.uid());
BEGIN
    PERFORM set_config('timezone','Asia/Ho_Chi_Minh', true);
    -- 1. Get Context
    SELECT b.*, r.room_number INTO v_booking 
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    WHERE b.id = p_booking_id;

    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); END IF;
    IF v_booking.status = 'completed' THEN RETURN jsonb_build_object('success', false, 'message', 'Booking đã thanh toán'); END IF;

    -- 2. GHI NHẬN DOANH THU (REVENUE) VÀO LEDGER
    -- A. Tiền phòng (Tính từ booking.room_charge_actual hoặc tham số truyền vào)
    -- Giả sử p_total_amount bao gồm cả phòng và dịch vụ. 
    -- Để đơn giản, ta tách dịch vụ từ booking.services_used
    SELECT COALESCE(SUM((item->>'total')::numeric), 0) INTO v_service_charge
    FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) item;
    
    v_room_charge := COALESCE(p_total_amount, 0) - v_service_charge;
    IF v_room_charge < 0 THEN v_room_charge := 0; END IF;

    -- Ghi Ledger Doanh thu phòng
    IF v_room_charge > 0 THEN
        PERFORM public.handle_ledger_entry('REVENUE', 'ROOM', v_room_charge, NULL, p_booking_id, v_booking.customer_id, 'Tiền phòng ' || v_booking.room_number, '{}'::jsonb, v_staff_id);
    END IF;

    -- Ghi Ledger Doanh thu dịch vụ
    IF v_service_charge > 0 THEN
        PERFORM public.handle_ledger_entry('REVENUE', 'SERVICE', v_service_charge, NULL, p_booking_id, v_booking.customer_id, 'Tiền dịch vụ phòng ' || v_booking.room_number, '{}'::jsonb, v_staff_id);
    END IF;

    -- Ghi Ledger Phụ phí (nếu có)
    IF p_surcharge > 0 THEN
        PERFORM public.handle_ledger_entry('REVENUE', 'SURCHARGE', p_surcharge, NULL, p_booking_id, v_booking.customer_id, 'Phụ phí checkout phòng ' || v_booking.room_number, '{}'::jsonb, v_staff_id);
    END IF;

    -- 3. GHI NHẬN THANH TOÁN (PAYMENT)
    IF p_amount_paid > 0 THEN
        PERFORM public.handle_ledger_entry('PAYMENT', 'BOOKING_PAYMENT', p_amount_paid, p_payment_method, p_booking_id, v_booking.customer_id, 'Thanh toán checkout phòng ' || v_booking.room_number, '{}'::jsonb, v_staff_id);
    END IF;

    -- 4. CẬP NHẬT TRẠNG THÁI BOOKING & PHÒNG
    UPDATE public.bookings 
    SET status = 'completed', check_out_at = now(), final_amount = COALESCE(p_total_amount, 0), payment_method = p_payment_method, notes = p_notes
    WHERE id = p_booking_id;

    UPDATE public.rooms SET status = 'dirty', current_booking_id = NULL, last_status_change = now() WHERE id = v_booking.room_id;

    -- 5. Cập nhật thống kê khách hàng (total_spent, visit_count)
    UPDATE public.customers
    SET total_spent = COALESCE(total_spent, 0) + COALESCE(p_total_amount, 0),
        visit_count = COALESCE(visit_count, 0) + 1,
        last_visit = now()
    WHERE id = v_booking.customer_id;

    RETURN jsonb_build_object('success', true, 'message', 'Checkout thành công');
END;
$$;

-- 3.3 HANDLE DEBT PAYMENT
CREATE OR REPLACE FUNCTION public.handle_debt_payment(
    p_customer_id uuid,
    p_amount numeric,
    p_method text,
    p_cashier_id uuid DEFAULT NULL,
    p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM set_config('timezone','Asia/Ho_Chi_Minh', true);
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Số tiền phải > 0'; END IF;

    PERFORM public.handle_ledger_entry('PAYMENT', 'DEBT_COLLECTION', p_amount, p_method, NULL, p_customer_id, COALESCE(p_note, 'Thu nợ khách hàng'), '{}'::jsonb, p_cashier_id);

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 3.4 HANDLE DEPOSIT (THU THÊM)
CREATE OR REPLACE FUNCTION public.handle_deposit(
    p_booking_id uuid,
    p_amount numeric,
    p_method text DEFAULT 'CASH',
    p_notes text DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
BEGIN
    PERFORM set_config('timezone','Asia/Ho_Chi_Minh', true);
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    
    PERFORM public.handle_ledger_entry('DEPOSIT', 'BOOKING_DEPOSIT', p_amount, p_method, p_booking_id, v_booking.customer_id, COALESCE(p_notes, 'Thu thêm cọc'), '{}'::jsonb, p_staff_id);

    -- Cập nhật deposit_amount trong bookings để UI dễ hiển thị
    UPDATE public.bookings SET deposit_amount = COALESCE(deposit_amount, 0) + p_amount WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. CLEANUP SCHEMA
-- Xóa các bảng không còn sử dụng
DROP TABLE IF EXISTS public.expenses;
DROP TABLE IF EXISTS public.cashflow;
DROP TABLE IF EXISTS public.financial_transactions;
DROP TABLE IF EXISTS public.debt_transactions;
DROP TABLE IF EXISTS public.transactions;

-- Xóa các cột thừa trong bookings
ALTER TABLE public.bookings DROP COLUMN IF EXISTS include_debt;
ALTER TABLE public.bookings DROP COLUMN IF EXISTS merged_debt_amount;
ALTER TABLE public.bookings DROP COLUMN IF EXISTS amount_paid;

-- 5. RLS POLICIES (STRICT, IMMUTABLE LEDGER)
ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ledger' AND policyname = 'ledger_select_authenticated'
    ) THEN
        CREATE POLICY ledger_select_authenticated ON public.ledger
            FOR SELECT
            USING (auth.uid() IS NOT NULL);
    END IF;
    -- No INSERT/UPDATE/DELETE policies -> only RPC SECURITY DEFINER may write

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'customers_select_authenticated'
    ) THEN
        CREATE POLICY customers_select_authenticated ON public.customers
            FOR SELECT
            USING (auth.uid() IS NOT NULL);
    END IF;
END $$;

-- Reload
NOTIFY pgrst, 'reload schema';
