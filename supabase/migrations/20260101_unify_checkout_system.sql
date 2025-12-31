-- MIGRATION: 20260101_unify_checkout_system.sql
-- Description: Unifies all checkout logic into handle_checkout and removes legacy RPCs.
-- This ensures consistent cashflow logging, stock deduction, and room status updates.

-- 1. BỔ SUNG CỘT THIẾU CHO BẢNG BOOKINGS (SCHEMA SYNC)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='room_charge_actual') THEN
        ALTER TABLE public.bookings ADD COLUMN room_charge_actual NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='service_charge_actual') THEN
        ALTER TABLE public.bookings ADD COLUMN service_charge_actual NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='final_amount') THEN
        ALTER TABLE public.bookings ADD COLUMN final_amount NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='total_amount') THEN
        ALTER TABLE public.bookings ADD COLUMN total_amount NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='surcharge') THEN
        ALTER TABLE public.bookings ADD COLUMN surcharge NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name='bookings' AND column_name='payment_method') THEN
        ALTER TABLE public.bookings ADD COLUMN payment_method TEXT;
    END IF;
END $$;

-- 2. DROP ALL LEGACY FUNCTIONS AND OVERLOADS to ensure clean slate
DO $$ 
DECLARE 
    func_name text;
BEGIN
    -- Nuclear drop for handle_checkout
    FOR func_name IN (
        SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'handle_checkout' AND n.nspname = 'public'
    ) LOOP
        EXECUTE 'DROP FUNCTION ' || func_name;
    END LOOP;

    -- Nuclear drop for legacy RPCs
    FOR func_name IN (
        SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname IN ('process_checkout_transaction', 'resolve_checkout') AND n.nspname = 'public'
    ) LOOP
        EXECUTE 'DROP FUNCTION ' || func_name;
    END LOOP;
END $$;

-- 3. CREATE THE UNIFIED get_checkout_details RPC
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
    -- 1. Fetch the booking and the associated room
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
    IF NOT FOUND THEN RETURN json_build_object('error', 'Booking not found'); END IF;
    
    SELECT * INTO v_room FROM public.rooms WHERE id = v_booking.room_id;

    v_check_in_at := v_booking.check_in_at;
    v_duration_interval := v_now - v_check_in_at;

    -- 2. Calculate Room Charge based on rental_type
    DECLARE
        v_hourly numeric;
        v_next_hour numeric;
        v_overnight numeric;
        v_daily numeric;
    BEGIN
        v_hourly := COALESCE(NULLIF(regexp_replace(v_room.prices->>'hourly', '[^\d]', '', 'g'), ''), '0')::numeric;
        v_next_hour := COALESCE(NULLIF(regexp_replace(v_room.prices->>'next_hour', '[^\d]', '', 'g'), ''), '0')::numeric;
        v_overnight := COALESCE(NULLIF(regexp_replace(v_room.prices->>'overnight', '[^\d]', '', 'g'), ''), '0')::numeric;
        v_daily := COALESCE(NULLIF(regexp_replace(v_room.prices->>'daily', '[^\d]', '', 'g'), ''), '0')::numeric;

        IF v_booking.rental_type = 'hourly' THEN
            v_total_hours := ceil(extract(epoch from v_duration_interval) / 3600);
            IF v_total_hours <= 1 THEN
                v_room_charge := v_hourly;
            ELSE
                v_room_charge := v_hourly + ((v_total_hours - 1) * v_next_hour);
            END IF;
        ELSIF v_booking.rental_type = 'overnight' THEN
            v_room_charge := v_overnight;
        ELSIF v_booking.rental_type = 'daily' THEN
            DECLARE
                v_total_days integer;
            BEGIN
                v_total_days := ceil(extract(epoch from v_duration_interval) / 86400);
                v_room_charge := v_total_days * v_daily;
            END;
        END IF;
    END;

    -- 3. Calculate Service Charges
    v_service_charges := COALESCE(v_booking.services_used, '[]'::jsonb);

    -- 4. Calculate Total Amount
    v_total_amount := v_room_charge + (
        SELECT COALESCE(SUM((item->>'total')::numeric), 0)
        FROM jsonb_array_elements(v_service_charges) as item
    );

    -- 5. Format duration string
    DECLARE
        total_minutes integer;
        days integer;
        hours integer;
        minutes integer;
    BEGIN
        total_minutes := extract(epoch from v_duration_interval) / 60;
        days := floor(total_minutes / 1440);
        hours := floor((total_minutes % 1440) / 60);
        minutes := total_minutes % 60;

        v_duration_string := '';
        IF days > 0 THEN v_duration_string := v_duration_string || days || ' ngày '; END IF;
        IF hours > 0 THEN v_duration_string := v_duration_string || hours || ' giờ '; END IF;
        v_duration_string := v_duration_string || minutes || ' phút';
    END;

    -- 6. Return the final JSON object
    RETURN json_build_object(
        'check_in_at', v_check_in_at,
        'duration_string', v_duration_string,
        'room_charge', v_room_charge,
        'service_charges', v_service_charges,
        'total_amount', v_total_amount
    );
END;
$$;

-- 4. CREATE THE UNIFIED handle_checkout RPC
-- Optimized for PostgREST cache and alphabetical parameter sorting
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
    v_room record;
    v_checkout_details json;
    v_final_total_amount numeric;
    v_final_surcharge numeric;
    v_room_charge numeric;
    v_service_charge numeric;
    v_category_id uuid;
    v_category_name text := 'Tiền phòng (Room)';
    v_staff_name text;
    v_service_item jsonb;
BEGIN
    -- A. Get the booking and room details
    SELECT b.*, r.room_number INTO v_booking 
    FROM public.bookings b
    JOIN public.rooms r ON b.room_id = r.id
    WHERE b.id = p_booking_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy thông tin đặt phòng');
    END IF;

    -- Check if booking is already completed
    IF v_booking.status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Phòng này đã được thanh toán trước đó');
    END IF;

    -- B. Determine amounts
    -- Use provided total_amount or calculate if null
    IF p_total_amount IS NOT NULL THEN
        v_final_total_amount := p_total_amount;
    ELSE
        BEGIN
            v_checkout_details := get_checkout_details(p_booking_id);
            v_final_total_amount := (v_checkout_details->>'total_amount')::numeric;
        EXCEPTION WHEN OTHERS THEN
            v_final_total_amount := 0;
        END;
    END IF;

    v_final_surcharge := COALESCE(p_surcharge, 0);
    
    -- Try to calculate room charge for internal records
    BEGIN
        v_checkout_details := get_checkout_details(p_booking_id);
        v_room_charge := (v_checkout_details->>'room_charge')::numeric;
    EXCEPTION WHEN OTHERS THEN
        v_room_charge := v_final_total_amount; -- Fallback
    END;

    v_service_charge := v_final_total_amount - v_room_charge - v_final_surcharge;

    -- C. Update the booking status and check-out time
    UPDATE public.bookings
    SET 
        status = 'completed',
        check_out_at = now(),
        total_amount = v_final_total_amount,
        final_amount = v_final_total_amount,
        surcharge = v_final_surcharge,
        room_charge_actual = v_room_charge,
        service_charge_actual = v_service_charge,
        payment_method = p_payment_method,
        notes = COALESCE(p_notes, notes)
    WHERE id = p_booking_id;

    -- D. Update the room status to 'dirty' and clear booking id
    UPDATE public.rooms
    SET 
        status = 'dirty',
        current_booking_id = NULL,
        last_status_change = now()
    WHERE id = v_booking.room_id;

    -- E. Create an invoice for record-keeping
    INSERT INTO public.invoices (
        booking_id, 
        customer_id, 
        room_id, 
        total_amount, 
        payment_method, 
        created_at
    )
    VALUES (
        p_booking_id,
        v_booking.customer_id,
        v_booking.room_id,
        v_final_total_amount,
        p_payment_method,
        now()
    );

    -- F. Update customer's total spent
    IF v_booking.customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET 
            total_spent = COALESCE(total_spent, 0) + v_final_total_amount,
            visit_count = COALESCE(visit_count, 0) + 1,
            last_visit = NOW()
        WHERE id = v_booking.customer_id;
    END IF;

    -- G. Log to cashflow (income)
    -- Get staff name
    SELECT full_name INTO v_staff_name FROM public.profiles WHERE id = auth.uid();
    IF v_staff_name IS NULL THEN
        v_staff_name := 'Hệ thống (Checkout)';
    END IF;

    -- Get category_id for "Tiền phòng (Room)"
    SELECT id INTO v_category_id 
    FROM public.cashflow_categories 
    WHERE name = v_category_name AND type = 'income' 
    LIMIT 1;

    -- Fallback to any income category
    IF v_category_id IS NULL THEN
        SELECT id INTO v_category_id 
        FROM public.cashflow_categories 
        WHERE type = 'income' 
        LIMIT 1;
    END IF;

    -- Insert into cashflow
    IF v_category_id IS NOT NULL THEN
        INSERT INTO public.cashflow (
            type,
            category,
            category_id,
            category_name,
            content,
            amount,
            payment_method,
            created_by,
            created_by_id,
            created_at
        ) VALUES (
            'income',
            v_category_name,
            v_category_id,
            v_category_name,
            'Thanh toán phòng ' || v_booking.room_number,
            v_final_total_amount,
            p_payment_method,
            v_staff_name,
            auth.uid(),
            NOW()
        );
    END IF;

    -- H. Deduct Services from Stock
    FOR v_service_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_booking.services_used, '[]'::jsonb))
    LOOP
        IF (v_service_item->>'id') IS NOT NULL AND (v_service_item->>'quantity') IS NOT NULL THEN
            -- Deduct from services table
            UPDATE public.services
            SET stock = COALESCE(stock, 0) - (v_service_item->>'quantity')::numeric
            WHERE id = (v_service_item->>'id')::uuid;

            -- Log to stock history
            INSERT INTO public.stock_history (
                service_id,
                action_type,
                quantity,
                details
            ) VALUES (
                (v_service_item->>'id')::uuid,
                'EXPORT',
                (v_service_item->>'quantity')::numeric,
                jsonb_build_object(
                    'reason', 'Bán cho phòng ' || v_booking.room_number,
                    'booking_id', p_booking_id,
                    'action', 'Checkout'
                )
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Thanh toán hoàn tất',
        'total_amount', v_final_total_amount
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi hệ thống: ' || SQLERRM);
END;
$$;

-- 5. GRANTS
GRANT EXECUTE ON FUNCTION public.handle_checkout TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_checkout TO anon;
GRANT EXECUTE ON FUNCTION public.handle_checkout TO service_role;

GRANT EXECUTE ON FUNCTION public.get_checkout_details TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_checkout_details TO anon;
GRANT EXECUTE ON FUNCTION public.get_checkout_details TO service_role;

-- 6. RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
