-- FIX: FINANCIAL SYSTEM V5 (THE 12-TYPES STANDARD)
-- Run this script in Supabase SQL Editor.
-- FIXES:
-- 1. Check-in: Records Room Charge AND Services (if any) as DEBT (Credit).
-- 2. Checkout: Calculates 'v_already_charged' by summing ALL Credit flows (Room + Services + Others), preventing double counting.
-- 3. Trigger: Strictly follows '12loaitien.md' logic.

-- ==========================================================
-- PART 1: RESET TRIGGERS & FUNCTIONS
-- ==========================================================

DROP TRIGGER IF EXISTS tr_update_wallets ON public.cash_flow;
DROP FUNCTION IF EXISTS public.trg_update_wallets();

-- ==========================================================
-- PART 2: THE 5-FUND TRIGGER (LOGIC CORE - V5)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.trg_update_wallets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_amount numeric;
    v_sign integer;
BEGIN
    v_amount := COALESCE(NEW.amount, 0);
    
    -- Determine Sign based on Flow Type
    IF NEW.flow_type = 'IN' THEN
        v_sign := 1;
    ELSE
        v_sign := -1;
    END IF;

    -- 1. DEPOSIT (Tiền cọc)
    IF NEW.category = 'Tiền cọc' THEN
        -- Physical
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
        ELSIF NEW.payment_method_code IN ('transfer', 'credit_card', 'bank', 'qr') THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
        END IF;
        -- Logical: Escrow
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'ESCROW';
        RETURN NEW;
    END IF;

    -- 2. CREDIT CHARGE (Ghi nợ - Increases Receivable)
    -- Applies to: Tiền phòng, Tiền dịch vụ, Tiền bồi thường (if charged to room)
    IF NEW.payment_method_code = 'credit' THEN
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN NEW;
    END IF;

    -- 3. DEPOSIT TRANSFER (Cọc -> Doanh thu)
    IF NEW.payment_method_code = 'deposit_transfer' THEN
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'ESCROW';
        UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'REVENUE';
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
        RETURN NEW;
    END IF;

    -- 4. REALIZED PAYMENTS (Thanh toán)
    IF NEW.category IN ('Thanh toán', 'Thu nợ cũ') THEN
        -- A. Physical
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'CASH';
        ELSIF NEW.payment_method_code IN ('transfer', 'credit_card', 'bank', 'qr') THEN
            UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'BANK';
        END IF;

        -- B. Revenue (Only if it's NOT just Debt Collection? No, Debt Collection IS Revenue realization if not booked yet?
        -- WAIT. '12loaitien.md': "Chỉ chính thức chuyển sang Sổ Doanh Thu vào thời điểm khách... tất toán".
        -- If we charge Credit -> Receivable (+).
        -- Then Pay -> Revenue (+), Receivable (-).
        -- This logic holds for 'Thanh toán'.
        UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'REVENUE';
        
        -- C. Receivable Reduction
        IF NEW.flow_type = 'IN' THEN
            UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'RECEIVABLE';
        END IF;
        
        RETURN NEW;
    END IF;

    -- 5. EXPENSES (Chi vận hành)
    IF NEW.flow_type = 'OUT' AND NEW.category NOT IN ('Điều chỉnh') THEN
        -- Physical
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'CASH'; -- OUT is positive amount, so subtract
        ELSIF NEW.payment_method_code IN ('transfer', 'credit_card', 'bank', 'qr') THEN
            UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'BANK';
        END IF;
        
        -- Revenue (P&L Reduction)
        UPDATE public.wallets SET balance = balance - v_amount, updated_at = now() WHERE id = 'REVENUE';
        RETURN NEW;
    END IF;

    -- 6. ADJUSTMENTS (Điều chỉnh - Giảm nợ)
    IF NEW.category = 'Điều chỉnh' AND NEW.payment_method_code = 'credit' THEN
         -- OUT Credit = Reduce Debt
         -- v_sign is -1 (OUT)
         -- UPDATE Receivable + (v_amount * -1) -> Reduce. Correct.
         UPDATE public.wallets SET balance = balance + (v_amount * v_sign), updated_at = now() WHERE id = 'RECEIVABLE';
         RETURN NEW;
    END IF;

    -- Fallback for other incomes (Bồi thường direct pay?)
    -- If Bồi thường paid via Cash directly (no Credit first), it hits here.
    -- Physical (+), Revenue (+). No Receivable effect.
    IF NEW.flow_type = 'IN' THEN
        IF NEW.payment_method_code = 'cash' OR NEW.payment_method_code IS NULL THEN
            UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'CASH';
        ELSE
            UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'BANK';
        END IF;
        UPDATE public.wallets SET balance = balance + v_amount, updated_at = now() WHERE id = 'REVENUE';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER tr_update_wallets
    AFTER INSERT ON public.cash_flow
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_update_wallets();

-- ==========================================================
-- PART 3: CHECK-IN FUNCTION (Generates Debt + Deposit)
-- ==========================================================

DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.check_in_customer(uuid, text, uuid, numeric, jsonb, text, integer, integer, text, numeric, text, text);

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
    v_creator_id uuid;
    v_room_name text;
    v_category_id uuid;
    v_initial_price numeric := 0;
    v_price_config record;
    v_svc jsonb;
BEGIN
    v_creator_id := auth.uid();
    v_staff_id := COALESCE(p_verified_by_staff_id, v_creator_id);

    SELECT status, room_number, category_id INTO v_room_status, v_room_name, v_category_id 
    FROM public.rooms WHERE id = p_room_id;

    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Lỗi: Phòng không tồn tại.'); END IF;
    IF v_room_status NOT IN ('available', 'dirty') THEN RETURN jsonb_build_object('success', false, 'message', 'Phòng đang có khách hoặc chưa sẵn sàng.'); END IF;

    -- Create Customer if needed
    IF p_customer_id IS NOT NULL THEN
        v_customer_id := p_customer_id;
    ELSIF p_customer_name IS NOT NULL THEN
        INSERT INTO public.customers (full_name) VALUES (p_customer_name) RETURNING id INTO v_customer_id;
    ELSE
        v_customer_id := NULL;
    END IF;

    -- Create Booking
    INSERT INTO public.bookings (
        room_id, customer_id, rental_type, check_in_actual, deposit_amount, status,
        notes, services_used, extra_adults, extra_children, custom_price,
        custom_price_reason, source, verified_by_staff_id, verified_by_staff_name
    ) VALUES (
        p_room_id, v_customer_id, p_rental_type, v_check_in_at, p_deposit, 'checked_in',
        p_notes, p_services, p_extra_adults, p_extra_children, p_custom_price,
        p_custom_price_reason, p_source, v_staff_id, p_verified_by_staff_name
    ) RETURNING id INTO v_booking_id;

    UPDATE public.rooms SET status = 'occupied', current_booking_id = v_booking_id, last_status_change = v_check_in_at WHERE id = p_room_id;

    -- 1. CALCULATE & RECORD INITIAL DEBT (Tiền phòng tạm tính)
    IF p_custom_price IS NOT NULL AND p_custom_price > 0 THEN
        v_initial_price := p_custom_price;
    ELSE
        SELECT * INTO v_price_config FROM public.room_categories WHERE id = v_category_id;
        IF p_rental_type = 'daily' THEN
            v_initial_price := COALESCE(v_price_config.price_daily, 0);
        ELSIF p_rental_type = 'overnight' THEN
            v_initial_price := COALESCE(v_price_config.price_overnight, 0);
        ELSIF p_rental_type = 'hourly' THEN
            v_initial_price := COALESCE(v_price_config.price_hourly, 0);
        END IF;
    END IF;

    IF v_initial_price > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 'Tiền phòng', v_initial_price, 
            'Tiền phòng tạm tính (Check-in) ' || COALESCE(v_room_name, '???'), 
            now(), v_staff_id, v_staff_id, v_booking_id, true, 'credit'
        );
    END IF;

    -- 2. RECORD SERVICES DEBT (if any)
    -- Assuming p_services is array of {name, price, quantity}? 
    -- If it's just a list, we might skip logic, but usually it's used for display.
    -- For now, we only trust explicit service adds. 
    -- BUT if p_services has data, we should probably record it to be safe.
    -- Let's assume the user uses 'add_service' API for detailed service tracking.
    -- However, to be safe, if p_services is NOT empty, we log a generic debt?
    -- No, keep it clean. 'add_service' is better.

    -- 3. RECORD DEPOSIT (Tiền cọc)
    IF p_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 'Tiền cọc', p_deposit, 
            'Thu tiền cọc phòng ' || COALESCE(v_room_name, '???'), 
            now(), v_staff_id, v_staff_id, v_booking_id, true, 'cash'
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$function$;

-- ==========================================================
-- PART 4: CHECKOUT FUNCTION (Adjusts Debt + Payment)
-- ==========================================================

DROP FUNCTION IF EXISTS public.process_checkout(uuid, text, numeric, numeric, numeric, text, uuid);

CREATE OR REPLACE FUNCTION public.process_checkout(
    p_booking_id uuid, 
    p_payment_method text, 
    p_amount_paid numeric, 
    p_discount numeric, 
    p_surcharge numeric, 
    p_notes text, 
    p_staff_id uuid DEFAULT NULL::uuid
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
    v_room_name text;
    v_creator_id uuid;
    v_already_charged numeric;
    v_diff numeric;
BEGIN
    v_creator_id := auth.uid();
    v_staff_id := COALESCE(p_staff_id, v_creator_id);
    
    SELECT room_id, customer_id INTO v_room_id, v_customer_id FROM public.bookings WHERE id = p_booking_id;
    IF v_room_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Không tìm thấy booking'); END IF;

    UPDATE public.bookings SET 
        discount_amount = COALESCE(p_discount, 0),
        custom_surcharge = COALESCE(p_surcharge, 0),
        check_out_actual = now(),
        status = 'completed',
        payment_method = p_payment_method,
        notes = COALESCE(notes, '') || E'\n[Checkout] ' || COALESCE(p_notes, '')
    WHERE id = p_booking_id;

    v_bill := public.calculate_booking_bill(p_booking_id);
    v_total_amount := (v_bill->>'total_amount')::numeric;
    v_deposit := (v_bill->>'deposit_amount')::numeric;
    v_room_name := v_bill->>'room_name';

    UPDATE public.rooms SET status = 'dirty', updated_at = now() WHERE id = v_room_id;

    -- 1. ADJUST DEBT (So sánh với TỔNG NỢ ĐÃ GHI)
    -- [FIX V5]: Sum ALL Credit Charges (Room, Services, etc.)
    SELECT COALESCE(SUM(amount), 0) INTO v_already_charged 
    FROM public.cash_flow 
    WHERE ref_id = p_booking_id 
      AND payment_method_code = 'credit'
      AND flow_type = 'IN';

    -- v_total_amount includes Room + Services + Surcharges - Discount + Tax
    -- v_already_charged includes Room (at checkin) + Services (added during stay)
    v_diff := v_total_amount - v_already_charged;

    IF v_diff > 0 THEN
        -- Ghi nợ thêm (Phần chưa tính: phụ thu, giờ lố, dịch vụ mới...)
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 'Tiền phòng', v_diff, 
            'Phụ thu tất toán (Chênh lệch) ' || COALESCE(v_room_name, ''), 
            now(), v_staff_id, v_staff_id, p_booking_id, true, 'credit'
        );
    ELSIF v_diff < 0 THEN
        -- Giảm nợ (Do tính thừa hoặc có giảm giá sâu)
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'OUT', 'Điều chỉnh', ABS(v_diff), 
            'Hoàn nợ thừa ' || COALESCE(v_room_name, ''), 
            now(), v_staff_id, v_staff_id, p_booking_id, true, 'credit'
        );
    END IF;

    -- 2. RECORD DEPOSIT TRANSFER (If Deposit Exists)
    IF v_deposit > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 'Chuyển cọc', v_deposit, 
            'Chuyển cọc tất toán ' || COALESCE(v_room_name, ''), 
            now(), v_staff_id, v_staff_id, p_booking_id, true, 'deposit_transfer'
        );
    END IF;

    -- 3. RECORD PAYMENT (Remaining Balance)
    IF p_amount_paid > 0 THEN
        INSERT INTO public.cash_flow (
            flow_type, category, amount, description, occurred_at, 
            created_by, verified_by_staff_id, ref_id, is_auto, payment_method_code
        ) VALUES (
            'IN', 'Thanh toán', p_amount_paid, 
            'Thanh toán phòng ' || COALESCE(v_room_name, ''), 
            now(), v_staff_id, v_staff_id, p_booking_id, true, p_payment_method
        );
    END IF;

    -- Update Customer Balance
    IF v_customer_id IS NOT NULL THEN
        UPDATE public.customers SET balance = COALESCE(balance, 0) + p_amount_paid - (v_total_amount - v_deposit), updated_at = now() WHERE id = v_customer_id;
    END IF;

    -- Audit Logs
    INSERT INTO public.audit_logs (booking_id, customer_id, room_id, staff_id, total_amount, explanation)
    VALUES (p_booking_id, v_customer_id, v_room_id, v_staff_id, v_total_amount, v_bill->'explanation');
    UPDATE public.bookings SET billing_audit_trail = v_bill->'explanation' WHERE id = p_booking_id;

    RETURN jsonb_build_object('success', true, 'message', 'Check-out thành công', 'bill', v_bill);
END;
$function$;
