-- ==========================================================
-- MIGRATION: FIX HANDLE_CHECKOUT SIGNATURE & LOGIC
-- Date: 2026-01-08
-- Description: Drop all conflicting versions of handle_checkout and define the canonical version V2.1
--              Matches Frontend params: p_booking_id, p_amount_paid, p_discount, p_notes, p_payment_method, p_staff_id, p_surcharge, p_total_amount
--              Fixes missing discount_amount column and bill calculation logic.
-- ==========================================================

-- 0. PRE-REQUISITE: ENSURE COLUMNS EXIST
-- Add discount_amount if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'discount_amount') THEN
        ALTER TABLE public.bookings ADD COLUMN discount_amount numeric DEFAULT 0;
    END IF;
    
    -- Ensure custom_surcharge is numeric for consistent calculation (it was bigint)
    -- If it exists as bigint, we can cast it or just leave it, but let's ensure we can store numeric values if needed.
    -- For safety, we'll cast to numeric in calculations.
END $$;

-- 1. CLEANUP: DROP ALL POSSIBLE OLD SIGNATURES
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, numeric, text, numeric, numeric, text, uuid, numeric, numeric);
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, numeric, text, numeric, text, text, numeric, uuid);
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, numeric, text, numeric, text, text, numeric);
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, numeric, text, numeric, numeric, numeric);
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, text, text, numeric, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, text, text, numeric, numeric);
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, numeric, numeric, numeric, text, text, numeric, uuid);

-- 2. UPDATE CALCULATION LOGIC (To include Discount & Custom Surcharge)
CREATE OR REPLACE FUNCTION public.calculate_booking_bill_v2(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_booking RECORD;
    v_customer_balance numeric := 0; 
    v_strategy jsonb;
    v_check_in timestamptz;
    v_check_out timestamptz;
    v_now timestamptz := now();
    
    v_room_price numeric := 0;
    v_service_total numeric := 0;
    v_early_surcharge numeric := 0;
    v_late_surcharge numeric := 0;
    v_custom_surcharge numeric := 0; -- New
    v_discount_amount numeric := 0;  -- New
    v_total_amount numeric := 0;
    v_total_final numeric := 0;      -- After discount/surcharge
    
    v_services jsonb;
    v_duration_text text;
    v_rule jsonb;
    v_diff interval;
    v_total_hours numeric;
BEGIN
    -- 1. Lấy dữ liệu Booking
    SELECT 
        b.id, b.room_id, b.customer_id, b.check_in_at, b.check_out_at, 
        b.rental_type, b.initial_price, b.deposit_amount, b.services_used,
        b.custom_surcharge, b.discount_amount, -- Fetch these
        r.room_number,
        rc.prices as category_prices,
        c.full_name as customer_name,
        s.compiled_pricing_strategy as strategy,
        COALESCE(c.balance, 0) as customer_balance
    INTO v_booking
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.room_categories rc ON r.category_id = rc.id
    LEFT JOIN public.customers c ON b.customer_id = c.id
    CROSS JOIN (SELECT compiled_pricing_strategy FROM public.settings WHERE key = 'system_settings') s
    WHERE b.id = p_booking_id;

    IF v_booking.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking: ' || p_booking_id);
    END IF;

    v_strategy := COALESCE(v_booking.strategy, '{}'::jsonb);
    v_check_in := v_booking.check_in_at;
    v_check_out := COALESCE(v_booking.check_out_at, v_now);
    v_customer_balance := v_booking.customer_balance;
    v_custom_surcharge := COALESCE(v_booking.custom_surcharge, 0);
    v_discount_amount := COALESCE(v_booking.discount_amount, 0);
    
    v_diff := v_check_out - v_check_in;
    v_total_hours := extract(epoch from v_diff) / 3600;

    -- 2. LOGIC TÍNH GIÁ GỐC (BASE PRICE)
    IF COALESCE(v_booking.initial_price, 0) > 0 THEN
        v_room_price := v_booking.initial_price;
    ELSE
        IF v_booking.rental_type = 'hourly' THEN
            v_room_price := COALESCE((v_booking.category_prices->>'hourly')::numeric, 0);
            IF v_total_hours > 1 THEN
                v_room_price := v_room_price + (ceil(v_total_hours - 1) * COALESCE((v_booking.category_prices->>'next_hour')::numeric, 0));
            END IF;
        ELSIF v_booking.rental_type = 'overnight' THEN
            v_room_price := COALESCE((v_booking.category_prices->>'overnight')::numeric, 0);
        ELSE
            v_room_price := COALESCE((v_booking.category_prices->>'daily')::numeric, 0);
        END IF;
    END IF;
    v_room_price := COALESCE(v_room_price, 0);

    -- 3. PHỤ PHÍ TỰ ĐỘNG (Sớm/Muộn)
    IF v_booking.rental_type = 'daily' THEN
        -- Sớm
        IF v_check_in::time < (v_strategy->>'check_in_time')::time AND v_check_in::date = v_check_out::date THEN
            FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_strategy->'early_rules', '[]'::jsonb)) LOOP
                IF v_check_in::time >= (v_rule->>'from')::time AND v_check_in::time <= (v_rule->>'to')::time THEN
                    v_early_surcharge := (v_rule->>'amount')::numeric;
                    EXIT;
                END IF;
            END LOOP;
        END IF;
        -- Muộn
        IF v_check_out::time > (v_strategy->>'check_out_time')::time THEN
            FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_strategy->'late_rules', '[]'::jsonb)) LOOP
                IF v_check_out::time >= (v_rule->>'from')::time AND v_check_out::time <= (v_rule->>'to')::time THEN
                    v_late_surcharge := (v_rule->>'amount')::numeric;
                    EXIT;
                END IF;
            END LOOP;
        END IF;
    END IF;

    -- 4. Tiền dịch vụ
    SELECT 
        COALESCE(SUM((item->>'price')::numeric * (item->>'quantity')::numeric), 0),
        jsonb_agg(item)
    INTO v_service_total, v_services
    FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb)) AS item;

    -- 5. Tổng hợp
    -- Total Amount (Gross) = Room + Auto Surcharge + Service + Custom Surcharge
    v_total_amount := v_room_price + v_early_surcharge + v_late_surcharge + v_service_total + v_custom_surcharge;
    
    -- Total Final (Net) = Total Amount - Discount
    v_total_final := v_total_amount - v_discount_amount;
    
    -- Prevent negative total
    IF v_total_final < 0 THEN v_total_final := 0; END IF;

    v_duration_text :=
        CASE WHEN extract(day from v_diff) > 0 THEN extract(day from v_diff) || ' ngày ' ELSE '' END ||
        CASE WHEN extract(hour from v_diff) > 0 THEN extract(hour from v_diff)::int % 24 || ' giờ ' ELSE '' END ||
        (extract(minute from v_diff)::int % 60) || ' phút';

    RETURN jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'room_number', v_booking.room_number,
        'customer_name', v_booking.customer_name,
        'rental_type', v_booking.rental_type,
        'check_in_at', v_check_in,
        'check_out_at', v_check_out,
        'duration_text', v_duration_text,
        'room_charge', v_room_price,
        'early_surcharge', v_early_surcharge,
        'late_surcharge', v_late_surcharge,
        'custom_surcharge', v_custom_surcharge,
        'discount_amount', v_discount_amount,
        'service_charges', COALESCE(v_services, '[]'::jsonb),
        'service_charge', v_service_total, -- Added simple key for easier access
        'surcharge', v_early_surcharge + v_late_surcharge + v_custom_surcharge, -- Total surcharge for ledger
        'total_gross', v_total_amount,
        'total_final', v_total_final,
        'deposit', COALESCE(v_booking.deposit_amount, 0),
        'customer_balance', v_customer_balance,
        'final_payment_required', v_total_final - COALESCE(v_booking.deposit_amount, 0) -- Don't subtract customer balance here, let UI decide logic
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', SQLERRM,
        'detail', SQLSTATE
    );
END;
$function$;


-- 3. DEFINE CANONICAL HANDLE_CHECKOUT (V2.1)
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_amount_paid numeric,              
    p_payment_method text DEFAULT 'cash',
    p_surcharge numeric DEFAULT 0,      -- Phụ phí thủ công (Custom Surcharge)
    p_discount numeric DEFAULT 0,       -- Giảm giá (Discount Amount)
    p_notes text DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL,
    p_total_amount numeric DEFAULT NULL, 
    p_debt_carry_amount numeric DEFAULT 0 
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_booking_revenue numeric;
    v_room_id uuid;
    v_customer_id uuid;
    v_result jsonb;
    v_staff_id uuid;
BEGIN
    v_staff_id := COALESCE(p_staff_id, auth.uid());

    -- 1. Cập nhật Discount/Surcharge vào Booking TRƯỚC khi tính hóa đơn
    UPDATE public.bookings
    SET discount_amount = p_discount, 
        custom_surcharge = p_surcharge
    WHERE id = p_booking_id;

    -- 2. Lấy hóa đơn từ Database (Single Source of Truth)
    v_bill := public.calculate_booking_bill_v2(p_booking_id);
    IF NOT (v_bill->>'success')::boolean THEN
        RETURN v_bill;
    END IF;

    -- 3. Lấy thông tin booking sau khi tính toán
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    v_room_id := v_booking.room_id;
    v_customer_id := v_booking.customer_id;
    v_booking_revenue := (v_bill->>'total_final')::numeric; 

    -- 4. Chốt trạng thái Booking
    UPDATE public.bookings
    SET status = 'completed',
        check_out_at = now(),
        total_amount = v_booking_revenue, 
        notes = COALESCE(notes, '') || E'\n' || COALESCE(p_notes, ''),
        payment_method = p_payment_method
    WHERE id = p_booking_id;

    -- 5. Cập nhật trạng thái Phòng
    UPDATE public.rooms
    SET status = 'dirty', 
        current_booking_id = NULL,
        last_status_change = now()
    WHERE id = v_room_id;

    -- 6. Ghi Ledger 
    -- 6.1 Doanh thu Tiền phòng
    INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
    VALUES (p_booking_id, v_customer_id, 'REVENUE', 'ROOM', (v_bill->>'room_charge')::numeric, 'Doanh thu tiền phòng', v_staff_id, p_payment_method);

    -- 6.2 Doanh thu Dịch vụ
    IF (v_bill->>'service_charge')::numeric > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'REVENUE', 'SERVICE', (v_bill->>'service_charge')::numeric, 'Doanh thu dịch vụ', v_staff_id, p_payment_method);
    END IF;

    -- 6.3 Phụ phí (Gồm cả Auto + Custom)
    IF (v_bill->>'surcharge')::numeric > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'REVENUE', 'SURCHARGE', (v_bill->>'surcharge')::numeric, 'Doanh thu phụ phí', v_staff_id, p_payment_method);
    END IF;
    
    -- 6.4 Giảm giá (Ghi nhận là EXPENSE hoặc giảm doanh thu - Ở đây ta chỉ ghi Revenue Net nên bỏ qua, hoặc ghi log nếu cần)
    -- Nếu muốn track discount:
    IF (v_bill->>'discount_amount')::numeric > 0 THEN
         INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
         VALUES (p_booking_id, v_customer_id, 'EXPENSE', 'DISCOUNT', (v_bill->>'discount_amount')::numeric, 'Giảm giá cho khách', v_staff_id, p_payment_method);
    END IF;

    -- 6.5 Thanh toán
    IF p_amount_paid > 0 THEN
        INSERT INTO public.ledger (booking_id, customer_id, type, category, amount, description, staff_id, payment_method_code)
        VALUES (p_booking_id, v_customer_id, 'PAYMENT', 'ROOM', p_amount_paid, 'Khách thanh toán checkout', v_staff_id, p_payment_method);
    END IF;

    -- 7. Cập nhật Thống kê Khách hàng (Balance đã được Trigger xử lý tự động từ Ledger)
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET total_spent = COALESCE(total_spent, 0) + v_booking_revenue,
            last_visit = now()
        WHERE id = v_customer_id;
    END IF;

    -- 8. Tạo Invoice
    INSERT INTO public.invoices (booking_id, customer_id, room_id, total_amount, payment_method, created_at)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_booking_revenue, p_payment_method, now());

    -- 9. Trả về kết quả
    v_result := jsonb_build_object(
        'success', true,
        'booking_id', p_booking_id,
        'total_revenue', v_booking_revenue,
        'amount_paid', p_amount_paid,
        'new_balance', (SELECT balance FROM public.customers WHERE id = v_customer_id),
        'bill_details', v_bill
    );

    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lỗi RPC handle_checkout: ' || SQLERRM);
END;
$function$;

-- 4. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
