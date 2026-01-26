-- FIX ALL RPC ERRORS (Comprehensive Patch v2)
-- Run this script in Supabase SQL Editor to fix all parameter mismatches and missing functions.

-- =============================================
-- 1. CORE TRANSACTION FUNCTIONS (Booking & Cash Flow)
-- =============================================

-- FIX: process_checkout (Add p_verified_by_staff_id)
DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid);
CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid,
    p_payment_method text,
    p_amount_paid numeric,
    p_discount numeric,
    p_surcharge numeric,
    p_notes text,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_booking record;
    v_bill jsonb;
    v_staff_id uuid;
    v_room_id uuid;
    v_customer_id uuid;
    v_total_amount numeric;
    v_deposit numeric;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());
    
    SELECT room_id, customer_id INTO v_room_id, v_customer_id
    FROM public.bookings
    WHERE id = p_booking_id;
    
    IF v_room_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking');
    END IF;

    -- Update Booking
    UPDATE public.bookings 
    SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, ''),
        verified_by_staff_id = v_staff_id
    WHERE id = p_booking_id;

    -- Calculate Final Bill
    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;

    -- Update Room Status
    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers 
        SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now()
        WHERE id = v_customer_id;
    END IF;

    -- Record Audit Log
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');

    -- Audit Trail
    UPDATE public.bookings 
    SET billing_audit_trail = v_bill->'explanation'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$;

-- FIX: adjust_customer_balance (Add verified staff params)
DROP FUNCTION IF EXISTS public.adjust_customer_balance(uuid, numeric, text, text, uuid);
CREATE OR REPLACE FUNCTION public.adjust_customer_balance(
    p_customer_id uuid, 
    p_amount numeric, 
    p_type text, 
    p_description text, 
    p_booking_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_old_balance numeric;
    v_new_balance numeric;
    v_cust_exists boolean;
BEGIN
    SELECT true, balance INTO v_cust_exists, v_old_balance
    FROM customers
    WHERE id = p_customer_id
    FOR UPDATE;

    IF v_cust_exists IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Customer not found');
    END IF;

    v_old_balance := COALESCE(v_old_balance, 0);
    v_new_balance := v_old_balance + p_amount;

    UPDATE customers
    SET balance = v_new_balance,
        updated_at = now()
    WHERE id = p_customer_id;

    INSERT INTO customer_transactions (
        customer_id, type, amount, balance_before, balance_after, description, booking_id
    ) VALUES (
        p_customer_id, p_type, p_amount, v_old_balance, v_new_balance, 
        p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
        p_booking_id
    );

    RETURN jsonb_build_object(
        'success', true, 
        'new_balance', v_new_balance, 
        'message', 'Balance updated successfully'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

-- FIX: fn_create_cash_flow (Add verified staff params)
DROP FUNCTION IF EXISTS public.fn_create_cash_flow(text, text, numeric, text, timestamptz);
CREATE OR REPLACE FUNCTION public.fn_create_cash_flow(
    p_flow_type text, 
    p_category text, 
    p_amount numeric, 
    p_description text, 
    p_occurred_at timestamp with time zone DEFAULT now(),
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE v_new_id uuid;
BEGIN
    INSERT INTO public.cash_flow (
        flow_type, category, amount, description, occurred_at, created_by, verified_by_staff_name
    )
    VALUES (
        p_flow_type, p_category, p_amount, 
        p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
        p_occurred_at, 
        COALESCE(p_verified_by_staff_id, auth.uid()),
        p_verified_by_staff_name
    )
    RETURNING id INTO v_new_id;
    RETURN jsonb_build_object('success', true, 'data', v_new_id);
EXCEPTION WHEN OTHERS THEN
    -- Fallback
    INSERT INTO public.cash_flow (flow_type, category, amount, description, occurred_at, created_by)
    VALUES (
        p_flow_type, p_category, p_amount, 
        p_description || COALESCE(' (NV: ' || p_verified_by_staff_name || ')', ''), 
        p_occurred_at, 
        COALESCE(p_verified_by_staff_id, auth.uid())
    )
    RETURNING id INTO v_new_id;
    RETURN jsonb_build_object('success', true, 'data', v_new_id);
END;
$function$;

-- FIX: check_in_customer (Add verified staff params)
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text, uuid, text);
CREATE OR REPLACE FUNCTION public.check_in_customer(
    p_room_id uuid, 
    p_rental_type text, 
    p_customer_id uuid DEFAULT NULL::uuid, 
    p_deposit numeric DEFAULT 0, 
    p_services jsonb DEFAULT '[]'::jsonb, 
    p_customer_name text DEFAULT NULL::text, 
    p_extra_adults integer DEFAULT 0, 
    p_extra_children integer DEFAULT 0, 
    p_notes text DEFAULT NULL::text, 
    p_custom_price numeric DEFAULT NULL::numeric, 
    p_custom_price_reason text DEFAULT NULL::text, 
    p_source text DEFAULT 'direct'::text,
    p_verified_by_staff_id uuid DEFAULT NULL::uuid,
    p_verified_by_staff_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_booking_id uuid;
    v_customer_id uuid;
    v_room_status text;
    v_check_in_at timestamptz := now();
    v_staff_id uuid;
BEGIN
    v_staff_id := COALESCE(p_verified_by_staff_id, auth.uid());

    SELECT status INTO v_room_status FROM public.rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lỗi: Phòng không tồn tại.');
    END IF;
    IF v_room_status NOT IN ('available', 'dirty') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách hoặc chưa sẵn sàng.');
    END IF;

    IF p_customer_id IS NOT NULL THEN
        v_customer_id := p_customer_id;
    ELSIF p_customer_name IS NOT NULL THEN
        INSERT INTO public.customers (full_name)
        VALUES (p_customer_name)
        RETURNING id INTO v_customer_id;
    ELSE
        v_customer_id := NULL;
    END IF;

    INSERT INTO public.bookings (
        room_id, customer_id, rental_type, check_in_actual, deposit_amount, status,
        notes, services_used, extra_adults, extra_children, custom_price,
        custom_price_reason, source, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_room_id, v_customer_id, p_rental_type, v_check_in_at, p_deposit, 'checked_in',
        p_notes, p_services, p_extra_adults, p_extra_children, p_custom_price,
        p_custom_price_reason, p_source, v_staff_id, p_verified_by_staff_name
    ) RETURNING id INTO v_booking_id;

    UPDATE public.rooms
    SET status = 'occupied', current_booking_id = v_booking_id, last_status_change = v_check_in_at
    WHERE id = p_room_id;

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$function$;

-- FIX: import_inventory (Verify p_staff_id)
CREATE OR REPLACE FUNCTION public.import_inventory(
    p_service_id uuid,
    p_qty_buy numeric,
    p_total_amount numeric,
    p_notes text DEFAULT NULL::text,
    p_staff_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_old_stock numeric;
    v_new_stock numeric;
    v_unit_cost numeric;
BEGIN
    SELECT stock_quantity INTO v_old_stock FROM services WHERE id = p_service_id;
    v_old_stock := COALESCE(v_old_stock, 0);
    v_new_stock := v_old_stock + (p_qty_buy * 1);
    
    v_unit_cost := CASE WHEN p_qty_buy > 0 THEN p_total_amount / p_qty_buy ELSE 0 END;
    
    UPDATE services 
    SET stock_quantity = v_new_stock, cost_price = v_unit_cost, updated_at = now()
    WHERE id = p_service_id;

    INSERT INTO inventory_logs (service_id, type, quantity, balance_before, balance_after, notes)
    VALUES (p_service_id, 'IMPORT', p_qty_buy, v_old_stock, v_new_stock, p_notes);

    INSERT INTO cash_flow (flow_type, category, amount, description, created_by)
    VALUES ('OUT', 'NHAP_HANG', p_total_amount, 'Nhập hàng: ' || p_notes, COALESCE(p_staff_id, auth.uid()));

    RETURN jsonb_build_object('success', true);
END;
$function$;

-- =============================================
-- 2. STAFF & SECURITY FUNCTIONS (Settings & Auth)
-- =============================================

-- FIX: fn_manage_staff
CREATE OR REPLACE FUNCTION public.fn_manage_staff(
    p_action text, -- 'CREATE', 'UPDATE', 'DELETE', 'SET_PIN'
    p_id uuid DEFAULT NULL,
    p_username text DEFAULT NULL,
    p_full_name text DEFAULT NULL,
    p_role text DEFAULT NULL,
    p_pin_hash text DEFAULT NULL,
    p_is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_action = 'CREATE' THEN
        IF EXISTS (SELECT 1 FROM public.staff WHERE username = p_username) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Tên đăng nhập đã tồn tại');
        END IF;
        
        INSERT INTO public.staff (username, full_name, role, is_active, pin_hash, password_hash)
        VALUES (p_username, p_full_name, p_role, p_is_active, p_pin_hash, 'PENDING_SETUP');
        
        RETURN jsonb_build_object('success', true, 'message', 'Thêm nhân viên thành công');
        
    ELSIF p_action = 'UPDATE' THEN
        UPDATE public.staff
        SET full_name = COALESCE(p_full_name, full_name),
            role = COALESCE(p_role, role),
            is_active = COALESCE(p_is_active, is_active)
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Cập nhật nhân viên thành công');
        
    ELSIF p_action = 'SET_PIN' THEN
        IF length(p_pin_hash) <> 4 THEN
            RETURN jsonb_build_object('success', false, 'message', 'Mã PIN phải gồm đúng 4 chữ số');
        END IF;

        UPDATE public.staff
        SET pin_hash = p_pin_hash
        WHERE id = p_id;
        
        RETURN jsonb_build_object('success', true, 'message', 'Cài đặt mã PIN thành công');
        
    ELSIF p_action = 'DELETE' THEN
        UPDATE public.staff SET is_active = false WHERE id = p_id;
        RETURN jsonb_build_object('success', true, 'message', 'Đã ngừng kích hoạt tài khoản nhân viên');
    END IF;
    
    RETURN jsonb_build_object('success', false, 'message', 'Hành động không hợp lệ');
END;
$$;

-- FIX: fn_verify_staff_pin
CREATE OR REPLACE FUNCTION public.fn_verify_staff_pin(p_staff_id uuid, p_pin_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_correct_hash text;
BEGIN
    SELECT pin_hash INTO v_correct_hash FROM public.staff WHERE id = p_staff_id;
    RETURN v_correct_hash = p_pin_hash;
END;
$$;

-- FIX: fn_get_security_settings
CREATE OR REPLACE FUNCTION public.fn_get_security_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_result jsonb;
BEGIN
    SELECT jsonb_object_agg(key, is_enabled) INTO v_result FROM public.settings_security;
    RETURN v_result;
END;
$$;

-- FIX: fn_update_security_setting
CREATE OR REPLACE FUNCTION public.fn_update_security_setting(p_key text, p_is_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.settings_security SET is_enabled = p_is_enabled, updated_at = NOW() WHERE key = p_key;
    RETURN jsonb_build_object('success', true, 'message', 'Cập nhật cấu hình thành công');
END;
$$;

-- FIX: fn_staff_login
CREATE OR REPLACE FUNCTION public.fn_staff_login(p_username text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_staff record;
BEGIN
    SELECT id, username, full_name, role, is_active, pin_hash INTO v_staff
    FROM public.staff WHERE username = p_username;

    IF v_staff.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tên đăng nhập không tồn tại');
    END IF;
    IF v_staff.is_active = false THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tài khoản đã bị khóa');
    END IF;
    IF v_staff.pin_hash IS NULL OR v_staff.pin_hash <> p_pin THEN
        RETURN jsonb_build_object('success', false, 'message', 'Mã PIN không chính xác');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Đăng nhập thành công', 'data', jsonb_build_object(
        'id', v_staff.id, 'username', v_staff.username, 'full_name', v_staff.full_name, 'role', v_staff.role
    ));
END;
$$;
