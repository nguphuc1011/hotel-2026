-- ==========================================
-- MASTER SYNC 2026: ĐỒNG BỘ TOÀN DIỆN HỆ THỐNG
-- ==========================================
-- Bệ Hạ hãy chạy toàn bộ file này 1 lần duy nhất để đảm bảo 
-- Database và Mã nguồn khớp nhau 100%.

-- 1. BỔ SUNG CỘT THIẾU (SCHEMA SYNC)
DO $$ 
BEGIN
    -- Bảng customers (Dùng full_name thay vì name để khớp code)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='full_name') THEN
        ALTER TABLE public.customers ADD COLUMN full_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='phone') THEN
        ALTER TABLE public.customers ADD COLUMN phone TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='id_card') THEN
        ALTER TABLE public.customers ADD COLUMN id_card TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='address') THEN
        ALTER TABLE public.customers ADD COLUMN address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='deleted_at') THEN
        ALTER TABLE public.customers ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;

    -- Bảng bookings (Bổ sung các cột tính toán checkout)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='room_charge_actual') THEN
        ALTER TABLE public.bookings ADD COLUMN room_charge_actual NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='service_charge_actual') THEN
        ALTER TABLE public.bookings ADD COLUMN service_charge_actual NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='final_amount') THEN
        ALTER TABLE public.bookings ADD COLUMN final_amount NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='total_amount') THEN
        ALTER TABLE public.bookings ADD COLUMN total_amount NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='surcharge') THEN
        ALTER TABLE public.bookings ADD COLUMN surcharge NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='payment_method') THEN
        ALTER TABLE public.bookings ADD COLUMN payment_method TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='notes') THEN
        ALTER TABLE public.bookings ADD COLUMN notes TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='deleted_at') THEN
        ALTER TABLE public.bookings ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;

    -- Bảng cashflow
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashflow' AND column_name='deleted_at') THEN
        ALTER TABLE public.cashflow ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashflow' AND column_name='category_name') THEN
        ALTER TABLE public.cashflow ADD COLUMN category_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashflow' AND column_name='created_by') THEN
        ALTER TABLE public.cashflow ADD COLUMN created_by TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cashflow' AND column_name='created_by_id') THEN
        ALTER TABLE public.cashflow ADD COLUMN created_by_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- 2. TỐI ƯU TỐC ĐỘ (INDEXES)
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_full_name ON public.customers(full_name);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_deleted_at ON public.bookings(deleted_at);

-- 3. LOGIC ATOMIC CHECK-IN (RPC)
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
    p_notes text DEFAULT NULL,
    p_services_used jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room record;
    v_customer_id uuid := p_customer_id;
    v_booking_id uuid;
    v_new_booking record;
BEGIN
    -- 1. Validate room status
    SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy thông tin phòng');
    END IF;

    IF v_room.status NOT IN ('available', 'reserved') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng đang bận, không thể check-in');
    END IF;

    -- 2. Find or Create Customer
    IF v_customer_id IS NULL THEN
        IF p_customer_phone IS NOT NULL OR p_customer_id_card IS NOT NULL THEN
            SELECT id INTO v_customer_id FROM public.customers 
            WHERE (p_customer_phone IS NOT NULL AND phone = p_customer_phone)
               OR (p_customer_id_card IS NOT NULL AND id_card = p_customer_id_card)
            LIMIT 1;
        END IF;

        IF v_customer_id IS NULL AND p_customer_name = 'Khách vãng lai' THEN
            SELECT id INTO v_customer_id FROM public.customers WHERE full_name = 'Khách vãng lai' LIMIT 1;
        END IF;

        IF v_customer_id IS NULL THEN
            INSERT INTO public.customers (full_name, phone, id_card, address, visit_count)
            VALUES (COALESCE(p_customer_name, 'Khách vãng lai'), p_customer_phone, p_customer_id_card, p_customer_address, 1)
            RETURNING id INTO v_customer_id;
        END IF;
    END IF;

    -- 3. Create Booking
    INSERT INTO public.bookings (
        room_id, customer_id, check_in_at, rental_type, initial_price, deposit_amount, notes, status, services_used
    ) VALUES (
        p_room_id, v_customer_id, p_check_in_at, p_rental_type, p_initial_price, p_deposit_amount, p_notes, 'active', p_services_used
    ) RETURNING * INTO v_new_booking;

    v_booking_id := v_new_booking.id;

    -- 4. Update Room
    UPDATE public.rooms
    SET status = p_rental_type, current_booking_id = v_booking_id, last_status_change = now()
    WHERE id = p_room_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-in thành công', 'booking', to_jsonb(v_new_booking));
END;
$$;

-- 4. LOGIC UNIFIED CHECKOUT (RPC)
CREATE OR REPLACE FUNCTION public.get_checkout_details(p_booking_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking record;
    v_room record;
    v_room_charge numeric := 0;
    v_service_charges jsonb;
    v_total_amount numeric := 0;
    v_check_in_at timestamptz;
    v_now timestamptz := now();
    v_duration_interval interval;
    v_duration_string text;
    v_total_hours integer;
BEGIN
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    SELECT * INTO v_room FROM public.rooms WHERE id = v_booking.room_id;

    v_check_in_at := v_booking.check_in_at;
    v_duration_interval := v_now - v_check_in_at;

    -- Simple Room Charge Calculation
    DECLARE
        v_hourly numeric := COALESCE(NULLIF(regexp_replace(v_room.prices->>'hourly', '[^\d]', '', 'g'), ''), '0')::numeric;
        v_next_hour numeric := COALESCE(NULLIF(regexp_replace(v_room.prices->>'next_hour', '[^\d]', '', 'g'), ''), '0')::numeric;
        v_overnight numeric := COALESCE(NULLIF(regexp_replace(v_room.prices->>'overnight', '[^\d]', '', 'g'), ''), '0')::numeric;
        v_daily numeric := COALESCE(NULLIF(regexp_replace(v_room.prices->>'daily', '[^\d]', '', 'g'), ''), '0')::numeric;
    BEGIN
        IF v_booking.rental_type = 'hourly' THEN
            v_total_hours := ceil(extract(epoch from v_duration_interval) / 3600);
            v_room_charge := v_hourly + (GREATEST(0, v_total_hours - 1) * v_next_hour);
        ELSIF v_booking.rental_type = 'overnight' THEN
            v_room_charge := v_overnight;
        ELSE
            v_room_charge := ceil(extract(epoch from v_duration_interval) / 86400) * v_daily;
        END IF;
    END;

    v_service_charges := COALESCE(v_booking.services_used, '[]'::jsonb);
    v_total_amount := v_room_charge + (SELECT COALESCE(SUM((item->>'total')::numeric), 0) FROM jsonb_array_elements(v_service_charges) as item);

    RETURN json_build_object(
        'room_charge', v_room_charge,
        'service_charges', v_service_charges,
        'total_amount', v_total_amount
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_notes text DEFAULT NULL,
    p_payment_method text DEFAULT 'cash',
    p_surcharge numeric DEFAULT 0,
    p_total_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_booking record;
    v_final_total_amount numeric;
    v_room_charge numeric;
    v_staff_name text;
BEGIN
    SELECT b.*, r.room_number INTO v_booking FROM public.bookings b JOIN public.rooms r ON b.room_id = r.id WHERE b.id = p_booking_id;
    IF v_booking.status = 'completed' THEN RETURN jsonb_build_object('success', true, 'message', 'Đã thanh toán'); END IF;

    v_final_total_amount := COALESCE(p_total_amount, (get_checkout_details(p_booking_id)->>'total_amount')::numeric);
    v_room_charge := (get_checkout_details(p_booking_id)->>'room_charge')::numeric;

    -- Lấy tên nhân viên thực hiện
    SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = auth.uid();
    IF v_staff_name IS NULL THEN
        v_staff_name := 'Hệ thống (Checkout)';
    END IF;

    -- 1. Update Booking
    UPDATE public.bookings SET status = 'completed', check_out_at = now(), total_amount = v_final_total_amount, surcharge = p_surcharge, payment_method = p_payment_method, notes = p_notes WHERE id = p_booking_id;

    -- 2. Update Room
    UPDATE public.rooms SET status = 'dirty', current_booking_id = NULL, last_status_change = now() WHERE id = v_booking.room_id;

    -- 3. Update Customer
    IF v_booking.customer_id IS NOT NULL THEN
        UPDATE public.customers SET total_spent = COALESCE(total_spent, 0) + v_final_total_amount, visit_count = COALESCE(visit_count, 0) + 1, last_visit = NOW() WHERE id = v_booking.customer_id;
    END IF;

    -- 4. Log Cashflow
    INSERT INTO public.cashflow (
        type, category, category_name, content, amount, payment_method, created_by, created_by_id, created_at
    )
    VALUES (
        'income', 'Tiền phòng', 'Tiền phòng', 
        'Thanh toán phòng ' || v_booking.room_number, 
        v_final_total_amount, p_payment_method, v_staff_name, auth.uid(), now()
    );

    RETURN jsonb_build_object('success', true, 'message', 'Thanh toán thành công');
END;
$$;

-- 5. BẢO MẬT, TRIGGER & DỮ LIỆU MẶC ĐỊNH
-- Trigger tự động gán thông tin người tạo cho cashflow
CREATE OR REPLACE FUNCTION public.fn_set_cashflow_user_id()
RETURNS TRIGGER AS $$
DECLARE
    v_staff_name text;
BEGIN
    IF NEW.created_by_id IS NULL THEN
        NEW.created_by_id := auth.uid();
    END IF;
    
    IF NEW.created_by IS NULL AND NEW.created_by_id IS NOT NULL THEN
        SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = NEW.created_by_id;
        NEW.created_by := COALESCE(v_staff_name, 'Hệ thống');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_cashflow_user_id ON public.cashflow;
CREATE TRIGGER trg_set_cashflow_user_id
    BEFORE INSERT ON public.cashflow
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_cashflow_user_id();

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.customers;
CREATE POLICY "Enable all for authenticated" ON public.customers FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.bookings;
CREATE POLICY "Enable all for authenticated" ON public.bookings FOR ALL TO authenticated USING (true);

-- Khởi tạo Khách vãng lai nếu chưa có
INSERT INTO public.customers (full_name, phone)
SELECT 'Khách vãng lai', '0000000000'
WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE full_name = 'Khách vãng lai' LIMIT 1);

-- RELOAD CACHE
NOTIFY pgrst, 'reload config';
