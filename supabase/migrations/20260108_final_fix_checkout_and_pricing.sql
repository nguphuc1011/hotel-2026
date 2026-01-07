-- MIGRATION: FIX HANDLE_CHECKOUT AND PRICING KEYS
-- Date: 2026-01-08
-- Description: Thống nhất RPC handle_checkout và đồng bộ key trả về cho calculate_booking_bill_v2

-- 1. Đảm bảo cột discount_amount tồn tại trong bảng bookings
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'discount_amount') THEN
        ALTER TABLE public.bookings ADD COLUMN discount_amount numeric DEFAULT 0;
    END IF;
END $$;

-- 2. Dọn dẹp các hàm handle_checkout cũ để tránh xung đột signature
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, text, numeric, numeric, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.handle_checkout(uuid, numeric, text, numeric, numeric, text, uuid, numeric, numeric);

-- 3. Tạo hàm handle_checkout chuẩn (9 tham số) khớp với Frontend
CREATE OR REPLACE FUNCTION public.handle_checkout(
    p_booking_id uuid,
    p_amount_paid numeric,
    p_payment_method text DEFAULT 'cash',
    p_surcharge numeric DEFAULT 0,
    p_discount numeric DEFAULT 0,
    p_notes text DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL,
    p_total_amount numeric DEFAULT NULL,
    p_debt_carry_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_room_id uuid;
    v_customer_id uuid;
    v_total_final numeric;
    v_old_balance numeric;
    v_new_balance numeric;
    v_bill jsonb;
BEGIN
    -- Lấy thông tin booking
    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;

    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- Tính toán hóa đơn cuối cùng từ Database (Single Source of Truth)
    -- Cập nhật discount và surcharge vào booking trước khi tính
    UPDATE public.bookings
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        status = 'completed',
        check_out_at = now(),
        payment_method = p_payment_method,
        notes = COALESCE(p_notes, notes)
    WHERE id = p_booking_id;

    -- Gọi hàm tính giá để lấy con số cuối cùng
    v_bill := public.calculate_booking_bill_v2(p_booking_id);
    v_total_final := (v_bill->>'total_final')::numeric;

    -- Cập nhật số dư khách hàng (Balance)
    -- Công thức: Balance mới = Balance cũ - Doanh thu mới + Thanh toán mới
    SELECT COALESCE(balance, 0) INTO v_old_balance FROM public.customers WHERE id = v_customer_id;
    
    v_new_balance := v_old_balance - v_total_final + p_amount_paid;

    UPDATE public.customers
    SET balance = v_new_balance
    WHERE id = v_customer_id;

    -- Cập nhật trạng thái phòng
    UPDATE public.rooms
    SET status = 'dirty', last_status_change = now()
    WHERE id = v_room_id;

    -- Lưu vết vào ledger nếu có thanh toán hoặc phát sinh nợ
    INSERT INTO public.ledger (
        customer_id,
        booking_id,
        amount,
        type,
        payment_method,
        note,
        staff_id
    ) VALUES (
        v_customer_id,
        p_booking_id,
        p_amount_paid,
        'payment',
        p_payment_method,
        COALESCE(p_notes, 'Thanh toán checkout'),
        p_staff_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Check-out thành công',
        'total_final', v_total_final,
        'amount_paid', p_amount_paid,
        'new_balance', v_new_balance
    );
END;
$$;

-- 4. Cập nhật calculate_booking_bill_v2 để trả về các Key mà Frontend đang chờ đợi
CREATE OR REPLACE FUNCTION public.calculate_booking_bill_v2(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    v_custom_surcharge numeric := 0;
    v_discount_amount numeric := 0;
    v_total_amount numeric := 0;
    v_total_final numeric := 0;
    
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
        b.custom_surcharge, b.discount_amount,
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
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    v_strategy := COALESCE(v_booking.strategy, '{}'::jsonb);
    v_check_in := v_booking.check_in_at;
    v_check_out := COALESCE(v_booking.check_out_at, v_now);
    v_customer_balance := v_booking.customer_balance;
    v_custom_surcharge := COALESCE(v_booking.custom_surcharge, 0);
    v_discount_amount := COALESCE(v_booking.discount_amount, 0);
    
    v_diff := v_check_out - v_check_in;
    v_total_hours := extract(epoch from v_diff) / 3600;

    -- 2. LOGIC TÍNH GIÁ GỐC
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

    -- 3. PHỤ PHÍ TỰ ĐỘNG
    IF v_booking.rental_type = 'daily' THEN
        IF v_check_in::time < (v_strategy->>'check_in_time')::time AND v_check_in::date = v_check_out::date THEN
            FOR v_rule IN SELECT * FROM jsonb_array_elements(COALESCE(v_strategy->'early_rules', '[]'::jsonb)) LOOP
                IF v_check_in::time >= (v_rule->>'from')::time AND v_check_in::time <= (v_rule->>'to')::time THEN
                    v_early_surcharge := (v_rule->>'amount')::numeric;
                    EXIT;
                END IF;
            END LOOP;
        END IF;
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
    v_total_amount := v_room_price + v_early_surcharge + v_late_surcharge + v_service_total + v_custom_surcharge;
    v_total_final := v_total_amount - v_discount_amount;
    
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
        -- Các Key chuẩn cho Frontend (CheckOutForm & FolioModal & RoomCard)
        'room_charge', v_room_price,
        'base_price', v_room_price, -- Alias cho tương thích cũ
        'early_surcharge', v_early_surcharge,
        'late_surcharge', v_late_surcharge,
        'custom_surcharge', v_custom_surcharge,
        'discount_amount', v_discount_amount,
        'service_charges', COALESCE(v_services, '[]'::jsonb),
        'service_total', v_service_total,
        'total_amount', v_total_amount,
        'total_bill', v_total_amount, -- Alias cho tương thích cũ
        'total_final', v_total_final,
        'final_amount', v_total_final, -- KEY QUAN TRỌNG CHO ROOMCARD & FOLIO
        'deposit_amount', COALESCE(v_booking.deposit_amount, 0),
        'customer_balance', v_customer_balance,
        'final_payment_required', v_total_final - COALESCE(v_booking.deposit_amount, 0)
    );
END;
$$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
